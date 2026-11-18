import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BASE_PLAN, hasAccess, planForPriceId, workspacePlan } from "../src/lib/plans";

const ws = (over: Partial<{ plan: "free" | "pro"; billingExempt: boolean; subscriptionStatus: string | null }> = {}) => ({
  plan: "free" as "free" | "pro",
  billingExempt: false,
  subscriptionStatus: null as string | null,
  addons: [] as string[],
  ...over,
});

describe("billing access", () => {
  const saved = { ...process.env };
  beforeEach(() => {
    process.env.STRIPE_SECRET_KEY = "sk_test_x";
    process.env.STRIPE_PRICE_PRO = "price_pro";
  });
  afterEach(() => {
    process.env = { ...saved };
  });

  it("locks a workspace with no subscription", () => {
    expect(hasAccess(ws())).toBe(false);
    expect(workspacePlan(ws()).limits.monthlyAutomationRuns).toBe(0);
  });

  it("unlocks trialing, active and past_due subscriptions on the base plan", () => {
    for (const status of ["trialing", "active", "past_due"]) {
      expect(hasAccess(ws({ plan: "pro", subscriptionStatus: status }))).toBe(true);
      expect(workspacePlan(ws({ plan: "pro", subscriptionStatus: status })).id).toBe("pro");
    }
  });

  it("locks canceled and unpaid subscriptions", () => {
    expect(hasAccess(ws({ plan: "free", subscriptionStatus: "canceled" }))).toBe(false);
    expect(hasAccess(ws({ plan: "free", subscriptionStatus: "unpaid" }))).toBe(false);
  });

  it("gives exempt workspaces the full plan", () => {
    expect(hasAccess(ws({ billingExempt: true }))).toBe(true);
    expect(workspacePlan(ws({ billingExempt: true })).limits).toEqual(BASE_PLAN.limits);
  });

  it("leaves the app open while Stripe isn't configured", () => {
    delete process.env.STRIPE_SECRET_KEY;
    expect(hasAccess(ws())).toBe(true);
  });

  it("maps the base price id to the pro plan", () => {
    expect(planForPriceId("price_pro")).toBe("pro");
    expect(planForPriceId("price_other")).toBeNull();
  });
});
