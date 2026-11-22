import "server-only";
import { and, count, desc, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  automationRuns,
  automations,
  chatbots,
  contacts,
  conversations,
  memberships,
  messages,
  notifications,
  workspaces,
  type Automation,
  type AutomationRun,
  type Contact,
  type Conversation,
} from "@/db/schema";
import { getPlan } from "@/lib/plans";
import { generateConversationReply } from "@/lib/ai";
import { sendMessage } from "@/lib/messaging";
import { logActivity } from "@/lib/audit";
import { temperatureFromScore } from "@/lib/utils";
import { execute, findTrigger, type ExecDeps, type RunState } from "./executor";
import { matchKeyword } from "./matcher";
import { appUrl, bookingLinkFor } from "@/lib/booking-server";
import { getMetaIntegration } from "@/lib/messaging";
import { checkFollowsBusiness, type MetaButton } from "@/lib/meta";
import { signState } from "@/lib/crypto";
import {
  commentMatches,
  continueCommentFlow,
  postMatches,
  startCommentFlow,
  type CommentFlow,
  type QDeps,
  type QResult,
  type QState,
} from "@/lib/comment-flow";
import type { RunLogEntry } from "@/db/schema";

function monthStart() {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

export async function monthlyUsage(workspaceId: string) {
  const since = monthStart();
  const [[runs], [ai]] = await Promise.all([
    db
      .select({ n: count() })
      .from(automationRuns)
      .where(and(eq(automationRuns.workspaceId, workspaceId), eq(automationRuns.isTest, false), gte(automationRuns.startedAt, since))),
    db
      .select({ n: count() })
      .from(messages)
      .innerJoin(conversations, eq(conversations.id, messages.conversationId))
      .where(
        and(
          eq(messages.workspaceId, workspaceId),
          eq(messages.senderType, "ai"),
          gte(messages.createdAt, since),
          sql`${conversations.channel} not in ('demo','test')`,
        ),
      ),
  ]);
  return { runs: runs?.n ?? 0, aiReplies: ai?.n ?? 0 };
}

async function notifyTeam(workspaceId: string, title: string, body: string, href: string) {
  const members = await db.select({ userId: memberships.userId }).from(memberships).where(eq(memberships.workspaceId, workspaceId));
  if (members.length) {
    await db.insert(notifications).values(members.map((m) => ({ workspaceId, userId: m.userId, title, body, href })));
  }
}

const isPrivateHost = (host: string) =>
  /^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.|\[?::1\]?$|172\.(1[6-9]|2\d|3[01])\.)/i.test(host) || host.endsWith(".internal");

