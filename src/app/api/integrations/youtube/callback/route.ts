import { NextResponse } from "next/server";
import { and, eq, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { integrations } from "@/db/schema";
import { getWorkspaceContext } from "@/lib/auth";
import { encrypt, verifyState } from "@/lib/crypto";
import { audit } from "@/lib/audit";
import { exchangeYoutubeCode, getMyChannel, revokeYoutubeToken, YOUTUBE_SCOPES } from "@/lib/youtube";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const back = (q: string) => NextResponse.redirect(new URL(`/integrations?${q}`, req.url));
  const fail = (m: string) => back("error=" + encodeURIComponent(m));
  if (url.searchParams.get("error")) return fail(url.searchParams.get("error") === "access_denied" ? "YouTube connection was cancelled." : url.searchParams.get("error")!);

  const ctx = await getWorkspaceContext();
  const state = verifyState<{ ws: string; u: string; p: string }>(url.searchParams.get("state") ?? "");
  if (!ctx || !state || state.p !== "yt" || state.ws !== ctx.workspace.id || state.u !== ctx.user.id) return fail("Invalid or expired authorization state. Please try again.");
  const code = url.searchParams.get("code");
  if (!code) return fail("Missing authorization code");

  try {
    const tok = await exchangeYoutubeCode(code);
    if (!tok.scope.split(" ").includes(YOUTUBE_SCOPES[0]!)) return fail("Please tick the box that lets ViralChat manage your YouTube comments, then try again.");
    if (!tok.refresh_token) return fail("Google didn't return long-term access. Remove ViralChat at myaccount.google.com/permissions and connect again.");
    const channel = await getMyChannel(tok.access_token);
    if (!channel) return fail("That Google account has no YouTube channel. Pick the account (or Brand Account) that owns your channel.");

    const [taken] = await db
      .select({ ws: integrations.workspaceId })
      .from(integrations)
      .where(and(eq(integrations.provider, "youtube"), eq(integrations.status, "connected"), sql`${integrations.config}->>'channelId' = ${channel.id}`, ne(integrations.workspaceId, ctx.workspace.id)))
      .limit(1);
    if (taken) {
      await revokeYoutubeToken(tok.refresh_token);
      return fail("That YouTube channel is already connected to another ViralChat AI workspace.");
    }

    const now = new Date();
    const values = {
      workspaceId: ctx.workspace.id,
      provider: "youtube" as const,
      status: "connected" as const,
      pageId: null,
      pageName: channel.title,
      secretEnc: encrypt(tok.refresh_token),
      config: {
        channelId: channel.id,
        channelTitle: channel.title,
        channelHandle: channel.handle ?? "",
        channelThumb: channel.thumb ?? "",
        lastSeenAt: now.toISOString(),
      },
      scopes: tok.scope.split(" "),
      lastError: null,
      connectedAt: now,
      connectedBy: ctx.user.id,
      updatedAt: now,
    };
    await db.insert(integrations).values(values).onConflictDoUpdate({ target: [integrations.workspaceId, integrations.provider], set: values });
    await audit(ctx.workspace.id, ctx.user.id, "integration.youtube.connect", channel.id, { title: channel.title });
    return NextResponse.redirect(new URL("/youtube?connected=1", req.url));
  } catch (e) {
    return fail(e instanceof Error ? e.message : "YouTube authorization failed");
  }
}
