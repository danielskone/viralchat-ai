import type Stripe from "stripe";
import { db } from "@/db";
import { webhookEvents } from "@/db/schema";
import { getStripe, syncSubscription } from "@/lib/stripe";
import { audit } from "@/lib/audit";

export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret || !process.env.STRIPE_SECRET_KEY) return new Response("Stripe not configured", { status: 503 });
  const raw = await req.text();
  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(raw, req.headers.get("stripe-signature") ?? "", secret);
  } catch (e) {
    return new Response(`Invalid signature: ${e instanceof Error ? e.message : ""}`, { status: 400 });
  }
  const fresh = await db
    .insert(webhookEvents)
    .values({ source: "stripe", dedupeKey: event.id, payload: { type: event.type, id: event.id } })
    .onConflictDoNothing()
    .returning({ id: webhookEvents.id });
  if (!fresh.length) return new Response("Duplicate", { status: 200 });

  const stripe = getStripe();
  switch (event.type) {
    case "checkout.session.completed": {
      const s = event.data.object;
      if (s.mode === "subscription" && s.subscription) {
        const sub = await stripe.subscriptions.retrieve(typeof s.subscription === "string" ? s.subscription : s.subscription.id);
        if (!sub.metadata?.workspaceId && s.client_reference_id) sub.metadata = { ...sub.metadata, workspaceId: s.client_reference_id };
        const plan = await syncSubscription(sub);
        await audit(sub.metadata.workspaceId ?? null, null, "billing.subscribed", plan);
      }
      break;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      await syncSubscription(event.data.object);
      break;
    }
    default:
      break;
  }
  return new Response("ok", { status: 200 });
}
