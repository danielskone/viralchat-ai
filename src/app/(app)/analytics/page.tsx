import Link from "next/link";
import { Download } from "lucide-react";
import { requireWorkspace } from "@/lib/auth";
import { getOverview } from "@/lib/analytics";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, PageHeader, Badge } from "@/components/ui/primitives";
import { buttonVariants } from "@/components/ui/button";
import { StatCard } from "@/components/app/stat-card";
import { ActivityChart, BarList } from "@/components/charts/activity-chart";
import { cn } from "@/lib/utils";

export const metadata = { title: "Analytics" };
const RANGES = [7, 30, 90];

export default async function AnalyticsPage({ searchParams }: PageProps<"/analytics">) {
  const ctx = await requireWorkspace();
  const sp = await searchParams;
  const days = RANGES.includes(Number(sp.days)) ? Number(sp.days) : 30;
  const o = await getOverview(ctx.workspace.id, days);
  return (
    <>
      <PageHeader
        title="Analytics"
        description={`Performance over the last ${days} days`}
        actions={
          <>
            <div className="flex rounded-lg border bg-card p-0.5">
              {RANGES.map((r) => (
                <Link key={r} href={`/analytics?days=${r}`} className={cn("rounded-md px-3 py-1 text-sm", r === days ? "bg-accent font-medium text-accent-foreground" : "text-muted-foreground")}>{r}d</Link>
              ))}
            </div>
            <a href={`/api/analytics/report?days=${days}`} className={buttonVariants({ variant: "outline" })}><Download /> Download report</a>
          </>
        }
      />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="New leads" value={o.newLeads} hint={`${o.totalContacts.toLocaleString()} total contacts`} />
        <StatCard label="Inbound messages" value={o.inbound} />
        <StatCard label="Response rate" value={o.responseRate === null ? "—" : `${o.responseRate}%`} hint="Conversations with at least one reply" />
        <StatCard label="Automated + AI messages" value={o.automatedSent} hint={`${o.failedMessages} failed to deliver`} />
        <StatCard label="AI replies" value={o.aiReplies} />
        <StatCard label="Automation runs" value={o.runs.total} />
        <StatCard label="Workflow completion" value={o.runs.completionRate === null ? "—" : `${o.runs.completionRate}%`} hint={`${o.runs.failed} failed`} />
        <StatCard label="Hot leads" value={o.temperatures.hot} hint={`${o.temperatures.warm} warm · ${o.temperatures.cold} cold`} />
      </div>
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Daily message volume</CardTitle>
          <CardDescription>Inbound vs automated vs team replies</CardDescription>
        </CardHeader>
        <CardContent><ActivityChart data={o.series} /></CardContent>
      </Card>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Lead sources</CardTitle></CardHeader>
          <CardContent><BarList data={o.sources} /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Automation performance</CardTitle><CardDescription>All-time runs</CardDescription></CardHeader>
          <CardContent>
            {o.topAutomations.length === 0 ? <p className="text-sm text-muted-foreground">No automations yet.</p> : (
              <table className="w-full text-sm">
                <tbody>
                  {o.topAutomations.map((a) => (
                    <tr key={a.id} className="border-b last:border-0">
                      <td className="py-2"><Link href={`/automations/${a.id}`} className="hover:underline">{a.name}</Link></td>
                      <td className="py-2"><Badge tone={a.status === "active" ? "success" : "default"}>{a.status}</Badge></td>
                      <td className="py-2 text-right tabular-nums">{a.runs.toLocaleString()} runs</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
