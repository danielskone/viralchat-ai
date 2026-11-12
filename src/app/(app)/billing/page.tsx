import { and, count, eq, ne } from "drizzle-orm";
import { Check } from "lucide-react";
import { db } from "@/db";
import { automations, contacts, memberships } from "@/db/schema";
import { requireWorkspace, hasRole } from "@/lib/auth";
import { PLANS, getPlan, formatLimit, priceIdFor } from "@/lib/plans";
import { stripeConfigured } from "@/lib/stripe";
import { monthlyUsage } from "@/lib/engine/runtime";
import { Alert, Badge, Card, CardContent, CardHeader, CardTitle, PageHeader } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
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
  const plan = getPlan(ctx.workspace.plan);
  const isOwner = hasRole(ctx.role, "owner");
  const [[c], [a], [m], usage] = await Promise.all([
    db.select({ n: count() }).from(contacts).where(and(eq(contacts.workspaceId, ctx.workspace.id), ne(contacts.source, "test"))),
    db.select({ n: count() }).from(automations).where(and(eq(automations.workspaceId, ctx.workspace.id), eq(automations.status, "active"))),
    db.select({ n: count() }).from(memberships).where(eq(memberships.workspaceId, ctx.workspace.id)),
    monthlyUsage(ctx.workspace.id),
  ]);
  const configured = stripeConfigured();
  return (
    <>
      <PageHeader title="Billing" description="Plans and usage for this workspace." />
      <div className="mb-6 flex flex-col gap-3">
        {sp.success && <Alert tone="success" title="Thanks! Your subscription is being activated.">It can take a few seconds for Stripe to confirm. Refresh if your plan hasn’t updated.</Alert>}
        {sp.canceled && <Alert tone="info">Checkout was canceled. You haven’t been charged.</Alert>}
        {typeof sp.error === "string" && <Alert tone="danger">{sp.error}</Alert>}
        {!configured && <Alert tone="warning" title="Payments are not configured">Set STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET and STRIPE_PRICE_* on the server to enable upgrades.</Alert>}
        {ctx.workspace.subscriptionStatus === "past_due" && <Alert tone="danger" title="Payment failed">Update your payment method in the billing portal to keep your plan.</Alert>}
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">Current plan <Badge tone="primary">{plan.name}</Badge></CardTitle>
            {ctx.workspace.currentPeriodEnd && <p className="text-sm text-muted-foreground">Renews {ctx.workspace.currentPeriodEnd.toLocaleDateString()} · {ctx.workspace.subscriptionStatus}</p>}
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Meter label="Contacts" used={c?.n ?? 0} limit={plan.limits.contacts} />
            <Meter label="Active automations" used={a?.n ?? 0} limit={plan.limits.activeAutomations} />
            <Meter label="Automation runs this month" used={usage.runs} limit={plan.limits.monthlyAutomationRuns} />
            <Meter label="AI replies this month" used={usage.aiReplies} limit={plan.limits.monthlyAiReplies} />
            <Meter label="Team members" used={m?.n ?? 0} limit={plan.limits.members} />
            {isOwner && ctx.workspace.stripeCustomerId && configured && (
              <form action="/api/billing/portal" method="post"><Button variant="outline" className="w-full">Manage payment & invoices</Button></form>
            )}
            <p className="text-xs text-muted-foreground">Meta messaging is free within the 24-hour window. AI replies using your own OpenAI key are billed by OpenAI directly.</p>
          </CardContent>
        </Card>
        <div className="grid gap-4 sm:grid-cols-2 lg:col-span-2">
          {PLANS.map((p) => {
            const current = p.id === plan.id;
            return (
              <Card key={p.id} className={cn("flex flex-col p-5", current && "ring-2 ring-primary")}>
                <div className="flex items-center justify-between">
                  <p className="font-semibold">{p.name}</p>
                  {current && <Badge tone="primary">Current</Badge>}
                </div>
                <p className="mt-2 text-3xl font-semibold">${p.priceMonthly}<span className="text-sm font-normal text-muted-foreground">/mo</span></p>
                <p className="text-sm text-muted-foreground">{p.tagline}</p>
                <ul className="my-4 flex flex-1 flex-col gap-1.5 text-sm">
                  {p.features.map((f) => <li key={f} className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-success" /> {f}</li>)}
                </ul>
                {p.id !== "free" && !current && isOwner && (
                  <form action="/api/billing/checkout" method="post">
                    <input type="hidden" name="plan" value={p.id} />
                    <Button variant="gradient" className="w-full" disabled={!configured || !priceIdFor(p.id)}>
                      {ctx.workspace.stripeSubscriptionId ? "Switch plan" : `Upgrade to ${p.name}`}
                    </Button>
                  </form>
                )}
                {p.id === "free" && !current && isOwner && ctx.workspace.stripeCustomerId && (
                  <form action="/api/billing/portal" method="post"><Button variant="outline" className="w-full" disabled={!configured}>Cancel subscription</Button></form>
                )}
              </Card>
            );
          })}
        </div>
      </div>
    </>
  );
}
