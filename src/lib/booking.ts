import type { WeeklyHours } from "@/db/schema";

/** Milliseconds the time zone is ahead of UTC at the given instant. */
export function tzOffsetMs(at: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);
  const n = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(n("year"), n("month") - 1, n("day"), n("hour"), n("minute"), n("second"));
  return asUtc - Math.floor(at.getTime() / 1000) * 1000;
}

/** Converts a wall-clock date ("2026-11-20") and time ("09:30") in a time zone to a UTC instant. */
export function zonedToUtc(ymd: string, hm: string, timeZone: string): Date {
  const [y, m, d] = ymd.split("-").map(Number) as [number, number, number];
  const [h, mi] = hm.split(":").map(Number) as [number, number];
  const guess = Date.UTC(y, m - 1, d, h, mi);
  let t = guess - tzOffsetMs(new Date(guess), timeZone);
  // Re-check once so times right after a DST change land on the right offset.
  t = guess - tzOffsetMs(new Date(t), timeZone);
  return new Date(t);
}

/** The local calendar date ("YYYY-MM-DD") of an instant in a time zone. */
export function localYmd(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
}

export function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export function weekdayOf(ymd: string): number {
  const [y, m, d] = ymd.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const toMin = (hm: string) => {
  const [h, m] = hm.split(":").map(Number) as [number, number];
  return h * 60 + m;
};

export type SlotConfig = {
  timezone: string;
  weeklyHours: WeeklyHours;
  durationMinutes: number;
  bufferMinutes: number;
  minNoticeHours: number;
  maxDaysAhead: number;
};

export type DaySlots = { date: string; slots: string[] };

/**
 * Lists open start times (ISO strings) per local day, skipping times that are too soon,
 * outside opening hours, or that overlap an existing booking (plus buffer on both sides).
 */
export function computeSlots(cfg: SlotConfig, taken: { startsAt: Date; endsAt: Date }[], now: Date): DaySlots[] {
  const dur = cfg.durationMinutes * 60_000;
  const buf = cfg.bufferMinutes * 60_000;
  const earliest = now.getTime() + cfg.minNoticeHours * 3_600_000;
  const today = localYmd(now, cfg.timezone);
  const out: DaySlots[] = [];
  for (let i = 0; i <= cfg.maxDaysAhead; i++) {
    const date = addDaysYmd(today, i);
    const windows = cfg.weeklyHours[String(weekdayOf(date))] ?? [];
    const slots: string[] = [];
    for (const w of windows) {
      const endMin = toMin(w.end);
      for (let m = toMin(w.start); m + cfg.durationMinutes <= endMin; m += cfg.durationMinutes + cfg.bufferMinutes) {
        const hm = `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
        const start = zonedToUtc(date, hm, cfg.timezone).getTime();
        if (start < earliest) continue;
        const end = start + dur;
        const clash = taken.some((b) => start < b.endsAt.getTime() + buf && end + buf > b.startsAt.getTime());
        if (!clash) slots.push(new Date(start).toISOString());
      }
    }
    if (slots.length) out.push({ date, slots });
  }
  return out;
}

export const DEFAULT_WEEKLY_HOURS: WeeklyHours = {
  "1": [{ start: "09:00", end: "17:00" }],
  "2": [{ start: "09:00", end: "17:00" }],
  "3": [{ start: "09:00", end: "17:00" }],
  "4": [{ start: "09:00", end: "17:00" }],
  "5": [{ start: "09:00", end: "17:00" }],
};

export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "book";
}
