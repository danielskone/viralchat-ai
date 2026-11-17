import "server-only";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import { bookingPages, bookings, conversations, memberships, notifications, type BookingPage } from "@/db/schema";
import { DEFAULT_WEEKLY_HOURS, computeSlots, isValidTimeZone, slugify } from "./booking";
import { signState, verifyState } from "./crypto";

export function appUrl() {
  return (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
}

/** Returns the workspace's booking page, creating a disabled one with sensible defaults the first time. */
export async function getOrCreateBookingPage(ws: { id: string; name: string; timezone: string }): Promise<BookingPage> {
  const [existing] = await db.select().from(bookingPages).where(eq(bookingPages.workspaceId, ws.id)).limit(1);
  if (existing) return existing;
  const base = slugify(ws.name);
  for (let i = 0; i < 5; i++) {
    const slug = i === 0 ? base : `${base}-${Math.random().toString(36).slice(2, 6)}`;
    const [row] = await db
      .insert(bookingPages)
      .values({
        workspaceId: ws.id,
        slug,
        title: `Book a call with ${ws.name}`,
        timezone: isValidTimeZone(ws.timezone) ? ws.timezone : "America/New_York",
        weeklyHours: DEFAULT_WEEKLY_HOURS,
        stageOnBooking: "appointment",
        confirmationMessage: "You're booked, {{first_name}}! See you on {{booking_time}}.",
      })
      .onConflictDoNothing()
      .returning();
    if (row) return row;
    const [mine] = await db.select().from(bookingPages).where(eq(bookingPages.workspaceId, ws.id)).limit(1);
    if (mine) return mine;
  }
  throw new Error("Could not create a booking page");
}

export async function takenSlots(workspaceId: string) {
  return db
    .select({ startsAt: bookings.startsAt, endsAt: bookings.endsAt })
    .from(bookings)
    .where(and(eq(bookings.workspaceId, workspaceId), eq(bookings.status, "confirmed"), gte(bookings.endsAt, sql`now() - interval '1 day'`)));
}

export async function openSlots(page: BookingPage, now = new Date()) {
  return computeSlots(page, await takenSlots(page.workspaceId), now);
}

/** Personal booking link for a contact: bookings made through it attach to that contact. Valid 30 days. */
export async function bookingLinkFor(workspaceId: string, contactId: string): Promise<string> {
  const [page] = await db.select().from(bookingPages).where(eq(bookingPages.workspaceId, workspaceId)).limit(1);
  if (!page || !page.enabled) return "";
  const token = signState({ ws: workspaceId, c: contactId }, 30 * 24 * 3600);
  return `${appUrl()}/book/${page.slug}?c=${encodeURIComponent(token)}`;
}

export function readContactToken(token: string | null | undefined): { ws: string; c: string } | null {
  if (!token) return null;
  try {
    return verifyState<{ ws: string; c: string }>(token);
  } catch {
    return null;
  }
}

export async function notifyMembers(workspaceId: string, title: string, body: string, href: string) {
  const members = await db.select({ userId: memberships.userId }).from(memberships).where(eq(memberships.workspaceId, workspaceId));
  if (members.length) await db.insert(notifications).values(members.map((m) => ({ workspaceId, userId: m.userId, title, body, href })));
}

/** The contact's most recent real (Instagram/Messenger) conversation, used to DM a confirmation. */
export async function latestConversation(workspaceId: string, contactId: string) {
  const [conv] = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.workspaceId, workspaceId), eq(conversations.contactId, contactId), sql`${conversations.channel} in ('instagram','messenger')`))
    .orderBy(desc(conversations.lastMessageAt))
    .limit(1);
  return conv ?? null;
}

export function formatInZone(at: Date, timeZone: string, opts: Intl.DateTimeFormatOptions = { dateStyle: "full", timeStyle: "short" }) {
  return new Intl.DateTimeFormat("en-US", { timeZone, ...opts }).format(at);
}