function buildDeps(run: { id: string; isTest: boolean; context: Record<string, unknown> }, conv: Conversation, contactId: string): ExecDeps {
  const loadContact = async (): Promise<Contact> => {
    const [c] = await db.select().from(contacts).where(eq(contacts.id, contactId)).limit(1);
    return c!;
  };
  const updateContact = (values: Partial<typeof contacts.$inferInsert>) =>
    db.update(contacts).set({ ...values, updatedAt: new Date() }).where(eq(contacts.id, contactId));

  return {
    now: () => new Date(),
    async vars() {
      const c = await loadContact();
      const first = c.name.split(" ")[0] ?? "";
      const vars: Record<string, string> = {
        name: c.name,
        first_name: first === "Unknown" ? "there" : first,
        email: c.email ?? "",
        phone: c.phone ?? "",
        username: c.instagramUsername ?? "",
        booking_link: await bookingLinkFor(c.workspaceId, c.id),
      };
      for (const [k, v] of Object.entries(c.customFields ?? {})) vars[`field.${k}`] = v;
      return vars;
    },
    async send(text) {
      const commentId = typeof run.context.commentId === "string" && !run.context.privateReplySent ? run.context.commentId : null;
      const r = await sendMessage({
        conversationId: conv.id,
        workspaceId: conv.workspaceId,
        text,
        senderType: "automation",
        automationRunId: run.id,
        commentId,
      });
      if (commentId && r.ok) run.context.privateReplySent = true;
      return r;
    },
    async addTag(tag) {
      const c = await loadContact();
      if (!c.tags.includes(tag)) {
        await updateContact({ tags: [...c.tags, tag] });
        if (!run.isTest) await logActivity(conv.workspaceId, contactId, "tag_added", `Tag "${tag}" added by automation`);
      }
    },
    async removeTag(tag) {
      const c = await loadContact();
      await updateContact({ tags: c.tags.filter((t) => t !== tag) });
    },
    async hasTag(tag) {
      return (await loadContact()).tags.includes(tag);
    },
    async setField(field, value) {
      const c = await loadContact();
      const key = field.trim().toLowerCase();
      if (key === "email") {
        const m = value.match(/[^\s@]+@[^\s@]+\.[^\s@]+/);
        if (m) return void (await updateContact({ email: m[0].toLowerCase() }));
      }
      if (key === "phone") {
        const digits = value.replace(/[^\d+]/g, "");
        if (digits.replace(/\D/g, "").length >= 7) return void (await updateContact({ phone: digits }));
      }
      if (key === "name" && value.trim()) return void (await updateContact({ name: value.trim().slice(0, 120) }));
      await updateContact({ customFields: { ...(c.customFields ?? {}), [field]: value.slice(0, 1000) } });
    },
    async getField(field) {
      const c = await loadContact();
      const key = field.trim().toLowerCase();
      if (key === "email") return c.email ?? undefined;
      if (key === "phone") return c.phone ?? undefined;
      if (key === "name") return c.name;
      return c.customFields?.[field];
    },
    async addScore(points) {
      const c = await loadContact();
      const score = Math.max(0, Math.min(100, c.leadScore + points));
      await updateContact({ leadScore: score, temperature: temperatureFromScore(score) });
      return score;
    },
    async getScore() {
      return (await loadContact()).leadScore;
    },
    async setStage(stage) {
      await updateContact({ stage });
      if (!run.isTest) await logActivity(conv.workspaceId, contactId, "stage_changed", `Moved to ${stage} by automation`);
    },
    async notify(message) {
      if (run.isTest) return;
      await notifyTeam(conv.workspaceId, "Automation alert", message, `/inbox?c=${conv.id}`);
    },
    async handoff(reason) {
      await db.update(conversations).set({ humanTakeover: true, priority: true }).where(eq(conversations.id, conv.id));
      if (!run.isTest) await notifyTeam(conv.workspaceId, "Human needed", reason, `/inbox?c=${conv.id}`);
    },
    async aiReply() {
      const r = await generateConversationReply(conv.workspaceId, conv.id);
      if (!r.ok) return r;
      const sent = await sendMessage({ conversationId: conv.id, workspaceId: conv.workspaceId, text: r.text, senderType: "ai", automationRunId: run.id });
      if (r.handoff) await this.handoff("AI could not answer confidently");
      return { ok: sent.ok, error: sent.error, handoff: r.handoff };
    },
    async webhook(url) {
      try {
        const u = new URL(url);
        if (u.protocol !== "https:" || isPrivateHost(u.hostname)) return { ok: false, error: "Only public https:// URLs are allowed" };
        if (run.isTest) return { ok: true, status: 0 };
        const c = await loadContact();
        const res = await fetch(u, {
          method: "POST",
          headers: { "Content-Type": "application/json", "User-Agent": "ViralChatAI-Webhook/1.0" },
          body: JSON.stringify({
            event: "automation.webhook",
            contact: { id: c.id, name: c.name, email: c.email, phone: c.phone, tags: c.tags, score: c.leadScore, fields: c.customFields },
            conversationId: conv.id,
            answers: run.context.answers ?? {},
          }),
          signal: AbortSignal.timeout(8000),
        });
        return { ok: res.ok, status: res.status, error: res.ok ? undefined : `HTTP ${res.status}` };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
    },
  };
}

/** Runs one step of a Comment-to-DM quick flow and converts the result to a RunState. */
async function runQuick(
  flow: CommentFlow,
  run: { id: string; isTest: boolean; context: Record<string, unknown> },
  conv: Conversation,
  input: { start: true } | { text: string | null },
  priorLog: RunLogEntry[],
): Promise<RunState> {
  const base = buildDeps(run, conv, conv.contactId);
  const log = [...priorLog];
  const current = run.context.q as QState | undefined;
  const deps: QDeps = {
    vars: () => base.vars(),
    async send(text, buttons) {
      const metaButtons: MetaButton[] = buttons.map((b) =>
        b.kind === "postback"
          ? { type: "postback", title: b.title, payload: `vc:${run.id}:${b.step}` }
          : {
              type: "web_url",
              title: b.title,
              url: `${appUrl()}/r/${signState({ r: run.id, i: String(b.index) }, 30 * 86400)}`,
            },
      );
      const commentId = typeof run.context.commentId === "string" && !run.context.privateReplySent ? run.context.commentId : null;
      const r = await sendMessage({
        conversationId: conv.id,
        workspaceId: conv.workspaceId,
        text,
        buttons: metaButtons,
        senderType: "automation",
        automationRunId: run.id,
        commentId,
      });
      if (commentId && r.ok) run.context.privateReplySent = true;
      return r;
    },
    async isFollowing() {
      if (run.isTest || conv.channel !== "instagram") return null;
      const [c] = await db.select({ igId: contacts.instagramId }).from(contacts).where(eq(contacts.id, conv.contactId)).limit(1);
      const integ = await getMetaIntegration(conv.workspaceId);
      if (!c?.igId || !integ) return null;
      return checkFollowsBusiness(c.igId, integ.pageToken);
    },
    async saveEmail(email) {
      await db.update(contacts).set({ email, updatedAt: new Date() }).where(eq(contacts.id, conv.contactId));
      if (!run.isTest) await logActivity(conv.workspaceId, conv.contactId, "field_set", `Shared their email (${email})`);
    },
    log(status, message) {
      log.push({ at: new Date().toISOString(), nodeId: "quick", nodeType: "comment_dm", status, message });
    },
  };
  let r: QResult;
  if ("start" in input) r = await startCommentFlow(flow, deps);
  else if (!current) r = { state: null, status: "completed", wait: null };
  else r = await continueCommentFlow(flow, current, input.text, deps);

  const now = Date.now();
  const keepTimer = r.status === "waiting" && !r.wait; // a reply arrived while a follow-up timer is pending
  return {
    status: r.status,
    currentNodeId: r.state ? `quick:${r.state.step}` : null,
    waitingFor: keepTimer ? "timer" : r.wait?.for ?? null,
    resumeAt: keepTimer
      ? null
      : r.wait?.for === "reply"
        ? new Date(now + r.wait.hours * 3600_000)
        : r.wait?.for === "timer"
          ? new Date(now + r.wait.minutes * 60_000)
          : null,
    context: { ...run.context, q: r.state ?? undefined },
    log,
    error: r.error,
  };
}

async function persist(runId: string, st: RunState) {
  await db
    .update(automationRuns)
    .set({
      status: st.status,
      currentNodeId: st.currentNodeId,
      waitingFor: st.waitingFor,
      resumeAt: st.resumeAt,
      context: st.context,
      log: st.log,
      error: st.error ?? null,
      finishedAt: st.status === "completed" || st.status === "failed" ? new Date() : null,
    })
    .where(eq(automationRuns.id, runId));
}

export async function startRun(automation: Automation, conv: Conversation, initialContext: Record<string, unknown>, isTest = false) {
  if (!isTest) {
    const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, automation.workspaceId)).limit(1);
    const usage = await monthlyUsage(automation.workspaceId);
    if (usage.runs >= getPlan(ws?.plan).limits.monthlyAutomationRuns) {
      await notifyTeam(automation.workspaceId, "Automation limit reached", `"${automation.name}" did not run: monthly run limit reached. Upgrade to continue.`, "/billing");
      return null;
    }
  }
  // A new run supersedes any run still waiting in this conversation.
  await db
    .update(automationRuns)
    .set({ status: "completed", finishedAt: new Date(), waitingFor: null, error: "Superseded by a newer automation run" })
    .where(and(eq(automationRuns.conversationId, conv.id), eq(automationRuns.status, "waiting")));

  const [run] = await db
    .insert(automationRuns)
    .values({ workspaceId: automation.workspaceId, automationId: automation.id, contactId: conv.contactId, conversationId: conv.id, isTest, context: initialContext })
    .returning();
  await db.update(automations).set({ runsCount: sql`${automations.runsCount} + 1` }).where(eq(automations.id, automation.id));
  let st: RunState;
  if (automation.quick) {
    st = await runQuick(automation.quick, run!, conv, { start: true }, []);
  } else {
    const trigger = findTrigger(automation.graph);
    const deps = buildDeps(run!, conv, conv.contactId);
    st = await execute(automation.graph, trigger?.id ?? null, { status: "running", currentNodeId: null, waitingFor: null, resumeAt: null, context: run!.context, log: [] }, deps);
  }
  if (run!.context.privateReplySent) st.context.privateReplySent = true;
  await persist(run!.id, st);
  if (!isTest) await logActivity(automation.workspaceId, conv.contactId, "automation_ran", `Automation "${automation.name}" ${st.status}`);
  return { runId: run!.id, state: st };
}

