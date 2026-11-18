import { and, count, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { automations, contacts, memberships } from "@/db/schema";
import { requireWorkspace, hasRole } from "@/lib/auth";
import { ADDONS, BASE_PLAN, formatLimit, workspacePlan } from "@/lib/plans";
import { stripeConfigured } from "@/lib/stripe";
import { monthlyUsage } from "@/lib/engine/runtime";
import { Alert, Badge, Card, CardContent, CardHeader, CardTitle, PageHeader } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { PlanCard } from "@/components/billing/plan-card";
import { cn } from "@/lib/utils";

export const metadata = { title: "Billing" };

function Meter({ label, used, limit }: { label: string; used: number; limit: number }) {
  const pct = Number.isFinite(limit) && limit > 0 ? Math.min(100, (used / limit) * 100) : 0;
  return (
    <div>
      <div className="mb-1 flex justify-between text-sm">
        <span>{label}</span>
        <span className="tabular-nums text-muted-foreground">{used.toLocaleString()} / {formatLimit(limit)}</span>
      </div>
      <div className="h-2 rounded-full bg-muted">
        <div className={cn("h-2 rounded-full", pct > 90 ? "bg-destructive" : "brand-gradient")} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default async function BillingPage({ searchParams }: PageProps<"/billing">) {
  const ctx = await requireWorkspace();
  const sp = await searchParams;
  const ws = ctx.workspace;
  const plan = workspacePlan(ws);
  const isOwner = hasRole(ctx.role, "owner");
  const [[c], [a], [m], usage] = await Promise.all([
    db.select({ n: count() }).from(contacts).where(and(eq(contacts.workspaceId, ws.id), ne(contacts.source, "test"))),
    db.select({ n: count() }).from(automations).where(and(eq(automations.workspaceId, ws.id), eq(automations.status, "active"))),
    db.select({ n: count() }).from(memberships).where(eq(memberships.workspaceId, ws.id)),
    monthlyUsage(ws.id),
  ]);
  const configured = stripeConfigured();
  const trialing = ws.subscriptionStatus === "trialing";
  const canManage = isOwner && configured && Boolean(ws.stripeCustomerId);
  const statusLine = ws.billingExempt && !ws.stripeSubscriptionId
    ? "Complimentary access, no subscription needed."
    : trialing && ws.trialEndsAt
      ? `Free trial until ${ws.trialEndsAt.toLocaleDateString()}. Your first $${BASE_PLAN.priceMonthly} charge is on that day unless you cancel.`
      : ws.currentPeriodEnd
        ? `Renews ${ws.currentPeriodEnd.toLocaleDateString()} · ${ws.subscriptionStatus}`
        : null;
  return (
    <>
      <PageHeader title="Billing" description="Your subscription and usage for this workspace." />
      <div className="mb-6 flex flex-col gap-3">
        {sp.canceled && <Alert tone="info">Checkout was canceled. You haven’t been charged.</Alert>}
        {typeof sp.error === "string" && <Alert tone="danger">{sp.error}</Alert>}
        {!configured && <Alert tone="warning" title="Payments are not configured">Set STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET and STRIPE_PRICE_PRO on the server to start charging.</Alert>}
        {ws.subscriptionStatus === "past_due" && <Alert tone="danger" title="Payment failed">Update your payment method in the billing portal to keep your subscription.</Alert>}
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Current plan <Badge tone="primary">{plan.name}</Badge>
              {trialing && <Badge tone="success">Free trial</Badge>}
            </CardTitle>
            {statusLine && <p className="text-sm text-muted-foreground">{statusLine}</p>}
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Meter label="Contacts" used={c?.n ?? 0} limit={plan.limits.contacts} />
            <Meter label="Active automations" used={a?.n ?? 0} limit={plan.limits.activeAutomations} />
            <Meter label="Automation runs this month" used={usage.runs} limit={plan.limits.monthlyAutomationRuns} />
            <Meter label="AI replies this month" used={usage.aiReplies} limit={plan.limits.monthlyAiReplies} />
            <Meter label="Team members" used={m?.n ?? 0} limit={plan.limits.members} />
            {canManage && (
              <form action="/api/billing/portal" method="post">
                <Button variant="outline" className="w-full">Manage subscription, card & invoices</Button>
              </form>
            )}
            <p className="text-xs text-muted-foreground">Meta messaging is free within the 24-hour window. AI replies using your own OpenAI key are billed by OpenAI directly.</p>
          </CardContent>
        </Card>
        <div className="flex flex-col gap-4 lg:col-span-2">
          <PlanCard trial={!ws.trialEndsAt && !ws.billingExempt}>
            {ws.stripeSubscriptionId ? (
              <Badge tone="primary" className="self-start">Your plan</Badge>
            ) : ws.billingExempt ? (
              <Badge tone="success" className="self-start">Included free for this workspace</Badge>
            ) : (
              isOwner && (
                <form action="/api/billing/checkout" method="post">
                  <Button variant="gradient" className="w-full" disabled={!configured}>
                    {ws.trialEndsAt ? `Subscribe for $${BASE_PLAN.priceMonthly}/month` : "Start free trial"}
                  </Button>
                </form>
              )
            )}
          </PlanCard>
          {ADDONS.length > 0 && (
            <Card>
              <CardHeader><CardTitle>Add-ons</CardTitle></CardHeader>
              <CardContent className="flex flex-col gap-3">
                {ADDONS.map((x) => (
                  <div key={x.id} className="flex items-center justify-between gap-4 rounded-lg border p-3">
                    <div>
                      <p className="font-medium">{x.name} <span className="text-sm font-normal text-muted-foreground">+${x.priceMonthly}/mo</span></p>
                      <p className="text-sm text-muted-foreground">{x.description}</p>
                    </div>
                    {ws.addons.includes(x.id) ? <Badge tone="success">Active</Badge> : <span className="text-xs text-muted-foreground">Add from the billing portal</span>}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
