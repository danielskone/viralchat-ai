import { NextResponse } from "next/server";
import { getWorkspaceContext } from "@/lib/auth";
import { ACCESS_STATUSES, hasAccess } from "@/lib/plans";
import { getStripe, stripeConfigured, syncSubscription } from "@/lib/stripe";

/**
 * Stripe Checkout sends the customer here after paying or starting a trial. We sync the subscription
 * right away instead of waiting for the webhook, so they land in the app already unlocked.
 */
export async function GET(req: Request) {
  const ctx = await getWorkspaceContext();
  if (!ctx) return NextResponse.redirect(new URL("/login", req.url), 303);
  let unlocked = hasAccess(ctx.workspace);
  const sessionId = new URL(req.url).searchParams.get("session_id");
  if (sessionId && stripeConfigured()) {
    try {
      const session = await getStripe().checkout.sessions.retrieve(sessionId, { expand: ["subscription"] });
      const sub = session.subscription;
      if (session.client_reference_id === ctx.workspace.id && sub && typeof sub !== "string") {
        sub.metadata = { ...sub.metadata, workspaceId: ctx.workspace.id };
        unlocked = ACCESS_STATUSES.has(sub.status) && (await syncSubscription(sub)) !== "free";
      }
    } catch {
      // The webhook will catch up; /subscribe shows a "still activating" note meanwhile.
    }
  }
  return NextResponse.redirect(new URL(unlocked ? "/dashboard?welcome=1" : "/subscribe?pending=1", req.url), 303);
}
