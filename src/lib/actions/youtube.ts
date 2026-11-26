"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, count, eq, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { automations, integrations, workspaces, youtubeAutomations } from "@/db/schema";
import { requireWorkspace } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { decrypt } from "@/lib/crypto";
import { getPlan } from "@/lib/plans";
import { revokeYoutubeToken } from "@/lib/youtube";
import { pollYoutubeIntegration } from "@/lib/youtube-server";
import { DEFAULT_YT_REPLIES, YT_MAX_REPLIES, parseVideoId, validateYtRule } from "@/lib/youtube-rules";

async function own(workspaceId: string, id: string) {
  const [row] = await db
    .select()
    .from(youtubeAutomations)
    .where(and(eq(youtubeAutomations.id, id), eq(youtubeAutomations.workspaceId, workspaceId)))
    .limit(1);
  if (!row) redirect("/youtube");
  return row;
}

export async function createYoutubeAutomation() {
  const ctx = await requireWorkspace();
  const [row] = await db
    .insert(youtubeAutomations)
    .values({ workspaceId: ctx.workspace.id, name: "YouTube comment reply", keywords: ["link"], replies: DEFAULT_YT_REPLIES })
    .returning({ id: youtubeAutomations.id });
  await audit(ctx.workspace.id, ctx.user.id, "youtube_automation.create", row!.id);
  redirect(`/youtube/${row!.id}`);
}

export type YtSaveState = { ok?: boolean; error?: string; problems?: string[] } | null;

export async function saveYoutubeAutomation(_: YtSaveState, form: FormData): Promise<YtSaveState> {
  const ctx = await requireWorkspace();
  const row = await own(ctx.workspace.id, String(form.get("id")));
  const name = String(form.get("name") ?? "").trim() || "YouTube comment reply";
  const anyWord = form.get("anyWord") === "any";
  const keywords = String(form.get("keywords") ?? "")
    .split(/[,\n]/)
    .map((k) => k.trim())
    .filter(Boolean)
    .slice(0, 30);
  const videoMode = form.get("videoMode") === "specific" ? "specific" : "any";
  const rawVideos = String(form.get("videos") ?? "")
    .split(/[\s,]+/)
    .map((v) => v.trim())
    .filter(Boolean);
  const videoIds = [...new Set(rawVideos.map(parseVideoId).filter((v): v is string => !!v))].slice(0, 50);
  const bad = rawVideos.filter((v) => !parseVideoId(v));
  const replies = form
    .getAll("reply")
    .map((r) => String(r).trim())
    .filter(Boolean)
    .slice(0, YT_MAX_REPLIES);
  const link = String(form.get("link") ?? "").trim();

  const problems: string[] = [];
  if (videoMode === "specific" && videoIds.length === 0) problems.push("Paste at least one video link, or choose “Any video”.");
  if (bad.length) problems.push(`These don't look like YouTube video links: ${bad.slice(0, 3).join(", ")}`);

  await db
    .update(youtubeAutomations)
    .set({ name, anyWord, keywords, videoIds: videoMode === "specific" ? videoIds : [], replies, link, updatedAt: new Date() })
    .where(eq(youtubeAutomations.id, row.id));
  revalidatePath(`/youtube/${row.id}`);
  revalidatePath("/youtube");

  if (row.status === "active") {
    const live = [...problems, ...validateYtRule({ anyWord, keywords, replies, link })];
    if (live.length) {
      await db.update(youtubeAutomations).set({ status: "paused" }).where(eq(youtubeAutomations.id, row.id));
      return { ok: false, error: "Saved, but paused because it isn't ready:", problems: live };
    }
  }
  if (problems.length) return { ok: false, error: "Saved, with a problem:", problems };
  return { ok: true };
}

