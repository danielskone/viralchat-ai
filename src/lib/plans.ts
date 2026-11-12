import type { Plan } from "@/db/schema";

export type PlanConfig = {
  id: Plan;
  name: string;
  priceMonthly: number;
  tagline: string;
  features: string[];
  limits: {
    contacts: number;
    activeAutomations: number;
    monthlyAutomationRuns: number;
    members: number;
    aiChatbot: boolean;
    monthlyAiReplies: number;
  };
  stripePriceEnv?: string;
};

const UNLIMITED = Number.POSITIVE_INFINITY;

export const PLANS: PlanConfig[] = [
  {
    id: "free",
    name: "Free",
    priceMonthly: 0,
    tagline: "Try automations on one account",
    features: ["One workspace", "Up to 250 contacts", "2 active automations", "500 automation runs / month", "Basic templates"],
    limits: { contacts: 250, activeAutomations: 2, monthlyAutomationRuns: 500, members: 1, aiChatbot: false, monthlyAiReplies: 0 },
  },
  {
    id: "starter",
    name: "Starter",
    priceMonthly: 29,
    tagline: "Capture leads on autopilot",
    features: ["Up to 2,500 contacts", "10 active automations", "5,000 runs / month", "Contacts CRM + CSV export", "Analytics dashboard"],
    limits: { contacts: 2500, activeAutomations: 10, monthlyAutomationRuns: 5000, members: 2, aiChatbot: false, monthlyAiReplies: 0 },
    stripePriceEnv: "STRIPE_PRICE_STARTER",
  },
  {
    id: "professional",
    name: "Professional",
    priceMonthly: 79,
    tagline: "AI conversations for growing teams",
    features: ["Up to 10,000 contacts", "Unlimited automations", "25,000 runs / month", "AI chatbot (2,000 replies / mo)", "5 team members"],
    limits: { contacts: 10000, activeAutomations: UNLIMITED, monthlyAutomationRuns: 25000, members: 5, aiChatbot: true, monthlyAiReplies: 2000 },
    stripePriceEnv: "STRIPE_PRICE_PROFESSIONAL",
  },
  {
    id: "business",
    name: "Business",
    priceMonthly: 149,
    tagline: "Advanced CRM and collaboration",
    features: ["Up to 50,000 contacts", "100,000 runs / month", "AI chatbot (10,000 replies / mo)", "15 team members", "Priority support"],
    limits: { contacts: 50000, activeAutomations: UNLIMITED, monthlyAutomationRuns: 100000, members: 15, aiChatbot: true, monthlyAiReplies: 10000 },
    stripePriceEnv: "STRIPE_PRICE_BUSINESS",
  },
  {
    id: "agency",
    name: "Agency",
    priceMonthly: 299,
    tagline: "Run automations for your clients",
    features: ["Unlimited contacts", "250,000 runs / month", "AI chatbot (30,000 replies / mo)", "Unlimited team members", "Client workspaces"],
    limits: { contacts: UNLIMITED, activeAutomations: UNLIMITED, monthlyAutomationRuns: 250000, members: UNLIMITED, aiChatbot: true, monthlyAiReplies: 30000 },
    stripePriceEnv: "STRIPE_PRICE_AGENCY",
  },
];

export function getPlan(id: Plan | string | null | undefined): PlanConfig {
  return PLANS.find((p) => p.id === id) ?? PLANS[0];
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

export function formatLimit(n: number) {
  return Number.isFinite(n) ? n.toLocaleString() : "Unlimited";
}
