import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { integrations, youtubeAutomations, youtubeReplies } from "@/db/schema";
import { decrypt } from "./crypto";
import { YoutubeApiError, listRecentComments, refreshYoutubeToken, replyToComment, youtubeConfig } from "./youtube";
import { buildReply, pickRule } from "./youtube-rules";

/** A channel is checked at most this often, however often the poll endpoint is called. */
const MIN_POLL_GAP_MS = 2 * 60 * 1000;
/** Look back a little before the last comment we saw, in case YouTube shows a comment late. Replies are de-duplicated. */
const OVERLAP_MS = 15 * 60 * 1000;
/** Each reply costs 50 of the 10,000 daily quota units, so cap replies per check. */
const MAX_REPLIES_PER_POLL = 15;

type Integration = typeof integrations.$inferSelect;
export type PollResult = { checked: boolean; replied: number; failed: number; skipped?: string; error?: string };

/** Atomically claims the channel for one poll so overlapping calls don't double-check it. */
async function claim(row: Integration, force: boolean) {
  const now = new Date().toISOString();
  const threshold = new Date(Date.now() - (force ? 15_000 : MIN_POLL_GAP_MS)).toISOString();
  const res = await db
    .update(integrations)
    .set({ config: sql`coalesce(${integrations.config}, '{}'::jsonb) || jsonb_build_object('lastPolledAt', ${now}::text)` })
    .where(
      and(
        eq(integrations.id, row.id),
        sql`(${integrations.config}->>'lastPolledAt' is null or ${integrations.config}->>'lastPolledAt' < ${threshold})`,
      ),
    )
    .returning({ id: integrations.id });
  return res.length > 0;
}

async function setConfig(id: string, patch: Record<string, string>, extra: Partial<Integration> = {}) {
  await db
    .update(integrations)
    .set({ ...extra, config: sql`coalesce(${integrations.config}, '{}'::jsonb) || ${JSON.stringify(patch)}::jsonb`, updatedAt: new Date() })
    .where(eq(integrations.id, id));
}

export async function pollYoutubeIntegration(row: Integration, opts: { force?: boolean } = {}): Promise<PollResult> {
  const cfg = row.config ?? {};
  const channelId = cfg.channelId;
  if (row.status !== "connected" || !row.secretEnc || !channelId) return { checked: false, replied: 0, failed: 0, skipped: "not connected" };
  if (!youtubeConfig().configured) return { checked: false, replied: 0, failed: 0, skipped: "server not configured" };
  if (!(await claim(row, !!opts.force))) return { checked: false, replied: 0, failed: 0, skipped: "checked recently" };

  const rules = await db
    .select()
    .from(youtubeAutomations)
    .where(and(eq(youtubeAutomations.workspaceId, row.workspaceId), eq(youtubeAutomations.status, "active")));
  if (rules.length === 0) {
    // Nothing to do. Move the marker forward so turning a rule on later doesn't answer old comments.
    await setConfig(row.id, { lastSeenAt: new Date().toISOString() });
    return { checked: false, replied: 0, failed: 0, skipped: "no active automations" };
  }

  let token: string;
  try {
    token = await refreshYoutubeToken(decrypt(row.secretEnc));
  } catch (e) {
    const revoked = e instanceof YoutubeApiError && (e.reason === "invalid_grant" || e.status === 400 || e.status === 401);
    const msg = revoked
      ? "YouTube access expired or was removed. Click “Reconnect” on the Integrations page."
      : `Couldn't reach YouTube: ${e instanceof Error ? e.message : String(e)}`;
    await setConfig(row.id, {}, { lastError: msg, ...(revoked ? { status: "error" as const } : {}) });
    return { checked: false, replied: 0, failed: 0, error: msg };
  }

  let threads;
  try {
    threads = await listRecentComments(token, channelId);
  } catch (e) {
    const msg = `Couldn't read comments: ${e instanceof Error ? e.message : String(e)}`;
    await setConfig(row.id, {}, { lastError: msg });
    return { checked: true, replied: 0, failed: 0, error: msg };
  }

  const lastSeen = cfg.lastSeenAt ? new Date(cfg.lastSeenAt) : new Date(row.connectedAt ?? Date.now());
  const since = new Date(lastSeen.getTime() - OVERLAP_MS);
  const fresh = threads.filter((t) => t.publishedAt > since && t.publishedAt >= (row.connectedAt ?? new Date(0))).reverse(); // oldest first

  let replied = 0;
  let failed = 0;
  let lastError: string | null = null;
  for (const t of fresh) {
    if (replied + failed >= MAX_REPLIES_PER_POLL) break;
    const rule = pickRule(rules, t, channelId);
    if (!rule) continue;
    const text = buildReply(rule, t.authorName);
    const [claimed] = await db
      .insert(youtubeReplies)
      .values({
        workspaceId: row.workspaceId,
        automationId: rule.id,
        commentId: t.threadId,
        videoId: t.videoId,
        authorName: t.authorName,
        commentText: t.text.slice(0, 2000),
        replyText: text,
      })
      .onConflictDoNothing()
      .returning({ id: youtubeReplies.id });
    if (!claimed) continue; // already answered
    try {
      await replyToComment(token, t.threadId, text);
      await db.update(youtubeReplies).set({ status: "sent" }).where(eq(youtubeReplies.id, claimed.id));
      await db
        .update(youtubeAutomations)
        .set({ repliesCount: sql`${youtubeAutomations.repliesCount} + 1`, lastReplyAt: new Date() })
        .where(eq(youtubeAutomations.id, rule.id));
      replied++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await db.update(youtubeReplies).set({ status: "failed", error: msg }).where(eq(youtubeReplies.id, claimed.id));
      failed++;
      lastError = `Last reply failed: ${msg}`;
      if (e instanceof YoutubeApiError && e.reason === "quotaExceeded") {
        lastError = "YouTube's daily limit was reached. Replies resume automatically tomorrow.";
        break;
      }
    }
  }

  const newest = threads.reduce((m, t) => (t.publishedAt > m ? t.publishedAt : m), lastSeen);
  await setConfig(row.id, { lastSeenAt: newest.toISOString() }, { lastError });
  return { checked: true, replied, failed };
}

/** Checks every connected YouTube channel. Safe to call often: each channel is checked at most every 2 minutes. */
export async function pollAllYoutube(budgetMs = 45_000) {
  const started = Date.now();
  const rows = await db.select().from(integrations).where(and(eq(integrations.provider, "youtube"), eq(integrations.status, "connected")));
  // Only channels whose workspace has an active YouTube automation are worth a request.
  const active = rows.length
    ? await db
        .selectDistinct({ ws: youtubeAutomations.workspaceId })
        .from(youtubeAutomations)
        .where(and(eq(youtubeAutomations.status, "active"), inArray(youtubeAutomations.workspaceId, rows.map((r) => r.workspaceId))))
    : [];
  const wanted = new Set(active.map((a) => a.ws));
  let checked = 0;
  let replied = 0;
  let failed = 0;
  for (const row of rows) {
    if (!wanted.has(row.workspaceId)) continue;
    if (Date.now() - started > budgetMs) break;
    try {
      const r = await pollYoutubeIntegration(row);
      if (r.checked) checked++;
      replied += r.replied;
      failed += r.failed;
    } catch (e) {
      console.error("youtube poll failed", row.workspaceId, e);
    }
  }
  return { channels: rows.length, checked, replied, failed };
}