export async function setYoutubeStatus(id: string, status: "active" | "paused"): Promise<{ ok: boolean; error?: string; problems?: string[] }> {
  const ctx = await requireWorkspace();
  const row = await own(ctx.workspace.id, id);
  if (status === "active") {
    const [yt] = await db
      .select()
      .from(integrations)
      .where(and(eq(integrations.workspaceId, ctx.workspace.id), eq(integrations.provider, "youtube")))
      .limit(1);
    const problems = validateYtRule(row);
    if (yt?.status !== "connected") problems.unshift("Connect your YouTube channel first (Integrations page).");
    if (problems.length) return { ok: false, error: "This automation can't go live yet:", problems };

    const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, ctx.workspace.id)).limit(1);
    const [[a], [b]] = (await Promise.all([
      db.select({ n: count() }).from(automations).where(and(eq(automations.workspaceId, ctx.workspace.id), eq(automations.status, "active"))),
      db
        .select({ n: count() })
        .from(youtubeAutomations)
        .where(and(eq(youtubeAutomations.workspaceId, ctx.workspace.id), eq(youtubeAutomations.status, "active"), ne(youtubeAutomations.id, id))),
    ])) as [[{ n: number }], [{ n: number }]];
    const limit = getPlan(ws?.plan).limits.activeAutomations;
    if (a.n + b.n >= limit) return { ok: false, error: `Your plan allows ${limit} active automations (Instagram, Facebook and YouTube together). Pause one or upgrade on the Billing page.` };

    // If nothing was live, start from now so old comments aren't answered.
    if (b.n === 0 && yt) {
      await db
        .update(integrations)
        .set({ config: sql`coalesce(${integrations.config}, '{}'::jsonb) || jsonb_build_object('lastSeenAt', ${new Date().toISOString()}::text)` })
        .where(eq(integrations.id, yt.id));
    }
  }
  await db.update(youtubeAutomations).set({ status, updatedAt: new Date() }).where(eq(youtubeAutomations.id, id));
  await audit(ctx.workspace.id, ctx.user.id, `youtube_automation.${status}`, id);
  revalidatePath("/youtube");
  revalidatePath(`/youtube/${id}`);
  return { ok: true };
}

export async function deleteYoutubeAutomation(form: FormData) {
  const ctx = await requireWorkspace("admin");
  const id = String(form.get("id"));
  await db.delete(youtubeAutomations).where(and(eq(youtubeAutomations.id, id), eq(youtubeAutomations.workspaceId, ctx.workspace.id)));
  await audit(ctx.workspace.id, ctx.user.id, "youtube_automation.delete", id);
  revalidatePath("/youtube");
  redirect("/youtube");
}

export type YtCheckState = { message: string; tone: "success" | "danger" | "info" } | null;

export async function checkYoutubeNow(_: YtCheckState): Promise<YtCheckState> {
  const ctx = await requireWorkspace();
  const [yt] = await db
    .select()
    .from(integrations)
    .where(and(eq(integrations.workspaceId, ctx.workspace.id), eq(integrations.provider, "youtube")))
    .limit(1);
  if (!yt || yt.status !== "connected") return { tone: "danger", message: "Connect your YouTube channel first." };
  const r = await pollYoutubeIntegration(yt, { force: true });
  revalidatePath("/youtube");
  if (r.error) return { tone: "danger", message: r.error };
  if (r.skipped === "no active automations") return { tone: "info", message: "Nothing is live yet. Turn an automation on first." };
  if (r.skipped === "checked recently") return { tone: "info", message: "Just checked a few seconds ago. Try again in a moment." };
  if (r.skipped) return { tone: "info", message: `Not checked: ${r.skipped}.` };
  if (r.replied || r.failed) return { tone: r.failed ? "danger" : "success", message: `Replied to ${r.replied} new comment${r.replied === 1 ? "" : "s"}${r.failed ? `, ${r.failed} failed (see below)` : ""}.` };
  return { tone: "success", message: "Checked. No new matching comments right now." };
}

export async function disconnectYoutube() {
  const ctx = await requireWorkspace("admin");
  const [row] = await db
    .select()
    .from(integrations)
    .where(and(eq(integrations.workspaceId, ctx.workspace.id), eq(integrations.provider, "youtube")))
    .limit(1);
  if (row?.secretEnc) {
    try {
      await revokeYoutubeToken(decrypt(row.secretEnc));
    } catch {
      /* already gone */
    }
  }
  if (row) {
    await db.update(integrations).set({ status: "disconnected", secretEnc: null, lastError: null, updatedAt: new Date() }).where(eq(integrations.id, row.id));
    await db.update(youtubeAutomations).set({ status: "paused" }).where(and(eq(youtubeAutomations.workspaceId, ctx.workspace.id), eq(youtubeAutomations.status, "active")));
  }
  await audit(ctx.workspace.id, ctx.user.id, "integration.youtube.disconnect");
  revalidatePath("/integrations");
  revalidatePath("/youtube");
  redirect("/integrations");
}
