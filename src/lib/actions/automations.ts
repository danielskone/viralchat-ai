"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, asc, count, desc, eq, gte } from "drizzle-orm";
import { db } from "@/db";
import { automationRuns, automations, contacts, conversations, messages, workspaces, type FlowGraph } from "@/db/schema";
import { requireWorkspace } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { workspacePlan } from "@/lib/plans";
import { BLANK_GRAPH, TEMPLATES } from "@/lib/templates";
import { validateGraph } from "@/lib/engine/executor";
import { getOrCreateConversation, recordInbound } from "@/lib/messaging";
import { handleInboundMessage, startRun } from "@/lib/engine/runtime";

export async function createAutomation(form: FormData) {
  const ctx = await requireWorkspace();
  const key = String(form.get("template") ?? "");
  const tpl = TEMPLATES.find((t) => t.key === key);
  const [a] = await db
    .insert(automations)
    .values({
      workspaceId: ctx.workspace.id,
      name: tpl?.name ?? "Untitled automation",
      description: tpl?.description,
      triggerType: tpl?.triggerType ?? "dm_keyword",
      channels: tpl?.channels ?? ["instagram", "messenger"],
      keywords: tpl?.keywords ?? [],
      publicReply: tpl?.publicReply ?? null,
      graph: structuredClone(tpl?.graph ?? BLANK_GRAPH),
      templateKey: tpl?.key ?? null,
    })
    .returning();
  await audit(ctx.workspace.id, ctx.user.id, "automation.create", a!.id, { template: key || null });
  redirect(`/automations/${a!.id}`);
}

const nodeSchema = z.object({
  id: z.string().max(64),
  type: z.enum(["trigger", "send_message", "ask_question", "condition", "add_tag", "remove_tag", "set_field", "lead_score", "set_stage", "ai_reply", "delay", "notify", "handoff", "webhook", "end"]),
  position: z.object({ x: z.number(), y: z.number() }),
  data: z.record(z.string(), z.unknown()),
});
const saveSchema = z.object({
  name: z.string().trim().min(1).max(120),
  triggerType: z.enum(["dm_keyword", "comment_keyword", "story_reply", "new_conversation"]),
  channels: z.array(z.enum(["instagram", "messenger"])).min(1, "Pick at least one channel"),
  keywords: z.array(z.string().trim().max(60)).max(30),
  matchType: z.enum(["exact", "contains", "starts_with"]),
  postId: z.string().trim().max(100).nullable(),
  publicReply: z.string().trim().max(300).nullable(),
  graph: z.object({
    nodes: z.array(nodeSchema).max(200),
    edges: z.array(z.object({ id: z.string().max(140), source: z.string(), target: z.string(), sourceHandle: z.string().nullable().optional() })).max(400),
  }),
});
export type SavePayload = z.infer<typeof saveSchema>;

async function own(workspaceId: string, id: string) {
  const [a] = await db.select().from(automations).where(and(eq(automations.id, id), eq(automations.workspaceId, workspaceId))).limit(1);
  if (!a) throw new Error("Automation not found");
  return a;
}

export async function saveAutomation(id: string, payload: SavePayload): Promise<{ ok: boolean; error?: string; problems?: string[] }> {
  const ctx = await requireWorkspace();
  const a = await own(ctx.workspace.id, id);
  const parsed = saveSchema.safeParse(payload);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };
  const d = parsed.data;
  const keywords = d.keywords.filter(Boolean);
  const problems = validateGraph(d.graph as FlowGraph);
  if ((d.triggerType === "dm_keyword" || d.triggerType === "comment_keyword") && keywords.length === 0) problems.unshift("Add at least one trigger keyword.");
  if (a.status === "active" && problems.length) return { ok: false, error: "Fix these before saving an active automation:", problems };
  await db
    .update(automations)
    .set({ ...d, keywords, postId: d.postId || null, publicReply: d.publicReply || null, graph: d.graph as FlowGraph, updatedAt: new Date() })
    .where(eq(automations.id, id));
  revalidatePath(`/automations/${id}`);
  return { ok: true, problems };
}

