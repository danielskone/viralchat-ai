import "server-only";
import Stripe from "stripe";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { workspaces, type Plan } from "@/db/schema";
import { ACCESS_STATUSES, addonForPriceId, planForPriceId } from "./plans";

let client: Stripe | null = null;

export function stripeConfigured() {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export function getStripe(): Stripe {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error("STRIPE_SECRET_KEY is not configured");
  client ??= new Stripe(process.env.STRIPE_SECRET_KEY);
  return client;
}

/** Applies a Stripe subscription's state to its workspace. Source of truth for plan, trial and add-ons. */
export async function syncSubscription(sub: Stripe.Subscription) {
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  const active = ACCESS_STATUSES.has(sub.status);
  let plan: Plan = "free";
  const addons: string[] = [];
  let periodEnd: number | undefined;
  for (const item of sub.items.data) {
    const mapped = planForPriceId(item.price.id);
    if (mapped) {
      if (active) plan = mapped;
      periodEnd = (item as unknown as { current_period_end?: number }).current_period_end;
      continue;
    }
    const addon = addonForPriceId(item.price.id);
    if (addon && active) addons.push(addon.id);
  }
  const workspaceId = sub.metadata?.workspaceId;

  const values = {
    plan,
    addons,
    stripeCustomerId: customerId,
    stripeSubscriptionId: sub.status === "canceled" ? null : sub.id,
    subscriptionStatus: sub.status,
    currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000) : null,
    ...(sub.trial_end ? { trialEndsAt: new Date(sub.trial_end * 1000) } : {}),
  };
  if (workspaceId) {
    await db.update(workspaces).set(values).where(eq(workspaces.id, workspaceId));
  } else {
    await db.update(workspaces).set(values).where(eq(workspaces.stripeCustomerId, customerId));
  }
  return plan;
}

