"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, asc, count, desc, eq, gte } from "drizzle-orm";
import { db } from "@/db";
import { automationRuns, automations, contacts, conversations, messages, workspaces, youtubeAutomations, type FlowGraph } from "@/db/schema";
import { requireWorkspace } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { getPlan } from "@/lib/plans";
import { BLANK_GRAPH, TEMPLATES } from "@/lib/templates";
import { validateGraph } from "@/lib/engine/executor";
import { getOrCreateConversation, recordInbound } from "@/lib/messaging";
import { handleInboundMessage, startRun } from "@/lib/engine/runtime";
import {
  BUTTON_MAX,
  MAX_LINKS,
  MAX_PUBLIC_REPLIES,
  TEXT_MAX,
  commentMatches,
  defaultCommentFlow,
  normalizeUrl,
  pickPublicReply,
  validateCommentFlow,
  type CommentFlow,
} from "@/lib/comment-flow";
import { getMetaIntegration } from "@/lib/messaging";
import { listInstagramMedia, listPagePosts, type RecentPost } from "@/lib/meta";

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

/** New Comment-to-DM automation using the simple setup screen. */
export async function createCommentDm() {
  const ctx = await requireWorkspace();
  const [a] = await db
    .insert(automations)
    .values({
      workspaceId: ctx.workspace.id,
      name: "Comment to DM",
      description: "Replies to comments and sends a DM with your link.",
      triggerType: "comment_keyword",
      channels: ["instagram", "messenger"],
      keywords: ["link"],
      graph: structuredClone(BLANK_GRAPH),
      quick: defaultCommentFlow(),
      templateKey: "comment-dm-quick",
    })
    .returning();
  await audit(ctx.workspace.id, ctx.user.id, "automation.create", a!.id, { template: "comment-dm-quick" });
  redirect(`/automations/${a!.id}`);
}

const txt = (max: number) => z.string().max(max * 2).transform((v) => v.slice(0, max));
const flowSchema = z.object({
  postMode: z.enum(["specific", "any", "next"]),
  postIds: z.array(z.string().max(100)).max(30),
  posts: z
    .array(z.object({ id: z.string().max(100), thumb: z.string().max(2000).nullable(), caption: txt(200), channel: z.enum(["instagram", "messenger"]) }))
    .max(30),
  anyWord: z.boolean(),
  publicReplyOn: z.boolean(),
  publicReplies: z.array(txt(300)).max(MAX_PUBLIC_REPLIES),
  opening: z.object({ on: z.boolean(), text: txt(TEXT_MAX), button: txt(BUTTON_MAX) }),
  follow: z.object({ on: z.boolean(), text: txt(TEXT_MAX), button: txt(BUTTON_MAX) }),
  email: z.object({ on: z.boolean(), text: txt(TEXT_MAX) }),
  link: z.object({ text: txt(TEXT_MAX), links: z.array(z.object({ label: txt(BUTTON_MAX), url: txt(1000) })).max(MAX_LINKS) }),
  followUp: z.object({ on: z.boolean(), text: txt(TEXT_MAX), delayMinutes: z.number().int().min(5).max(1380) }),
});
const quickSaveSchema = z.object({
  name: z.string().trim().min(1, "Give it a name").max(120),
  channels: z.array(z.enum(["instagram", "messenger"])).min(1, "Pick Instagram, Facebook or both"),
  keywords: z.array(z.string().trim().max(60)).max(30),
  flow: flowSchema,
});
export type QuickSavePayload = z.infer<typeof quickSaveSchema>;