export async function setAutomationStatus(id: string, status: "active" | "paused" | "draft"): Promise<{ ok: boolean; error?: string; problems?: string[] }> {
  const ctx = await requireWorkspace();
  const a = await own(ctx.workspace.id, id);
  if (status === "active") {
    const problems = validateGraph(a.graph);
    if ((a.triggerType === "dm_keyword" || a.triggerType === "comment_keyword") && a.keywords.length === 0) problems.unshift("Add at least one trigger keyword.");
    if (problems.length) return { ok: false, error: "This automation can't be activated yet:", problems };
    const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, ctx.workspace.id)).limit(1);
    const [{ n }] = (await db
      .select({ n: count() })
      .from(automations)
      .where(and(eq(automations.workspaceId, ctx.workspace.id), eq(automations.status, "active")))) as [{ n: number }];
    const limit = workspacePlan(ws).limits.activeAutomations;
    if (n >= limit) return { ok: false, error: `Your plan allows ${limit} active automations. Pause one or upgrade on the Billing page.` };
  }
  await db.update(automations).set({ status, updatedAt: new Date() }).where(eq(automations.id, id));
  await audit(ctx.workspace.id, ctx.user.id, `automation.${status}`, id);
  revalidatePath("/automations");
  revalidatePath(`/automations/${id}`);
  return { ok: true };
}

export async function deleteAutomation(form: FormData) {
  const ctx = await requireWorkspace("admin");
  const id = String(form.get("id"));
  await db.delete(automations).where(and(eq(automations.id, id), eq(automations.workspaceId, ctx.workspace.id)));
  await audit(ctx.workspace.id, ctx.user.id, "automation.delete", id);
  revalidatePath("/automations");
  redirect("/automations");
}

export async function duplicateAutomation(form: FormData) {
  const ctx = await requireWorkspace();
  const a = await own(ctx.workspace.id, String(form.get("id")));
  const [copy] = await db
    .insert(automations)
    .values({ ...a, id: undefined, name: `${a.name} (copy)`, status: "draft", runsCount: 0, createdAt: undefined, updatedAt: undefined })
    .returning();
  redirect(`/automations/${copy!.id}`);
}

// ───────── Test mode (simulator) ─────────

async function testConversation(workspaceId: string) {
  let [c] = await db.select().from(contacts).where(and(eq(contacts.workspaceId, workspaceId), eq(contacts.source, "test"))).limit(1);
  if (!c) [c] = await db.insert(contacts).values({ workspaceId, name: "Test Contact", source: "test" }).returning();
  const { conversation } = await getOrCreateConversation(workspaceId, c!.id, "test");
  return conversation;
}

export type TestTranscript = {
  messages: { id: string; direction: string; senderType: string; body: string; createdAt: string }[];
  log: { at: string; nodeType: string; status: string; message: string }[];
  status: string | null;
  contact: { tags: string[]; leadScore: number; stage: string; fields: Record<string, string>; email: string | null };
};

async function transcript(workspaceId: string, automationId: string): Promise<TestTranscript> {
  const conv = await testConversation(workspaceId);
  const [msgs, [run], [c]] = await Promise.all([
    db.select().from(messages).where(eq(messages.conversationId, conv.id)).orderBy(asc(messages.createdAt)).limit(200),
    db
      .select()
      .from(automationRuns)
      .where(and(eq(automationRuns.conversationId, conv.id), eq(automationRuns.automationId, automationId)))
      .orderBy(desc(automationRuns.startedAt))
      .limit(1),
    db.select().from(contacts).where(eq(contacts.id, conv.contactId)).limit(1),
  ]);
  return {
    messages: msgs.map((m) => ({ id: m.id, direction: m.direction, senderType: m.senderType, body: m.body, createdAt: m.createdAt.toISOString() })),
    log: (run?.log ?? []).map((l) => ({ at: l.at, nodeType: l.nodeType, status: l.status, message: l.message })),
    status: run ? (run.error ? `${run.status}: ${run.error}` : run.status) : null,
    contact: { tags: c?.tags ?? [], leadScore: c?.leadScore ?? 0, stage: c?.stage ?? "new_lead", fields: c?.customFields ?? {}, email: c?.email ?? null },
  };
}

