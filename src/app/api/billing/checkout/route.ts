import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { workspaces } from "@/db/schema";
import { getWorkspaceContext, hasRole } from "@/lib/auth";
import { getStripe, stripeConfigured } from "@/lib/stripe";
import { BASE_PLAN, TRIAL_DAYS, hasAccess, priceIdFor } from "@/lib/plans";
import { audit } from "@/lib/audit";

/** Starts the base-plan subscription (with the free trial the first time) in Stripe Checkout. */
export async function POST(req: Request) {
  const ctx = await getWorkspaceContext();
  if (!ctx) return NextResponse.redirect(new URL("/login", req.url), 303);
  const page = hasAccess(ctx.workspace) ? "/billing" : "/subscribe";
  const back = (msg: string) => NextResponse.redirect(new URL(`${page}?error=${encodeURIComponent(msg)}`, req.url), 303);
  if (!hasRole(ctx.role, "owner")) return back("Only the workspace owner can manage billing.");
  if (!stripeConfigured()) return back("Payments are not set up yet.");
  const price = priceIdFor(BASE_PLAN.id);
  if (!price) return back(`Missing Stripe price id (${BASE_PLAN.stripePriceEnv}).`);

  const stripe = getStripe();
  const appUrl = process.env.APP_URL ?? new URL(req.url).origin;

  // Existing subscribers manage their plan, card and cancellation in the billing portal.
  if (ctx.workspace.stripeSubscriptionId && ctx.workspace.stripeCustomerId) {
    const portal = await stripe.billingPortal.sessions.create({ customer: ctx.workspace.stripeCustomerId, return_url: `${appUrl}/billing` });
    return NextResponse.redirect(portal.url, 303);
  }

  let customerId = ctx.workspace.stripeCustomerId;
  if (!customerId) {
    const customer = await stripe.customers.create({ email: ctx.user.email, name: ctx.workspace.name, metadata: { workspaceId: ctx.workspace.id } });
    customerId = customer.id;
    await db.update(workspaces).set({ stripeCustomerId: customerId }).where(eq(workspaces.id, ctx.workspace.id));
  }
  // One free trial per workspace.
  const trial = !ctx.workspace.trialEndsAt;
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price, quantity: 1 }],
    client_reference_id: ctx.workspace.id,
    payment_method_collection: "always",
    subscription_data: {
      metadata: { workspaceId: ctx.workspace.id },
      ...(trial ? { trial_period_days: TRIAL_DAYS, trial_settings: { end_behavior: { missing_payment_method: "cancel" as const } } } : {}),
    },
    allow_promotion_codes: true,
    success_url: `${appUrl}/api/billing/return?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl}${page}?canceled=1`,
  });
  await audit(ctx.workspace.id, ctx.user.id, "billing.checkout_started", trial ? "trial" : BASE_PLAN.id);
  return NextResponse.redirect(session.url!, 303);
}
