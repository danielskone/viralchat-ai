import Link from "next/link";
import { redirect } from "next/navigation";
import { LogOut } from "lucide-react";
import { requireWorkspace, hasRole } from "@/lib/auth";
import { BASE_PLAN, TRIAL_DAYS, hasAccess, priceIdFor } from "@/lib/plans";
import { stripeConfigured } from "@/lib/stripe";
import { logout } from "@/app/(auth)/actions";
import { switchWorkspace } from "@/lib/actions/workspace";
import { Logo } from "@/components/logo";
import { Alert } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { PlanCard } from "@/components/billing/plan-card";

export const metadata = { title: "Start your free trial" };

/** Where workspaces without an active or trialing subscription land. Lives outside the (app) gate. */
export default async function SubscribePage({ searchParams }: PageProps<"/subscribe">) {
  const ctx = await requireWorkspace();
  if (hasAccess(ctx.workspace)) redirect("/dashboard");
  const sp = await searchParams;
  const isOwner = hasRole(ctx.role, "owner");
  const trialUsed = Boolean(ctx.workspace.trialEndsAt);
  const ready = stripeConfigured() && Boolean(priceIdFor(BASE_PLAN.id));
  const others = ctx.workspaces.filter((w) => w.id !== ctx.workspace.id);

  return (
    <div className="mx-auto flex min-h-screen max-w-xl flex-col px-4 py-10">
      <div className="flex items-center justify-between">
        <Logo />
        <form action={logout}>
          <button className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><LogOut className="size-4" /> Log out</button>
        </form>
      </div>
      <div className="mt-10">
        <p className="text-sm font-medium text-primary">{ctx.workspace.name}</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">{trialUsed ? "Your ViralChat Pro access has ended" : `Start your ${TRIAL_DAYS}-day free trial`}</h1>
        <p className="mt-2 text-muted-foreground">
          {trialUsed
            ? `Subscribe to ${BASE_PLAN.name} to keep your automations, inbox and contacts running. Your data is still here.`
            : `Try everything in ${BASE_PLAN.name} free for ${TRIAL_DAYS} days. You won’t be charged until the trial ends, and you can cancel anytime before then.`}
        </p>
      </div>
      <div className="mt-6 flex flex-col gap-3">
        {sp.pending && <Alert tone="info" title="Almost there">Stripe is still confirming your subscription. Refresh this page in a few seconds.</Alert>}
        {sp.canceled && <Alert tone="info">Checkout was canceled. You haven’t been charged.</Alert>}
        {typeof sp.error === "string" && <Alert tone="danger">{sp.error}</Alert>}
        {!ready && <Alert tone="warning" title="Payments aren’t set up yet">Please check back shortly.</Alert>}
        {!isOwner && <Alert tone="info">Only the workspace owner can start the subscription. Ask them to log in and start it.</Alert>}
      </div>
      <PlanCard className="mt-6" trial={!trialUsed}>
        {isOwner && (
          <form action="/api/billing/checkout" method="post">
            <Button variant="gradient" size="lg" className="w-full" disabled={!ready}>
              {trialUsed ? `Subscribe for $${BASE_PLAN.priceMonthly}/month` : "Start free trial"}
            </Button>
          </form>
        )}
        {!trialUsed && <p className="mt-3 text-center text-xs text-muted-foreground">Card required. Cancel before day {TRIAL_DAYS} and you pay nothing.</p>}
      </PlanCard>
      {isOwner && ctx.workspace.stripeCustomerId && ready && (
        <form action="/api/billing/portal" method="post" className="mt-4 text-center">
          <button className="text-sm text-muted-foreground underline hover:text-foreground">View past invoices</button>
        </form>
      )}
      {others.length > 0 && (
        <div className="mt-8 border-t pt-6">
          <p className="text-sm text-muted-foreground">Switch to another workspace</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {others.map((w) => (
              <form key={w.id} action={switchWorkspace}>
                <input type="hidden" name="workspaceId" value={w.id} />
                <Button variant="outline" size="sm">{w.name}</Button>
              </form>
            ))}
          </div>
        </div>
      )}
      <p className="mt-8 text-center text-xs text-muted-foreground">
        By subscribing you agree to our <Link href="/terms" className="underline">Terms</Link>.
      </p>
    </div>
  );
}
