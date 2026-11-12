import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { contacts, conversations, integrations, messages, type Channel, type Conversation, type Integration } from "@/db/schema";
import { decrypt } from "./crypto";
import { fetchProfile, sendDirectMessage, sendPrivateReply } from "./meta";
import { messagingWindow } from "./meta-parse";

export async function getMetaIntegration(workspaceId: string): Promise<(Integration & { pageToken: string }) | null> {
  const [row] = await db
    .select()
    .from(integrations)
    .where(and(eq(integrations.workspaceId, workspaceId), eq(integrations.provider, "meta")))
    .limit(1);
  if (!row || row.status !== "connected" || !row.secretEnc || !row.pageId) return null;
  return { ...row, pageToken: decrypt(row.secretEnc) };
}

/** Finds the workspace integration that owns a webhook entry id (page id or IG account id). */
export async function findIntegrationForAccount(channel: "instagram" | "messenger", accountId: string) {
  const [row] = await db
    .select()
    .from(integrations)
    .where(
      and(
        eq(integrations.provider, "meta"),
        eq(integrations.status, "connected"),
        channel === "instagram" ? eq(integrations.instagramAccountId, accountId) : eq(integrations.pageId, accountId),
      ),
    )
    .limit(1);
  if (!row?.secretEnc || !row.pageId) return null;
  return { ...row, pageToken: decrypt(row.secretEnc) };
}

export async function upsertSocialContact(opts: {
  workspaceId: string;
  channel: "instagram" | "messenger";
  externalId: string;
  pageToken?: string;
  fallbackName?: string | null;
}) {
  const idCol = opts.channel === "instagram" ? contacts.instagramId : contacts.messengerId;
  const [existing] = await db
    .select()
    .from(contacts)
    .where(and(eq(contacts.workspaceId, opts.workspaceId), eq(idCol, opts.externalId)))
    .limit(1);
  if (existing) return { contact: existing, created: false };

  const profile = opts.pageToken ? await fetchProfile(opts.channel, opts.externalId, opts.pageToken) : null;
  const [created] = await db
    .insert(contacts)
    .values({
      workspaceId: opts.workspaceId,
      name: profile?.name ?? opts.fallbackName ?? (opts.channel === "instagram" ? "Instagram user" : "Messenger user"),
      avatarUrl: profile?.avatarUrl ?? null,
      instagramUsername: profile?.username ?? (opts.channel === "instagram" ? opts.fallbackName ?? null : null),
      source: opts.channel,
      instagramId: opts.channel === "instagram" ? opts.externalId : null,
      messengerId: opts.channel === "messenger" ? opts.externalId : null,
    })
    .onConflictDoNothing()
    .returning();
  if (created) return { contact: created, created: true };
  const [again] = await db
    .select()
    .from(contacts)
    .where(and(eq(contacts.workspaceId, opts.workspaceId), eq(idCol, opts.externalId)))
    .limit(1);
  return { contact: again!, created: false };
}

export async function getOrCreateConversation(workspaceId: string, contactId: string, channel: Channel) {
  const [existing] = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.contactId, contactId), eq(conversations.channel, channel)))
    .limit(1);
  if (existing) return { conversation: existing, created: false };
  const [created] = await db
    .insert(conversations)
    .values({ workspaceId, contactId, channel })
    .onConflictDoNothing()
    .returning();
  if (created) return { conversation: created, created: true };
  const [again] = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.contactId, contactId), eq(conversations.channel, channel)))
    .limit(1);
  return { conversation: again!, created: false };
}

