import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { workspaces, type Plan } from "@/db/schema";
import { getWorkspaceContext, hasRole } from "@/lib/auth";
import { getStripe, stripeConfigured } from "@/lib/stripe";
import { priceIdFor, PLANS } from "@/lib/plans";
import { audit } from "@/lib/audit";

export async function POST(req: Request) {
  const ctx = await getWorkspaceContext();
  if (!ctx) return NextResponse.redirect(new URL("/login", req.url), 303);
  const back = (q: string) => NextResponse.redirect(new URL(`/billing?${q}`, req.url), 303);
  if (!hasRole(ctx.role, "owner")) return back("error=Only%20the%20workspace%20owner%20can%20change%20billing");
  if (!stripeConfigured()) return back("error=Stripe%20is%20not%20configured%20on%20the%20server");
  const form = await req.formData();
  const plan = String(form.get("plan")) as Plan;
  if (!PLANS.some((p) => p.id === plan) || plan === "free") return back("error=Unknown%20plan");
  const price = priceIdFor(plan);
  if (!price) return back(`error=${encodeURIComponent(`Missing Stripe price id for ${plan} (STRIPE_PRICE_${plan.toUpperCase()})`)}`);

  const stripe = getStripe();
  const appUrl = process.env.APP_URL ?? new URL(req.url).origin;

  // Existing subscribers change plans through the billing portal to get proration right.
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
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price, quantity: 1 }],
    client_reference_id: ctx.workspace.id,
    subscription_data: { metadata: { workspaceId: ctx.workspace.id } },
    allow_promotion_codes: true,
    success_url: `${appUrl}/billing?success=1`,
    cancel_url: `${appUrl}/billing?canceled=1`,
  });
  await audit(ctx.workspace.id, ctx.user.id, "billing.checkout_started", plan);
  return NextResponse.redirect(session.url!, 303);
}
