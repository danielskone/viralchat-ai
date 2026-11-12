import "server-only";
import Stripe from "stripe";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { workspaces, type Plan } from "@/db/schema";
import { planForPriceId } from "./plans";

let client: Stripe | null = null;

export function stripeConfigured() {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export function getStripe(): Stripe {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error("STRIPE_SECRET_KEY is not configured");
  client ??= new Stripe(process.env.STRIPE_SECRET_KEY);
  return client;
}

const ACTIVE = new Set(["active", "trialing", "past_due"]);

/** Applies a Stripe subscription's state to its workspace. Source of truth for plan changes. */
export async function syncSubscription(sub: Stripe.Subscription) {
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  const item = sub.items.data[0];
  const priceId = item?.price.id;
  const mapped = priceId ? planForPriceId(priceId) : null;
  const plan: Plan = ACTIVE.has(sub.status) && mapped ? mapped : "free";
  const periodEnd = (item as unknown as { current_period_end?: number } | undefined)?.current_period_end;
  const workspaceId = sub.metadata?.workspaceId;

  const values = {
    plan,
    stripeCustomerId: customerId,
    stripeSubscriptionId: sub.status === "canceled" ? null : sub.id,
    subscriptionStatus: sub.status,
    currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000) : null,
  };
  if (workspaceId) {
    await db.update(workspaces).set(values).where(eq(workspaces.id, workspaceId));
  } else {
    await db.update(workspaces).set(values).where(eq(workspaces.stripeCustomerId, customerId));
  }
  return plan;
}
