"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import OpenAI from "openai";
import { db } from "@/db";
import { integrations } from "@/db/schema";
import { requireWorkspace } from "@/lib/auth";
import { decrypt, encrypt } from "@/lib/crypto";
import { subscribePage, unsubscribePage, MetaApiError, metaConfig } from "@/lib/meta";
import { audit } from "@/lib/audit";
import { META_PAGES_COOKIE, readPendingPages } from "@/lib/meta-pending";

export async function selectMetaPage(form: FormData) {
  const ctx = await requireWorkspace("admin");
  const pending = await readPendingPages();
  if (!pending || pending.ws !== ctx.workspace.id) redirect("/integrations?error=Authorization%20expired.%20Please%20connect%20again.");
  const page = pending.pages.find((p) => p.id === form.get("pageId"));
  if (!page) redirect("/integrations?error=Page%20not%20found");

  // Another workspace can't claim a page that's already connected elsewhere (webhook routing must be unique).
  const [taken] = await db
    .select({ ws: integrations.workspaceId })
    .from(integrations)
    .where(and(eq(integrations.provider, "meta"), eq(integrations.pageId, page.id), eq(integrations.status, "connected")))
    .limit(1);
  if (taken && taken.ws !== ctx.workspace.id) redirect("/integrations?error=" + encodeURIComponent("That Page is already connected to another ViralChat AI workspace."));

  let lastError: string | null = null;
  try {
    await subscribePage(page.id, page.token);
  } catch (e) {
    lastError = `Webhook subscription failed: ${e instanceof MetaApiError ? e.message : String(e)}`;
  }
  const values = {
    workspaceId: ctx.workspace.id,
    provider: "meta" as const,
    status: lastError ? ("error" as const) : ("connected" as const),
    pageId: page.id,
    pageName: page.name,
    instagramAccountId: page.igId,
    instagramUsername: page.igUsername,
    secretEnc: encrypt(page.token),
    scopes: pending.scopes,
    lastError,
    connectedAt: new Date(),
    connectedBy: ctx.user.id,
    updatedAt: new Date(),
  };
  await db.insert(integrations).values(values).onConflictDoUpdate({ target: [integrations.workspaceId, integrations.provider], set: values });
  (await cookies()).delete(META_PAGES_COOKIE);
  await audit(ctx.workspace.id, ctx.user.id, "integration.meta.connect", page.id, { instagram: page.igUsername });
  redirect(lastError ? "/integrations?error=" + encodeURIComponent(lastError) : "/integrations?connected=meta");
}

export async function disconnectMeta() {
  const ctx = await requireWorkspace("admin");
  const [row] = await db.select().from(integrations).where(and(eq(integrations.workspaceId, ctx.workspace.id), eq(integrations.provider, "meta"))).limit(1);
  if (row?.secretEnc && row.pageId && metaConfig().configured) {
    try {
      await unsubscribePage(row.pageId, decrypt(row.secretEnc));
    } catch {
      /* token may already be revoked */
    }
  }
  await db
    .update(integrations)
    .set({ status: "disconnected", secretEnc: null, lastError: null, updatedAt: new Date() })
    .where(and(eq(integrations.workspaceId, ctx.workspace.id), eq(integrations.provider, "meta")));
  await audit(ctx.workspace.id, ctx.user.id, "integration.meta.disconnect");
  revalidatePath("/integrations");
}

export async function checkMetaConnection() {
  const ctx = await requireWorkspace("admin");
  const [row] = await db.select().from(integrations).where(and(eq(integrations.workspaceId, ctx.workspace.id), eq(integrations.provider, "meta"))).limit(1);
  if (!row?.secretEnc || !row.pageId) return;
  const version = metaConfig().version;
  try {
    const res = await fetch(`https://graph.facebook.com/${version}/${row.pageId}?fields=id,name&access_token=${decrypt(row.secretEnc)}`, { cache: "no-store" });
    const json = (await res.json()) as { error?: { message: string } };
    if (!res.ok || json.error) throw new Error(json.error?.message ?? `HTTP ${res.status}`);
    await db.update(integrations).set({ status: "connected", lastError: null, updatedAt: new Date() }).where(eq(integrations.id, row.id));
  } catch (e) {
    await db
      .update(integrations)
      .set({ status: "error", lastError: `Connection check failed: ${e instanceof Error ? e.message : String(e)}. Reconnect to refresh permissions.`, updatedAt: new Date() })
      .where(eq(integrations.id, row.id));
  }
  revalidatePath("/integrations");
}

export type KeyState = { error?: string; ok?: string } | undefined;

export async function saveOpenAIKey(_: KeyState, form: FormData): Promise<KeyState> {
  const ctx = await requireWorkspace("admin");
  const key = String(form.get("apiKey") ?? "").trim();
  if (!key.startsWith("sk-")) return { error: "That doesn't look like an OpenAI API key (it should start with sk-)." };
  try {
    await new OpenAI({ apiKey: key }).models.list();
  } catch (e) {
    return { error: `OpenAI rejected the key: ${e instanceof Error ? e.message : String(e)}` };
  }
  const values = { workspaceId: ctx.workspace.id, provider: "openai" as const, status: "connected" as const, secretEnc: encrypt(key), lastError: null, connectedAt: new Date(), connectedBy: ctx.user.id, updatedAt: new Date() };
  await db.insert(integrations).values(values).onConflictDoUpdate({ target: [integrations.workspaceId, integrations.provider], set: values });
  await audit(ctx.workspace.id, ctx.user.id, "integration.openai.connect");
  revalidatePath("/integrations");
  return { ok: "OpenAI key verified and saved (encrypted)." };
}

export async function removeOpenAIKey() {
  const ctx = await requireWorkspace("admin");
  await db
    .update(integrations)
    .set({ status: "disconnected", secretEnc: null, updatedAt: new Date() })
    .where(and(eq(integrations.workspaceId, ctx.workspace.id), eq(integrations.provider, "openai")));
  await audit(ctx.workspace.id, ctx.user.id, "integration.openai.disconnect");
  revalidatePath("/integrations");
}
