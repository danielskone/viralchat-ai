"use server";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { conversations, messages, savedReplies, memberships } from "@/db/schema";
import { requireWorkspace } from "@/lib/auth";
import { sendMessage } from "@/lib/messaging";
import { generateConversationReply } from "@/lib/ai";
import { handleInboundMessage } from "@/lib/engine/runtime";
import { recordInbound } from "@/lib/messaging";

async function ownConversation(workspaceId: string, id: string) {
  const [c] = await db.select().from(conversations).where(and(eq(conversations.id, id), eq(conversations.workspaceId, workspaceId))).limit(1);
  if (!c) throw new Error("Conversation not found");
  return c;
}

export async function sendReply(conversationId: string, text: string, internal: boolean): Promise<{ ok: boolean; error?: string }> {
  const ctx = await requireWorkspace();
  const conv = await ownConversation(ctx.workspace.id, conversationId);
  const body = text.trim().slice(0, 2000);
  if (!body) return { ok: false, error: "Message is empty" };
  if (internal) {
    await db.insert(messages).values({
      workspaceId: ctx.workspace.id,
      conversationId,
      direction: "outbound",
      senderType: "agent",
      senderUserId: ctx.user.id,
      body,
      isInternalNote: true,
      status: "simulated",
    });
    revalidatePath("/inbox");
    return { ok: true };
  }
  // A human replying takes over the conversation from automations/AI.
  if (!conv.humanTakeover) await db.update(conversations).set({ humanTakeover: true }).where(eq(conversations.id, conv.id));
  if (!conv.assignedTo) await db.update(conversations).set({ assignedTo: ctx.user.id }).where(eq(conversations.id, conv.id));
  const r = await sendMessage({ conversationId, workspaceId: ctx.workspace.id, text: body, senderType: "agent", senderUserId: ctx.user.id });
  revalidatePath("/inbox");
  return r;
}

export async function suggestReply(conversationId: string): Promise<{ ok: boolean; text?: string; error?: string }> {
  const ctx = await requireWorkspace();
  await ownConversation(ctx.workspace.id, conversationId);
  const r = await generateConversationReply(ctx.workspace.id, conversationId);
  return r.ok ? { ok: true, text: r.text } : { ok: false, error: r.error };
}

export async function updateConversation(
  conversationId: string,
  patch: { humanTakeover?: boolean; status?: "open" | "pending" | "closed"; priority?: boolean; assignedTo?: string | null; labels?: string[] },
) {
  const ctx = await requireWorkspace();
  await ownConversation(ctx.workspace.id, conversationId);
  if (patch.assignedTo) {
    const [m] = await db
      .select()
      .from(memberships)
      .where(and(eq(memberships.workspaceId, ctx.workspace.id), eq(memberships.userId, patch.assignedTo)))
      .limit(1);
    if (!m) throw new Error("Assignee is not a member of this workspace");
  }
  const clean: Partial<typeof conversations.$inferInsert> = {};
  if (patch.humanTakeover !== undefined) clean.humanTakeover = patch.humanTakeover;
  if (patch.status) clean.status = patch.status;
  if (patch.priority !== undefined) clean.priority = patch.priority;
  if (patch.assignedTo !== undefined) clean.assignedTo = patch.assignedTo;
  if (patch.labels) clean.labels = patch.labels.map((l) => l.trim().toLowerCase()).filter(Boolean).slice(0, 20);
  await db.update(conversations).set(clean).where(eq(conversations.id, conversationId));
  revalidatePath("/inbox");
}

export async function markRead(conversationId: string) {
  const ctx = await requireWorkspace();
  await db
    .update(conversations)
    .set({ unreadCount: 0 })
    .where(and(eq(conversations.id, conversationId), eq(conversations.workspaceId, ctx.workspace.id)));
}

export async function createSavedReply(form: FormData) {
  const ctx = await requireWorkspace();
  const title = String(form.get("title") ?? "").trim().slice(0, 80);
  const body = String(form.get("body") ?? "").trim().slice(0, 2000);
  if (!title || !body) return;
  await db.insert(savedReplies).values({ workspaceId: ctx.workspace.id, title, body });
  revalidatePath("/inbox");
}

/** Demo conversations only: lets you play the customer to see automations and AI respond. */
export async function simulateDemoInbound(conversationId: string, text: string) {
  const ctx = await requireWorkspace();
  const conv = await ownConversation(ctx.workspace.id, conversationId);
  if (conv.channel !== "demo") throw new Error("Only demo conversations can be simulated");
  const msg = await recordInbound(conv, text.slice(0, 1000), null);
  if (msg) {
    await handleInboundMessage({
      workspaceId: ctx.workspace.id,
      conversation: { ...conv, lastInboundAt: new Date() },
      contactCreated: false,
      conversationCreated: false,
      text,
    });
  }
  revalidatePath("/inbox");
}
