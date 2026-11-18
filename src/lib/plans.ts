import type { Plan, Workspace } from "@/db/schema";

export type PlanLimits = {
  contacts: number;
  activeAutomations: number;
  monthlyAutomationRuns: number;
  members: number;
  aiChatbot: boolean;
  monthlyAiReplies: number;
};

export type PlanConfig = {
  id: Plan;
  name: string;
  priceMonthly: number;
  tagline: string;
  features: string[];
  limits: PlanLimits;
  stripePriceEnv?: string;
};

/** An extra subscription item sold on top of the base plan. Add entries here to sell add-ons. */
export type AddonConfig = {
  id: string;
  name: string;
  priceMonthly: number;
  description: string;
  stripePriceEnv: string;
  /** Raises the base plan's limits while the add-on is active. */
  extraLimits?: Partial<Record<"contacts" | "monthlyAutomationRuns" | "monthlyAiReplies" | "members", number>>;
};

const UNLIMITED = Number.POSITIVE_INFINITY;

/** Length of the free trial on the base plan, in days. */
export const TRIAL_DAYS = 30;

/** "free" is what a workspace has with no subscription: it can't use the app until it starts a trial. */
const NO_PLAN: PlanConfig = {
  id: "free",
  name: "No plan",
  priceMonthly: 0,
  tagline: "Start your free trial to use ViralChat",
  features: [],
  limits: { contacts: 0, activeAutomations: 0, monthlyAutomationRuns: 0, members: 1, aiChatbot: false, monthlyAiReplies: 0 },
};

export const BASE_PLAN: PlanConfig = {
  id: "pro",
  name: "ViralChat Pro",
  priceMonthly: 47,
  tagline: "Everything you need to automate Instagram & Messenger",
  features: [
    `${TRIAL_DAYS}-day free trial`,
    "Up to 10,000 contacts",
    "Unlimited automations",
    "25,000 automation runs / month",
    "AI chatbot (2,000 replies / mo)",
    "Inbox, CRM, pipeline & broadcasts",
    "Booking, landing pages & email follow-ups",
    "5 team members",
  ],
  limits: { contacts: 10000, activeAutomations: UNLIMITED, monthlyAutomationRuns: 25000, members: 5, aiChatbot: true, monthlyAiReplies: 2000 },
  stripePriceEnv: "STRIPE_PRICE_PRO",
};

export const PLANS: PlanConfig[] = [NO_PLAN, BASE_PLAN];

/** Add-on subscriptions. Empty for now; each entry needs a recurring Stripe price in its env var. */
export const ADDONS: AddonConfig[] = [];

/** Subscription statuses that keep the app unlocked. past_due gives the customer time to fix their card. */
export const ACCESS_STATUSES = new Set(["active", "trialing", "past_due"]);

export function getPlan(id: Plan | string | null | undefined): PlanConfig {
  return PLANS.find((p) => p.id === id) ?? NO_PLAN;
}

/** Billing is only enforced once Stripe is set up, so the app keeps working before then. */
export function billingEnforced() {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

type BillingFields = Pick<Workspace, "plan" | "billingExempt" | "subscriptionStatus"> & Partial<Pick<Workspace, "addons">>;

/** True when the workspace may use the app: exempt, billing not set up yet, or on an active/trialing subscription. */
export function hasAccess(ws: BillingFields | null | undefined) {
  if (!ws) return false;
  if (ws.billingExempt || !billingEnforced()) return true;
  return ACCESS_STATUSES.has(ws.subscriptionStatus ?? "") && ws.plan !== "free";
}

/** The plan whose limits apply to a workspace right now, including any add-ons. */
export function workspacePlan(ws: BillingFields | null | undefined): PlanConfig {
  const base = ws && hasAccess(ws) ? BASE_PLAN : NO_PLAN;
  const addons = ADDONS.filter((a) => ws?.addons?.includes(a.id));
  if (!addons.length) return base;
  const limits = { ...base.limits };
  for (const a of addons) {
    for (const [k, v] of Object.entries(a.extraLimits ?? {})) {
      const key = k as keyof NonNullable<AddonConfig["extraLimits"]>;
      limits[key] += v ?? 0;
    }
  }
  return { ...base, limits };
}

export function priceIdFor(plan: Plan): string | undefined {
  const cfg = getPlan(plan);
  return cfg.stripePriceEnv ? process.env[cfg.stripePriceEnv] || undefined : undefined;
}

export function planForPriceId(priceId: string): Plan | null {
  for (const p of PLANS) {
    if (p.stripePriceEnv && process.env[p.stripePriceEnv] === priceId) return p.id;
  }
  return null;
}

export function addonForPriceId(priceId: string): AddonConfig | null {
  return ADDONS.find((a) => process.env[a.stripePriceEnv] === priceId) ?? null;
}

export function formatLimit(n: number) {
  return Number.isFinite(n) ? n.toLocaleString() : "Unlimited";
}