export async function testSend(automationId: string, text: string, asComment: boolean): Promise<TestTranscript> {
  const ctx = await requireWorkspace();
  const a = await own(ctx.workspace.id, automationId);
  const conv = await testConversation(ctx.workspace.id);
  const body = text.trim().slice(0, 1000);
  if (asComment) {
    // Simulated public comment → private-reply DM
    await db.insert(messages).values({ workspaceId: ctx.workspace.id, conversationId: conv.id, direction: "inbound", senderType: "contact", body: `💬 Comment: ${body}`, status: "received" });
    const { matchKeyword } = await import("@/lib/engine/matcher");
    if (a.triggerType === "comment_keyword" && matchKeyword(body, a.keywords, a.matchType)) {
      if (a.publicReply) {
        await db.insert(messages).values({ workspaceId: ctx.workspace.id, conversationId: conv.id, direction: "outbound", senderType: "automation", body: `↩︎ Public reply: ${a.publicReply}`, status: "simulated" });
      }
      await startRun(a, { ...conv, lastInboundAt: new Date() }, { triggerText: body, trigger: "comment_keyword", commentId: "test-comment" }, true);
    } else {
      await db.insert(messages).values({ workspaceId: ctx.workspace.id, conversationId: conv.id, direction: "outbound", senderType: "automation", body: "(No match: this comment doesn't trigger the automation)", status: "simulated", isInternalNote: true });
    }
  } else {
    await recordInbound(conv, body, null);
    const r = await handleInboundMessage({
      workspaceId: ctx.workspace.id,
      conversation: { ...conv, lastInboundAt: new Date() },
      contactCreated: false,
      conversationCreated: false,
      text: body,
      onlyAutomationId: a.id,
      isTest: true,
    });
    if (r.action === "no_match") {
      await db.insert(messages).values({ workspaceId: ctx.workspace.id, conversationId: conv.id, direction: "outbound", senderType: "automation", body: "(No match: this message doesn't trigger the automation)", status: "simulated", isInternalNote: true });
    }
  }
  return transcript(ctx.workspace.id, automationId);
}

export async function testReset(automationId: string): Promise<TestTranscript> {
  const ctx = await requireWorkspace();
  await own(ctx.workspace.id, automationId);
  const conv = await testConversation(ctx.workspace.id);
  await db.delete(messages).where(eq(messages.conversationId, conv.id));
  await db.delete(automationRuns).where(eq(automationRuns.conversationId, conv.id));
  await db.update(contacts).set({ tags: [], leadScore: 0, temperature: "cold", stage: "new_lead", customFields: {}, email: null, phone: null, name: "Test Contact" }).where(eq(contacts.id, conv.contactId));
  await db.update(conversations).set({ humanTakeover: false }).where(eq(conversations.id, conv.id));
  return transcript(ctx.workspace.id, automationId);
}

export async function testState(automationId: string) {
  const ctx = await requireWorkspace();
  await own(ctx.workspace.id, automationId);
  return transcript(ctx.workspace.id, automationId);
}

export async function recentRuns(automationId: string) {
  const ctx = await requireWorkspace();
  await own(ctx.workspace.id, automationId);
  return db
    .select()
    .from(automationRuns)
    .where(and(eq(automationRuns.automationId, automationId), eq(automationRuns.isTest, false), gte(automationRuns.startedAt, new Date(Date.now() - 30 * 86400_000))))
    .orderBy(desc(automationRuns.startedAt))
    .limit(50);
}
