import "server-only";
import { and, count, eq, gte, ne, sql, desc } from "drizzle-orm";
import { db } from "@/db";
import { automationRuns, automations, contacts, conversations, messages } from "@/db/schema";

export async function getOverview(workspaceId: string, days: number) {
  const since = new Date(Date.now() - days * 86400_000);
  // exclude the automation-builder test conversation from all message metrics
  const notTest = sql`${messages.conversationId} not in (select id from conversations where workspace_id = ${workspaceId} and channel = 'test')`;
  const ws = (col: typeof contacts.workspaceId) => and(eq(col, workspaceId), ne(contacts.source, "test"));

  const [
    [totalContacts],
    [newLeads],
    [activeConvs],
    outboundByType,
    [inbound],
    runStats,
    sources,
    temps,
    daily,
    topAutomations,
    [respondedConvs],
    [convsWithInbound],
  ] = await Promise.all([
    db.select({ n: count() }).from(contacts).where(ws(contacts.workspaceId)),
    db.select({ n: count() }).from(contacts).where(and(ws(contacts.workspaceId), gte(contacts.createdAt, since))),
    db
      .select({ n: count() })
      .from(conversations)
      .where(and(eq(conversations.workspaceId, workspaceId), eq(conversations.status, "open"), gte(conversations.lastMessageAt, since))),
    db
      .select({ type: messages.senderType, status: messages.status, n: count() })
      .from(messages)
      .where(and(eq(messages.workspaceId, workspaceId), eq(messages.direction, "outbound"), eq(messages.isInternalNote, false), gte(messages.createdAt, since), notTest))
      .groupBy(messages.senderType, messages.status),
    db
      .select({ n: count() })
      .from(messages)
      .where(and(eq(messages.workspaceId, workspaceId), eq(messages.direction, "inbound"), gte(messages.createdAt, since), notTest)),
    db
      .select({ status: automationRuns.status, n: count() })
      .from(automationRuns)
      .where(and(eq(automationRuns.workspaceId, workspaceId), eq(automationRuns.isTest, false), gte(automationRuns.startedAt, since)))
      .groupBy(automationRuns.status),
    db.select({ source: contacts.source, n: count() }).from(contacts).where(ws(contacts.workspaceId)).groupBy(contacts.source),
    db.select({ t: contacts.temperature, n: count() }).from(contacts).where(ws(contacts.workspaceId)).groupBy(contacts.temperature),
    db
      .select({
        day: sql<string>`to_char(date_trunc('day', ${messages.createdAt}), 'YYYY-MM-DD')`.as("day"),
        inbound: sql<number>`count(*) filter (where ${messages.direction} = 'inbound')`.mapWith(Number),
        automated: sql<number>`count(*) filter (where ${messages.senderType} in ('automation','ai'))`.mapWith(Number),
        agent: sql<number>`count(*) filter (where ${messages.senderType} = 'agent')`.mapWith(Number),
      })
      .from(messages)
      .where(and(eq(messages.workspaceId, workspaceId), eq(messages.isInternalNote, false), gte(messages.createdAt, since), notTest))
      .groupBy(sql`1`)
      .orderBy(sql`1`),
    db
      .select({ id: automations.id, name: automations.name, status: automations.status, runs: automations.runsCount })
      .from(automations)
      .where(eq(automations.workspaceId, workspaceId))
      .orderBy(desc(automations.runsCount))
      .limit(5),
    db
      .select({ n: sql<number>`count(distinct ${messages.conversationId})`.mapWith(Number) })
      .from(messages)
      .where(and(eq(messages.workspaceId, workspaceId), eq(messages.direction, "outbound"), eq(messages.isInternalNote, false), gte(messages.createdAt, since), notTest)),
    db
      .select({ n: sql<number>`count(distinct ${messages.conversationId})`.mapWith(Number) })
      .from(messages)
      .where(and(eq(messages.workspaceId, workspaceId), eq(messages.direction, "inbound"), gte(messages.createdAt, since), notTest)),
  ]);

  const sumBy = (pred: (r: (typeof outboundByType)[number]) => boolean) => outboundByType.filter(pred).reduce((a, r) => a + r.n, 0);
  const automated = sumBy((r) => (r.type === "automation" || r.type === "ai") && r.status !== "failed");
  const aiReplies = sumBy((r) => r.type === "ai" && r.status !== "failed");
  const failed = sumBy((r) => r.status === "failed");
  const runTotal = runStats.reduce((a, r) => a + r.n, 0);
  const runCompleted = runStats.find((r) => r.status === "completed")?.n ?? 0;
  const runFailed = runStats.find((r) => r.status === "failed")?.n ?? 0;

  // fill missing days
  const byDay = new Map(daily.map((d) => [d.day, d]));
  const series = Array.from({ length: days }, (_, i) => {
    const d = new Date(Date.now() - (days - 1 - i) * 86400_000).toISOString().slice(0, 10);
    const row = byDay.get(d);
    return { day: d.slice(5), inbound: row?.inbound ?? 0, automated: row?.automated ?? 0, agent: row?.agent ?? 0 };
  });

  return {
    totalContacts: totalContacts?.n ?? 0,
    newLeads: newLeads?.n ?? 0,
    activeConversations: activeConvs?.n ?? 0,
    inbound: inbound?.n ?? 0,
    automatedSent: automated,
    aiReplies,
    failedMessages: failed,
    responseRate: convsWithInbound?.n ? Math.round(((respondedConvs?.n ?? 0) / convsWithInbound.n) * 100) : null,
    runs: { total: runTotal, completed: runCompleted, failed: runFailed, completionRate: runTotal ? Math.round((runCompleted / runTotal) * 100) : null },
    sources: sources.map((s) => ({ name: s.source, value: s.n })),
    temperatures: { hot: temps.find((t) => t.t === "hot")?.n ?? 0, warm: temps.find((t) => t.t === "warm")?.n ?? 0, cold: temps.find((t) => t.t === "cold")?.n ?? 0 },
    series,
    topAutomations,
  };
}
