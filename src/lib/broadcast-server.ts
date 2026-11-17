import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { contacts, conversations, type BroadcastAudience } from "@/db/schema";
import { pickRecipients } from "./broadcast";

export async function audienceFor(workspaceId: string, a: BroadcastAudience, now = Date.now()) {
  const channels = a.channel === "all" ? (["instagram", "messenger"] as const) : ([a.channel] as const);
  const conds = [
    eq(conversations.workspaceId, workspaceId),
    inArray(conversations.channel, [...channels]),
    eq(contacts.optedOut, false),
    eq(contacts.isDemo, false),
  ];
  if (a.tag) conds.push(sql`${a.tag} = any(${contacts.tags})`);
  if (a.stage) conds.push(eq(contacts.stage, a.stage));
  const rows = await db
    .select({
      conversationId: conversations.id,
      contactId: contacts.id,
      channel: conversations.channel,
      lastInboundAt: conversations.lastInboundAt,
      name: contacts.name,
    })
    .from(conversations)
    .innerJoin(contacts, eq(contacts.id, conversations.contactId))
    .where(and(...conds));
  return pickRecipients(rows, now);
}
