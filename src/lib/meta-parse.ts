/**
 * Pure parser for Meta webhook payloads (Messenger "page" object and Instagram "instagram" object).
 * Kept free of I/O so it can be unit-tested against real payload shapes.
 */

export type InboundEvent =
  | {
      kind: "message";
      channel: "instagram" | "messenger";
      accountId: string; // page id (messenger) or IG professional account id (instagram)
      senderId: string; // PSID or IGSID
      messageId: string;
      text: string;
      timestamp: number;
      isStoryReply: boolean;
      isStoryMention: boolean;
      postbackPayload?: string;
    }
  | {
      kind: "comment";
      channel: "instagram" | "messenger";
      accountId: string;
      commentId: string;
      postId: string | null;
      text: string;
      fromId: string;
      fromName: string | null;
      timestamp: number;
    };

type Json = Record<string, unknown>;
const obj = (v: unknown): Json => (v && typeof v === "object" ? (v as Json) : {});
const str = (v: unknown): string | null => (typeof v === "string" ? v : typeof v === "number" ? String(v) : null);

export function parseMetaWebhook(body: unknown): InboundEvent[] {
  const root = obj(body);
  const object = root.object;
  if (object !== "page" && object !== "instagram") return [];
  const channel = object === "instagram" ? "instagram" : "messenger";
  const events: InboundEvent[] = [];

  for (const rawEntry of Array.isArray(root.entry) ? root.entry : []) {
    const entry = obj(rawEntry);
    const accountId = str(entry.id);
    if (!accountId) continue;

    for (const rawMsg of Array.isArray(entry.messaging) ? entry.messaging : []) {
      const m = obj(rawMsg);
      const senderId = str(obj(m.sender).id);
      const timestamp = Number(m.timestamp ?? Date.now());
      if (!senderId || senderId === accountId) continue; // ignore our own page/account

      const message = obj(m.message);
      if (Object.keys(message).length) {
        if (message.is_echo || message.is_deleted) continue;
        const mid = str(message.mid);
        if (!mid) continue;
        const attachments = Array.isArray(message.attachments) ? message.attachments.map(obj) : [];
        const isStoryMention = attachments.some((a) => a.type === "story_mention");
        const isStoryReply = Boolean(obj(message.reply_to).story);
        const quickPayload = str(obj(message.quick_reply).payload) ?? undefined;
        events.push({
          kind: "message",
          channel,
          accountId,
          senderId,
          messageId: mid,
          text: str(message.text) ?? (isStoryMention ? "[Story mention]" : attachments.length ? "[Attachment]" : ""),
          timestamp,
          isStoryReply,
          isStoryMention,
          postbackPayload: quickPayload,
        });
        continue;
      }

      const postback = obj(m.postback);
      if (Object.keys(postback).length) {
        events.push({
          kind: "message",
          channel,
          accountId,
          senderId,
          messageId: str(postback.mid) ?? `postback-${senderId}-${timestamp}`,
          text: str(postback.title) ?? str(postback.payload) ?? "",
          timestamp,
          isStoryReply: false,
          isStoryMention: false,
          postbackPayload: str(postback.payload) ?? undefined,
        });
      }
    }

    for (const rawChange of Array.isArray(entry.changes) ? entry.changes : []) {
      const change = obj(rawChange);
      const value = obj(change.value);
      if (object === "instagram" && change.field === "comments") {
        const from = obj(value.from);
        const commentId = str(value.id);
        const fromId = str(from.id);
        if (!commentId || !fromId || fromId === accountId) continue;
        events.push({
          kind: "comment",
          channel: "instagram",
          accountId,
          commentId,
          postId: str(obj(value.media).id),
          text: str(value.text) ?? "",
          fromId,
          fromName: str(from.username),
          timestamp: Number(entry.time ?? Date.now()) * (Number(entry.time) < 1e12 ? 1000 : 1),
        });
      }
      if (object === "page" && change.field === "feed" && value.item === "comment" && value.verb === "add") {
        const from = obj(value.from);
        const commentId = str(value.comment_id);
        const fromId = str(from.id);
        if (!commentId || !fromId || fromId === accountId) continue;
        events.push({
          kind: "comment",
          channel: "messenger",
          accountId,
          commentId,
          postId: str(value.post_id),
          text: str(value.message) ?? "",
          fromId,
          fromName: str(from.name),
          timestamp: Number(value.created_time ?? entry.time ?? Date.now() / 1000) * 1000,
        });
      }
    }
  }
  return events;
}

export const STANDARD_WINDOW_MS = 24 * 3600_000;
export const HUMAN_AGENT_WINDOW_MS = 7 * 24 * 3600_000;

/**
 * Meta messaging policy: free-form messages are allowed within 24h of the user's last message.
 * Human agents may reply up to 7 days with the HUMAN_AGENT tag. Automations may not message outside 24h.
 */
export function messagingWindow(lastInboundAt: Date | null, sender: "automation" | "agent", now = Date.now()) {
  if (!lastInboundAt) return { allowed: false as const, reason: "The contact has not messaged you yet, so Meta does not allow a DM." };
  const age = now - lastInboundAt.getTime();
  if (age <= STANDARD_WINDOW_MS) return { allowed: true as const, tag: null };
  if (sender === "agent" && age <= HUMAN_AGENT_WINDOW_MS) return { allowed: true as const, tag: "HUMAN_AGENT" as const };
  return {
    allowed: false as const,
    reason:
      sender === "agent"
        ? "More than 7 days since the contact's last message. Meta does not allow replies until they message again."
        : "More than 24 hours since the contact's last message. Automated messages are blocked by Meta policy.",
  };
}