/** Records an inbound message. Returns null if this external message id was already stored (webhook retry). */
export async function recordInbound(conv: Conversation, body: string, externalId: string | null, at = new Date()) {
  const [msg] = await db
    .insert(messages)
    .values({
      workspaceId: conv.workspaceId,
      conversationId: conv.id,
      direction: "inbound",
      senderType: "contact",
      body,
      externalId,
      status: "received",
      createdAt: at,
    })
    .onConflictDoNothing()
    .returning();
  if (!msg) return null; // already stored (webhook retry or concurrent delivery)
  await db
    .update(conversations)
    .set({
      lastMessageAt: at,
      lastInboundAt: at,
      lastMessagePreview: body.slice(0, 140),
      unreadCount: sql`${conversations.unreadCount} + 1`,
      status: "open",
    })
    .where(eq(conversations.id, conv.id));
  await db.update(contacts).set({ lastActivityAt: at }).where(eq(contacts.id, conv.contactId));
  return msg!;
}

export type SendOptions = {
  conversationId: string;
  workspaceId: string;
  text: string;
  senderType: "agent" | "automation" | "ai";
  senderUserId?: string | null;
  automationRunId?: string | null;
  /** Reply privately to this comment instead of a normal DM (comment-to-DM). */
  commentId?: string | null;
};

/**
 * Delivers an outbound message through the conversation's channel and records it.
 * Demo/test conversations are never sent externally; their messages are stored as "simulated".
 */
export async function sendMessage(opts: SendOptions): Promise<{ ok: boolean; error?: string }> {
  const [conv] = await db
    .select({ conv: conversations, contact: contacts })
    .from(conversations)
    .innerJoin(contacts, eq(contacts.id, conversations.contactId))
    .where(and(eq(conversations.id, opts.conversationId), eq(conversations.workspaceId, opts.workspaceId)))
    .limit(1);
  if (!conv) return { ok: false, error: "Conversation not found" };

  let status: "sent" | "failed" | "simulated" = "sent";
  let error: string | undefined;
  let externalId: string | null = null;
  const channel = conv.conv.channel;

  if (channel === "demo" || channel === "test") {
    status = "simulated";
  } else if (conv.contact.optedOut) {
    status = "failed";
    error = "Contact has opted out of messages.";
  } else {
    const integ = await getMetaIntegration(opts.workspaceId);
    const recipientId = channel === "instagram" ? conv.contact.instagramId : conv.contact.messengerId;
    if (!integ) {
      status = "failed";
      error = "Meta is not connected. Connect Instagram & Messenger on the Integrations page.";
    } else if (channel === "instagram" && !integ.instagramAccountId) {
      status = "failed";
      error = "No Instagram professional account is linked to the connected Facebook Page.";
    } else if (opts.commentId) {
      try {
        const r = await sendPrivateReply({ pageId: integ.pageId!, pageToken: integ.pageToken, commentId: opts.commentId, text: opts.text });
        externalId = r.message_id ?? null;
      } catch (e) {
        status = "failed";
        error = e instanceof Error ? e.message : String(e);
      }
    } else if (!recipientId) {
      status = "failed";
      error = "Contact has no messaging id for this channel.";
    } else {
      const window = messagingWindow(conv.conv.lastInboundAt, opts.senderType === "agent" ? "agent" : "automation");
      if (!window.allowed) {
        status = "failed";
        error = window.reason;
      } else {
        try {
          const r = await sendDirectMessage({
            pageId: integ.pageId!,
            pageToken: integ.pageToken,
            recipientId,
            text: opts.text,
            tag: window.tag,
          });
          externalId = r.message_id ?? null;
        } catch (e) {
          status = "failed";
          error = e instanceof Error ? e.message : String(e);
        }
      }
    }
  }

  const now = new Date();
  await db.insert(messages).values({
    workspaceId: opts.workspaceId,
    conversationId: opts.conversationId,
    direction: "outbound",
    senderType: opts.senderType,
    senderUserId: opts.senderUserId ?? null,
    body: opts.text,
    status,
    error: error ?? null,
    externalId,
    automationRunId: opts.automationRunId ?? null,
    createdAt: now,
  });
  await db
    .update(conversations)
    .set({ lastMessageAt: now, lastMessagePreview: opts.text.slice(0, 140) })
    .where(eq(conversations.id, opts.conversationId));
  return status === "failed" ? { ok: false, error } : { ok: true };
}
