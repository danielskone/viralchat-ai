import { getWorkspaceContext } from "@/lib/auth";
import { getOverview } from "@/lib/analytics";
import { toCsv } from "@/lib/csv";

export async function GET(req: Request) {
  const ctx = await getWorkspaceContext();
  if (!ctx) return new Response("Unauthorized", { status: 401 });
  const days = Math.min(365, Math.max(1, Number(new URL(req.url).searchParams.get("days")) || 30));
  const o = await getOverview(ctx.workspace.id, days);
  const csv = toCsv([
    ["ViralChat AI report", ctx.workspace.name, `Last ${days} days`, new Date().toISOString()],
    [],
    ["Metric", "Value"],
    ["Total contacts", o.totalContacts],
    ["New leads", o.newLeads],
    ["Active conversations", o.activeConversations],
    ["Inbound messages", o.inbound],
    ["Automated + AI messages sent", o.automatedSent],
    ["AI replies", o.aiReplies],
    ["Failed deliveries", o.failedMessages],
    ["Response rate %", o.responseRate ?? ""],
    ["Automation runs", o.runs.total],
    ["Workflow completion %", o.runs.completionRate ?? ""],
    ["Hot / warm / cold leads", `${o.temperatures.hot} / ${o.temperatures.warm} / ${o.temperatures.cold}`],
    [],
    ["Date", "Inbound", "Automated + AI", "Team"],
    ...o.series.map((s) => [s.day, s.inbound, s.automated, s.agent]),
    [],
    ["Lead source", "Contacts"],
    ...o.sources.map((s) => [s.name, s.value]),
  ]);
  return new Response(csv, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="viralchat-report-${days}d.csv"` },
  });
}
