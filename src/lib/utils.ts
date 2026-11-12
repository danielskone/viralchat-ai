import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("") || "?";
}

export function timeAgo(date: Date | string) {
  const d = typeof date === "string" ? new Date(date) : date;
  const s = Math.round((Date.now() - d.getTime()) / 1000);
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.round(h / 24);
  if (days < 30) return `${days}d ago`;
  return d.toLocaleDateString();
}

export const STAGES = [
  { id: "new_lead", label: "New Lead" },
  { id: "contacted", label: "Contacted" },
  { id: "qualified", label: "Qualified" },
  { id: "appointment", label: "Appointment Scheduled" },
  { id: "proposal", label: "Proposal Sent" },
  { id: "won", label: "Won" },
  { id: "lost", label: "Lost" },
] as const;

export function stageLabel(id: string) {
  return STAGES.find((s) => s.id === id)?.label ?? id;
}

export function temperatureFromScore(score: number): "hot" | "warm" | "cold" {
  if (score >= 70) return "hot";
  if (score >= 35) return "warm";
  return "cold";
}
