import { NextResponse } from "next/server";
import { getWorkspaceContext, hasRole } from "@/lib/auth";
import { getStripe, stripeConfigured } from "@/lib/stripe";

export async function POST(req: Request) {
  const ctx = await getWorkspaceContext();
  if (!ctx) return NextResponse.redirect(new URL("/login", req.url), 303);
  if (!hasRole(ctx.role, "owner") || !stripeConfigured() || !ctx.workspace.stripeCustomerId) {
    return NextResponse.redirect(new URL("/billing?error=Billing%20portal%20unavailable", req.url), 303);
  }
  const appUrl = process.env.APP_URL ?? new URL(req.url).origin;
  const portal = await getStripe().billingPortal.sessions.create({ customer: ctx.workspace.stripeCustomerId, return_url: `${appUrl}/billing` });
  return NextResponse.redirect(portal.url, 303);
}