export async function saveCommentFlow(id: string, payload: QuickSavePayload, goLive?: boolean): Promise<{ ok: boolean; error?: string; problems?: string[] }> {
  const ctx = await requireWorkspace();
  const a = await own(ctx.workspace.id, id);
  const parsed = quickSaveSchema.safeParse(payload);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };
  const d = parsed.data;
  const prev = a.quick;
  const flow: CommentFlow = {
    ...d.flow,
    kind: "comment_dm",
    postIds: d.flow.postMode === "specific" ? d.flow.postIds : [],
    posts: d.flow.postMode === "specific" ? d.flow.posts.filter((p) => d.flow.postIds.includes(p.id)) : [],
    publicReplies: d.flow.publicReplies.map((r) => r.trim()).filter(Boolean),
    link: { text: d.flow.link.text, links: d.flow.link.links.map((l) => ({ label: l.label.trim(), url: normalizeUrl(l.url) })) },
    // "Next post": only posts published after this moment count. Re-arm when the mode is switched on.
    nextArmedAt: d.flow.postMode === "next" ? (prev?.postMode === "next" && prev.nextArmedAt ? prev.nextArmedAt : new Date().toISOString()) : null,
  };
  const keywords = [...new Set(d.keywords.map((k) => k.replace(/^["']+|["']+$/g, "").trim()).filter(Boolean))];
  const problems = validateCommentFlow(flow, keywords);
  if ((a.status === "active" || goLive) && problems.length) {
    return { ok: false, error: goLive ? "Almost there. Fix these to go live:" : "Fix these before saving a live automation:", problems };
  }
  const keepBound = flow.postMode === "next" && prev?.postMode === "next" ? a.postId : null;
  await db
    .update(automations)
    .set({ name: d.name, channels: d.channels, keywords, matchType: "contains", quick: flow, postId: keepBound, publicReply: null, updatedAt: new Date() })
    .where(eq(automations.id, id));
  revalidatePath(`/automations/${id}`);
  revalidatePath("/automations");
  if (goLive && a.status !== "active") return setAutomationStatus(id, "active");
  return { ok: true, problems };
}

/** Recent posts and reels for the post picker. */
export async function listRecentPosts(): Promise<{ posts: RecentPost[]; error?: string }> {
  const ctx = await requireWorkspace();
  const integ = await getMetaIntegration(ctx.workspace.id);
  if (!integ) return { posts: [], error: "Connect Instagram and Facebook on the Integrations page to pick a post." };
  const posts: RecentPost[] = [];
  const errors: string[] = [];
  if (integ.instagramAccountId) {
    try {
      posts.push(...(await listInstagramMedia(integ.instagramAccountId, integ.pageToken)));
    } catch (e) {
      errors.push(`Instagram: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  try {
    posts.push(...(await listPagePosts(integ.pageId!, integ.pageToken)));
  } catch (e) {
    errors.push(`Facebook: ${e instanceof Error ? e.message : String(e)}`);
  }
  return { posts, error: posts.length === 0 && errors.length ? `Couldn't load your posts. ${errors.join(" · ")}` : undefined };
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
    const problems = a.quick ? validateCommentFlow(a.quick, a.keywords) : validateGraph(a.graph);
    if (!a.quick && (a.triggerType === "dm_keyword" || a.triggerType === "comment_keyword") && a.keywords.length === 0) problems.unshift("Add at least one trigger keyword.");
    if (problems.length) return { ok: false, error: "This automation can't be activated yet:", problems };
    const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, ctx.workspace.id)).limit(1);
    const [{ n }] = (await db
      .select({ n: count() })
      .from(automations)
      .where(and(eq(automations.workspaceId, ctx.workspace.id), eq(automations.status, "active")))) as [{ n: number }];
    const [{ n: yt }] = (await db
      .select({ n: count() })
      .from(youtubeAutomations)
      .where(and(eq(youtubeAutomations.workspaceId, ctx.workspace.id), eq(youtubeAutomations.status, "active")))) as [{ n: number }];
    const limit = getPlan(ws?.plan).limits.activeAutomations;
    if (n + yt >= limit) return { ok: false, error: `Your plan allows ${limit} active automations. Pause one or upgrade on the Billing page.` };
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
    const matched = a.quick ? commentMatches(a.quick, a.keywords, body) : a.triggerType === "comment_keyword" && !!matchKeyword(body, a.keywords, a.matchType);
    if (matched) {
      const publicReply = a.quick ? pickPublicReply(a.quick) : a.publicReply;
      if (publicReply) {
        await db.insert(messages).values({ workspaceId: ctx.workspace.id, conversationId: conv.id, direction: "outbound", senderType: "automation", body: `↩︎ Public reply: ${publicReply}`, status: "simulated" });
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