export async function resumeRun(run: AutomationRun, reply: string | null) {
  const [automation] = await db.select().from(automations).where(eq(automations.id, run.automationId)).limit(1);
  const [conv] = run.conversationId ? await db.select().from(conversations).where(eq(conversations.id, run.conversationId)).limit(1) : [];
  if (!automation || !conv || !run.currentNodeId) {
    await db.update(automationRuns).set({ status: "failed", error: "Automation or conversation was deleted", finishedAt: new Date() }).where(eq(automationRuns.id, run.id));
    return null;
  }
  if (automation.quick) {
    const st = await runQuick(automation.quick, { ...run, context: { ...run.context } }, conv, { text: reply }, run.log);
    if (st.status === "waiting" && st.waitingFor === "timer" && !st.resumeAt) st.resumeAt = run.resumeAt; // keep the pending follow-up time
    await persist(run.id, st);
    return st;
  }
  const context: Record<string, unknown> = { ...run.context, ...(reply !== null ? { lastReply: reply } : {}) };
  const live = { ...run, context };
  const deps = buildDeps(live, conv, conv.contactId);
  const st = await execute(automation.graph, run.currentNodeId, { status: "running", currentNodeId: run.currentNodeId, waitingFor: null, resumeAt: null, context, log: run.log }, deps);
  if (live.context.privateReplySent) st.context.privateReplySent = true;
  await persist(run.id, st);
  return st;
}

