import Link from "next/link";
import { and, count, desc, eq } from "drizzle-orm";
import { CheckCircle2, Circle, Users, UserPlus, MessagesSquare, Send, Sparkles, Workflow, ArrowRight } from "lucide-react";
import { db } from "@/db";
import { activities, automations, chatbots, integrations, knowledgeItems, automationRuns } from "@/db/schema";
import { requireWorkspace } from "@/lib/auth";
import { getOverview } from "@/lib/analytics";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, PageHeader, Badge } from "@/components/ui/primitives";
import { buttonVariants } from "@/components/ui/button";
import { StatCard } from "@/components/app/stat-card";
import { ActivityChart, BarList } from "@/components/charts/activity-chart";
import { timeAgo } from "@/lib/utils";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const ctx = await requireWorkspace();
  const wsId = ctx.workspace.id;
  const [overview, [meta], [bot], [kb], [autoCount], [activeAuto], [testRuns], recent] = await Promise.all([
    getOverview(wsId, 14),
    db.select().from(integrations).where(and(eq(integrations.workspaceId, wsId), eq(integrations.provider, "meta"))).limit(1),
    db.select().from(chatbots).where(eq(chatbots.workspaceId, wsId)).limit(1),
    db.select({ n: count() }).from(knowledgeItems).where(eq(knowledgeItems.workspaceId, wsId)),
    db.select({ n: count() }).from(automations).where(eq(automations.workspaceId, wsId)),
    db.select({ n: count() }).from(automations).where(and(eq(automations.workspaceId, wsId), eq(automations.status, "active"))),
    db.select({ n: count() }).from(automationRuns).where(and(eq(automationRuns.workspaceId, wsId), eq(automationRuns.isTest, true))),
    db.select().from(activities).where(eq(activities.workspaceId, wsId)).orderBy(desc(activities.createdAt)).limit(8),
  ]);

  const steps = [
    { done: true, label: "Create your account and workspace", href: "/settings" },
    { done: meta?.status === "connected", label: "Connect Instagram & Facebook Messenger", href: "/integrations" },
    { done: Boolean(bot && (bot.personality || bot.greeting !== "Hi! How can I help you today?")), label: "Configure your AI assistant", href: "/chatbot" },
    { done: (kb?.n ?? 0) > 0, label: "Add business knowledge (FAQs, pricing, policies)", href: "/chatbot#knowledge" },
    { done: (autoCount?.n ?? 0) > 0, label: "Choose an automation template", href: "/templates" },
    { done: (testRuns?.n ?? 0) > 0, label: "Test your automation in the simulator", href: "/automations" },
    { done: (activeAuto?.n ?? 0) > 0, label: "Activate and monitor performance", href: "/automations" },
  ];
  const doneCount = steps.filter((s) => s.done).length;

  return (
    <>
      <PageHeader
        title={`Good to see you, ${ctx.user.name.split(" ")[0]}`}
        description="Here’s what happened across your conversations in the last 14 days."
        actions={
          <Link href="/templates" className={buttonVariants({ variant: "gradient" })}>
            <Sparkles /> New automation
          </Link>
        }
      />

      {doneCount < steps.length && (
        <Card className="mb-6 overflow-hidden">
          <div className="flex flex-col gap-6 p-5 md:flex-row">
            <div className="md:w-64">
              <p className="text-sm font-medium text-primary">Getting started</p>
              <p className="mt-1 text-lg font-semibold">{doneCount} of {steps.length} complete</p>
              <div className="mt-3 h-2 rounded-full bg-muted">
                <div className="brand-gradient h-2 rounded-full" style={{ width: `${(doneCount / steps.length) * 100}%` }} />
              </div>
              <p className="mt-3 text-sm text-muted-foreground">Finish setup to start turning comments and DMs into leads.</p>
              <Link href="/tutorial" className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">Open the full tutorial <ArrowRight className="size-3.5" /></Link>
            </div>
            <ol className="grid flex-1 gap-1 sm:grid-cols-2">
              {steps.map((s) => (
                <li key={s.label}>
                  <Link href={s.href} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-muted">
                    {s.done ? <CheckCircle2 className="size-4 text-success" /> : <Circle className="size-4 text-muted-foreground" />}
                    <span className={s.done ? "text-muted-foreground line-through" : ""}>{s.label}</span>
                  </Link>
                </li>
              ))}
            </ol>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Total contacts" value={overview.totalContacts} icon={<Users />} />
        <StatCard label="New leads" value={overview.newLeads} hint="Last 14 days" icon={<UserPlus />} />
        <StatCard label="Active conversations" value={overview.activeConversations} icon={<MessagesSquare />} />
        <StatCard label="Automated messages sent" value={overview.automatedSent} hint={`${overview.aiReplies} by AI`} icon={<Send />} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Message activity</CardTitle>
            <CardDescription>Inbound messages vs. automated and team replies</CardDescription>
          </CardHeader>
          <CardContent>
            <ActivityChart data={overview.series} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Lead temperature</CardTitle>
            <CardDescription>Based on lead score rules in your automations</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {(["hot", "warm", "cold"] as const).map((t) => (
              <Link key={t} href={`/contacts?temperature=${t}`} className="flex items-center justify-between rounded-xl border p-3 hover:bg-muted">
                <Badge tone={t === "hot" ? "danger" : t === "warm" ? "warning" : "default"} className="capitalize">{t}</Badge>
                <span className="text-lg font-semibold tabular-nums">{overview.temperatures[t]}</span>
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Lead sources</CardTitle>
          </CardHeader>
          <CardContent>
            <BarList data={overview.sources} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Top automations</CardTitle>
            <Link href="/automations" className="text-sm text-primary hover:underline">View all</Link>
          </CardHeader>
          <CardContent>
            {overview.topAutomations.length === 0 ? (
              <p className="text-sm text-muted-foreground">No automations yet. <Link href="/templates" className="text-primary hover:underline">Install a template</Link>.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {overview.topAutomations.map((a) => (
                  <li key={a.id}>
                    <Link href={`/automations/${a.id}`} className="flex items-center gap-3 rounded-lg p-2 hover:bg-muted">
                      <Workflow className="size-4 text-primary" />
                      <span className="flex-1 truncate text-sm">{a.name}</span>
                      <Badge tone={a.status === "active" ? "success" : "default"}>{a.status}</Badge>
                      <span className="w-12 text-right text-sm tabular-nums text-muted-foreground">{a.runs}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Recent activity</CardTitle>
          </CardHeader>
          <CardContent>
            {recent.length === 0 ? (
              <p className="text-sm text-muted-foreground">Activity from contacts and automations will show up here.</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {recent.map((a) => (
                  <li key={a.id} className="flex gap-3 text-sm">
                    <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />
                    <div className="min-w-0">
                      {a.contactId ? (
                        <Link href={`/contacts/${a.contactId}`} className="hover:underline">{a.description}</Link>
                      ) : (
                        a.description
                      )}
                      <p className="text-xs text-muted-foreground">{timeAgo(a.createdAt)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
      <div className="mt-6 text-right">
        <Link href="/analytics" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">Full analytics <ArrowRight className="size-4" /></Link>
      </div>
    </>
  );
}
