import "server-only";
import { db } from "@/db";
import { webhookEvents } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import type { InboundEvent } from "./meta-parse";
import { findIntegrationForAccount, getOrCreateConversation, recordInbound, upsertSocialContact } from "./messaging";
import { findCommentAutomation, handleInboundMessage, startRun } from "./engine/runtime";
import { replyToComment } from "./meta";
import { logActivity } from "./audit";

/** Processes one parsed Meta webhook event end-to-end. Idempotent per message/comment id. */
export async function processMetaEvent(ev: InboundEvent) {
  const integ = await findIntegrationForAccount(ev.channel, ev.accountId);
  if (!integ) return { skipped: "no connected workspace for account " + ev.accountId };
  const workspaceId = integ.workspaceId;

  if (ev.kind === "message") {
    const { contact, created: contactCreated } = await upsertSocialContact({
      workspaceId,
      channel: ev.channel,
      externalId: ev.senderId,
      pageToken: integ.pageToken,
    });
    if (contactCreated) await logActivity(workspaceId, contact.id, "created", `Contact created from ${ev.channel} DM`);
    const { conversation, created } = await getOrCreateConversation(workspaceId, contact.id, ev.channel);
    const msg = await recordInbound(conversation, ev.text, ev.messageId, new Date(ev.timestamp));
    if (!msg) return { skipped: "duplicate message" };
    const fresh = { ...conversation, lastInboundAt: new Date(ev.timestamp) };
    return handleInboundMessage({
      workspaceId,
      conversation: fresh,
      contactCreated,
      conversationCreated: created,
      text: ev.postbackPayload ?? ev.text,
      isStoryReply: ev.isStoryReply || ev.isStoryMention,
    });
  }

  // Comment event — dedupe on comment id
  const inserted = await db
    .insert(webhookEvents)
    .values({ source: "meta-comment", dedupeKey: ev.commentId, payload: ev as unknown as Record<string, unknown> })
    .onConflictDoNothing()
    .returning({ id: webhookEvents.id });
  if (!inserted.length) return { skipped: "duplicate comment" };

  const automation = await findCommentAutomation(workspaceId, ev.channel, ev.text, ev.postId);
  if (!automation) {
    await markProcessed(ev.commentId);
    return { skipped: "no matching comment automation" };
  }

  const { contact, created: contactCreated } = await upsertSocialContact({
    workspaceId,
    channel: ev.channel,
    externalId: ev.fromId,
    pageToken: integ.pageToken,
    fallbackName: ev.fromName,
  });
  if (contactCreated) await logActivity(workspaceId, contact.id, "created", `Contact created from ${ev.channel} comment`);
  const { conversation } = await getOrCreateConversation(workspaceId, contact.id, ev.channel);

  let publicReplyError: string | null = null;
  if (automation.publicReply) {
    try {
      await replyToComment({ channel: ev.channel, commentId: ev.commentId, pageToken: integ.pageToken, text: automation.publicReply });
    } catch (e) {
      publicReplyError = e instanceof Error ? e.message : String(e);
    }
  }
  const r = await startRun(automation, conversation, {
    triggerText: ev.text,
    trigger: "comment_keyword",
    commentId: ev.commentId,
    postId: ev.postId,
    publicReplyError,
  });
  await markProcessed(ev.commentId, publicReplyError);
  return { action: "automation", runId: r?.runId };
}

async function markProcessed(commentId: string, error?: string | null) {
  await db
    .update(webhookEvents)
    .set({ processedAt: new Date(), error: error ?? null })
    .where(and(eq(webhookEvents.source, "meta-comment"), eq(webhookEvents.dedupeKey, commentId)));
}