/** Called by the scheduler: resumes delay timers, and expires question waits that timed out. */
export async function processDueRuns(limit = 50) {
  const due = await db
    .select()
    .from(automationRuns)
    .where(and(eq(automationRuns.status, "waiting"), lte(automationRuns.resumeAt, new Date())))
    .orderBy(automationRuns.resumeAt)
    .limit(limit);
  let resumed = 0;
  let expired = 0;
  for (const run of due) {
    // claim the run so concurrent schedulers don't double-process
    const claimed = await db
      .update(automationRuns)
      .set({ status: "running" })
      .where(and(eq(automationRuns.id, run.id), eq(automationRuns.status, "waiting")))
      .returning({ id: automationRuns.id });
    if (!claimed.length) continue;
    if (run.waitingFor === "timer") {
      await resumeRun(run, null);
      resumed++;
    } else {
      await db
        .update(automationRuns)
        .set({ status: "completed", finishedAt: new Date(), error: "No reply received before the question timed out", waitingFor: null })
        .where(eq(automationRuns.id, run.id));
      expired++;
    }
  }
  return { resumed, expired };
}

type InboundCtx = {
  workspaceId: string;
  conversation: Conversation;
  contactCreated: boolean;
  conversationCreated: boolean;
  text: string;
  isStoryReply?: boolean;
  /** Test mode: only consider this automation (even if draft) */
  onlyAutomationId?: string;
  isTest?: boolean;
};

/** Core routing for an inbound DM: resume a waiting flow, else start a matching automation, else AI chatbot. */
export async function handleInboundMessage(ctx: InboundCtx) {
  const { conversation: conv } = ctx;
  if (conv.humanTakeover && !ctx.isTest) return { action: "human_takeover" as const };

  // Button tap from a Comment-to-DM message: payload "vc:<runId>:<step>"
  const tap = /^vc:([0-9a-f-]{36}):(\w+)$/i.exec(ctx.text.trim());
  if (tap) {
    const claimed = await db
      .update(automationRuns)
      .set({ status: "running" })
      .where(and(eq(automationRuns.id, tap[1]!), eq(automationRuns.conversationId, conv.id), eq(automationRuns.status, "waiting"), eq(automationRuns.waitingFor, "reply")))
      .returning();
    if (claimed[0]) {
      const st = await resumeRun({ ...claimed[0], status: "waiting" }, tap[2]!);
      return { action: "resumed" as const, runId: claimed[0].id, state: st };
    }
    return { action: "none" as const }; // old button: ignore instead of sending the payload to the AI
  }

  const [waiting] = await db
    .select()
    .from(automationRuns)
    .where(and(eq(automationRuns.conversationId, conv.id), eq(automationRuns.status, "waiting"), eq(automationRuns.waitingFor, "reply")))
    .orderBy(desc(automationRuns.startedAt))
    .limit(1);
  if (waiting) {
    const claimed = await db
      .update(automationRuns)
      .set({ status: "running" })
      .where(and(eq(automationRuns.id, waiting.id), eq(automationRuns.status, "waiting")))
      .returning({ id: automationRuns.id });
    if (claimed.length) {
      const st = await resumeRun(waiting, ctx.text);
      return { action: "resumed" as const, runId: waiting.id, state: st };
    }
  }

  const candidates = await db
    .select()
    .from(automations)
    .where(
      ctx.onlyAutomationId
        ? and(eq(automations.id, ctx.onlyAutomationId), eq(automations.workspaceId, ctx.workspaceId))
        : and(eq(automations.workspaceId, ctx.workspaceId), eq(automations.status, "active")),
    )
    .orderBy(automations.createdAt);

  const channelOk = (a: Automation) => ctx.isTest || a.channels.includes(conv.channel) || conv.channel === "demo";
  const pick =
    candidates.find((a) => channelOk(a) && a.triggerType === "dm_keyword" && matchKeyword(ctx.text, a.keywords, a.matchType)) ??
    (ctx.isStoryReply ? candidates.find((a) => channelOk(a) && a.triggerType === "story_reply") : undefined) ??
    (ctx.conversationCreated || (ctx.isTest && ctx.onlyAutomationId)
      ? candidates.find((a) => channelOk(a) && a.triggerType === "new_conversation")
      : undefined);

  if (pick) {
    const r = await startRun(pick, conv, { triggerText: ctx.text, trigger: pick.triggerType }, !!ctx.isTest);
    return { action: "automation" as const, automationId: pick.id, runId: r?.runId, state: r?.state };
  }

  if (ctx.onlyAutomationId) return { action: "no_match" as const };

  // Fallback: AI chatbot
  const [bot] = await db.select().from(chatbots).where(eq(chatbots.workspaceId, ctx.workspaceId)).limit(1);
  if (bot?.enabled && (bot.channels.includes(conv.channel) || conv.channel === "demo")) {
    const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, ctx.workspaceId)).limit(1);
    const plan = getPlan(ws?.plan);
    const usage = await monthlyUsage(ctx.workspaceId);
    if (!plan.limits.aiChatbot || usage.aiReplies >= plan.limits.monthlyAiReplies) {
      return { action: "ai_limit" as const };
    }
    const lower = ctx.text.toLowerCase();
    if (bot.handoffKeywords.some((k) => k && lower.includes(k.toLowerCase()))) {
      await db.update(conversations).set({ humanTakeover: true, priority: true }).where(eq(conversations.id, conv.id));
      await sendMessage({ conversationId: conv.id, workspaceId: conv.workspaceId, text: bot.fallbackMessage, senderType: "ai" });
      await notifyTeam(ctx.workspaceId, "Human requested", `A contact asked for a person.`, `/inbox?c=${conv.id}`);
      return { action: "handoff" as const };
    }
    const r = await generateConversationReply(ctx.workspaceId, conv.id);
    if (r.ok) {
      await sendMessage({ conversationId: conv.id, workspaceId: conv.workspaceId, text: r.text, senderType: "ai" });
      if (r.handoff) {
        await db.update(conversations).set({ humanTakeover: true, priority: true }).where(eq(conversations.id, conv.id));
        await notifyTeam(ctx.workspaceId, "AI handed off a conversation", "The assistant couldn't answer confidently.", `/inbox?c=${conv.id}`);
      }
      return { action: "ai" as const, handoff: r.handoff };
    }
    return { action: "ai_error" as const, error: r.error };
  }
  return { action: "none" as const };
}

/** Comment-to-DM: matches comment keyword automations, optionally replies publicly, then DMs privately. */
export async function findCommentAutomation(
  workspaceId: string,
  channel: "instagram" | "messenger",
  text: string,
  postId: string | null,
  postTime?: (postId: string) => Promise<Date | null>,
) {
  const list = await db
    .select()
    .from(automations)
    .where(and(eq(automations.workspaceId, workspaceId), eq(automations.status, "active"), eq(automations.triggerType, "comment_keyword")))
    .orderBy(automations.createdAt);
  let published: Date | null | undefined;
  for (const a of list) {
    if (!a.channels.includes(channel)) continue;
    if (!a.quick) {
      if ((!a.postId || a.postId === postId) && matchKeyword(text, a.keywords, a.matchType)) return a;
      continue;
    }
    if (!commentMatches(a.quick, a.keywords, text)) continue;
    const pm = postMatches(a.quick, a.postId, postId);
    if (pm === true) return a;
    if (pm === "check-time" && postId && postTime) {
      if (published === undefined) published = await postTime(postId);
      const armed = a.quick.nextArmedAt ? new Date(a.quick.nextArmedAt) : a.updatedAt;
      if (published && published > armed) {
        // First comment on the new post: lock this automation to that post.
        const [bound] = await db
          .update(automations)
          .set({ postId })
          .where(and(eq(automations.id, a.id), sql`${automations.postId} is null`))
          .returning({ id: automations.id });
        if (bound) return { ...a, postId };
        const [again] = await db.select({ postId: automations.postId }).from(automations).where(eq(automations.id, a.id)).limit(1);
        if (again?.postId === postId) return a;
      }
    }
  }
  return null;
}
