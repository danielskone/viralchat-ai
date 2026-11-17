"use server";
import { revalidatePath } from "next/cache";
import { and, eq, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { bookingPages, bookings, contacts, type WeeklyHours } from "@/db/schema";
import { requireWorkspace } from "@/lib/auth";
import { audit, logActivity } from "@/lib/audit";
import { isValidTimeZone, slugify } from "@/lib/booking";
import {
  formatInZone,
  getOrCreateBookingPage,
  latestConversation,
  notifyMembers,
  openSlots,
  readContactToken,
} from "@/lib/booking-server";
import { interpolate } from "@/lib/engine/matcher";
import { sendMessage } from "@/lib/messaging";
import { stageLabel } from "@/lib/utils";

export type BookingFormState = { error?: string; ok?: string } | undefined;

const HM = /^([01]\d|2[0-3]):[0-5]\d$/;

export async function saveBookingSettings(_: BookingFormState, form: FormData): Promise<BookingFormState> {
  const ctx = await requireWorkspace("admin");
  const page = await getOrCreateBookingPage(ctx.workspace);

  const num = (k: string, min: number, max: number, fallback: number) => {
    const n = Number(form.get(k));
    return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : fallback;
  };
  const timezone = String(form.get("timezone") ?? "").trim();
  if (!isValidTimeZone(timezone)) return { error: `"${timezone}" isn't a time zone we recognize. Try one like America/New_York.` };
  const slug = slugify(String(form.get("slug") ?? ""));
  const [clash] = await db.select({ id: bookingPages.id }).from(bookingPages).where(and(eq(bookingPages.slug, slug), ne(bookingPages.id, page.id))).limit(1);
  if (clash) return { error: `The link name "${slug}" is taken. Pick another.` };

  const weeklyHours: WeeklyHours = {};
  for (let d = 0; d < 7; d++) {
    if (form.get(`day${d}`) !== "on") continue;
    const start = String(form.get(`start${d}`) ?? "");
    const end = String(form.get(`end${d}`) ?? "");
    if (!HM.test(start) || !HM.test(end) || start >= end) return { error: "Each open day needs a start time before its end time." };
    weeklyHours[String(d)] = [{ start, end }];
  }
  const enabled = form.get("enabled") === "on";
  if (enabled && Object.keys(weeklyHours).length === 0) return { error: "Turn on at least one day before enabling booking." };

  await db
    .update(bookingPages)
    .set({
      enabled,
      slug,
      title: String(form.get("title") ?? "").trim().slice(0, 120) || "Book a call",
      description: String(form.get("description") ?? "").trim().slice(0, 1000) || null,
      durationMinutes: num("durationMinutes", 5, 480, 30),
      bufferMinutes: num("bufferMinutes", 0, 240, 0),
      minNoticeHours: num("minNoticeHours", 0, 720, 2),
      maxDaysAhead: num("maxDaysAhead", 1, 365, 30),
      timezone,
      weeklyHours,
      confirmationMessage: String(form.get("confirmationMessage") ?? "").trim().slice(0, 1000) || null,
      tagOnBooking: String(form.get("tagOnBooking") ?? "").trim().slice(0, 40) || null,
      stageOnBooking: String(form.get("stageOnBooking") ?? "") || null,
      updatedAt: new Date(),
    })
    .where(eq(bookingPages.id, page.id));
  await audit(ctx.workspace.id, ctx.user.id, "booking.settings", page.id, { enabled });
  revalidatePath("/booking");
  return { ok: enabled ? "Saved. Your booking page is live." : "Saved. Booking is turned off, so the page is hidden." };
}

export async function cancelBooking(form: FormData) {
  const ctx = await requireWorkspace();
  const id = String(form.get("id"));
  const [b] = await db
    .update(bookings)
    .set({ status: "cancelled" })
    .where(and(eq(bookings.id, id), eq(bookings.workspaceId, ctx.workspace.id)))
    .returning();
  if (b?.contactId) await logActivity(ctx.workspace.id, b.contactId, "booking_cancelled", `Appointment cancelled by ${ctx.user.name}`);
  await audit(ctx.workspace.id, ctx.user.id, "booking.cancel", id);
  revalidatePath("/booking");
}

const publicSchema = z.object({
  slug: z.string().min(1).max(60),
  start: z.string().datetime(),
  name: z.string().trim().min(1, "Please enter your name.").max(120),
  email: z.string().trim().email("Please enter a valid email.").max(200).or(z.literal("")),
  phone: z.string().trim().max(40),
  notes: z.string().trim().max(1000),
  c: z.string().max(2000),
});

export type PublicBookingState = { error?: string; booked?: { when: string } } | undefined;

/** Public action used by /book/[slug]. No login: validated against the live availability. */
export async function createPublicBooking(_: PublicBookingState, form: FormData): Promise<PublicBookingState> {
  const parsed = publicSchema.safeParse({
    slug: form.get("slug") ?? "",
    start: form.get("start") ?? "",
    name: form.get("name") ?? "",
    email: form.get("email") ?? "",
    phone: form.get("phone") ?? "",
    notes: form.get("notes") ?? "",
    c: form.get("c") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Please check the form." };
  const d = parsed.data;
  if (!d.email && !d.phone) return { error: "Please give an email or phone number so we can reach you." };

  const [page] = await db.select().from(bookingPages).where(eq(bookingPages.slug, d.slug)).limit(1);
  if (!page || !page.enabled) return { error: "This booking page isn't available." };

  const days = await openSlots(page);
  if (!days.some((day) => day.slots.includes(new Date(d.start).toISOString()))) {
    return { error: "Sorry, that time was just taken or is no longer available. Please pick another." };
  }
  const startsAt = new Date(d.start);
  const endsAt = new Date(startsAt.getTime() + page.durationMinutes * 60_000);

  // Attach to the contact from a personal DM link, else match by email, else create a new contact.
  const token = readContactToken(d.c);
  let contactId: string | null = null;
  if (token && token.ws === page.workspaceId) {
    const [c] = await db.select({ id: contacts.id }).from(contacts).where(and(eq(contacts.id, token.c), eq(contacts.workspaceId, page.workspaceId))).limit(1);
    contactId = c?.id ?? null;
  }
  if (!contactId && d.email) {
    const [c] = await db
      .select({ id: contacts.id })
      .from(contacts)
      .where(and(eq(contacts.workspaceId, page.workspaceId), sql`lower(${contacts.email}) = ${d.email.toLowerCase()}`))
      .limit(1);
    contactId = c?.id ?? null;
  }
  if (!contactId) {
    const [c] = await db
      .insert(contacts)
      .values({ workspaceId: page.workspaceId, name: d.name, email: d.email || null, phone: d.phone || null, source: "booking" })
      .returning({ id: contacts.id });
    contactId = c!.id;
    await logActivity(page.workspaceId, contactId, "created", "Contact created from the booking page");
  }

  let bookingId: string;
  try {
    const [b] = await db
      .insert(bookings)
      .values({ workspaceId: page.workspaceId, contactId, name: d.name, email: d.email || null, phone: d.phone || null, notes: d.notes || null, startsAt, endsAt })
      .returning({ id: bookings.id });
    bookingId = b!.id;
  } catch {
    return { error: "Sorry, someone just booked that time. Please pick another." };
  }

  // Fill in missing contact details and apply the page's tag/stage.
  const [contact] = await db.select().from(contacts).where(eq(contacts.id, contactId)).limit(1);
  if (contact) {
    const tags = page.tagOnBooking && !contact.tags.includes(page.tagOnBooking) ? [...contact.tags, page.tagOnBooking] : contact.tags;
    await db
      .update(contacts)
      .set({
        email: contact.email ?? (d.email || null),
        phone: contact.phone ?? (d.phone || null),
        name: contact.name === "Unknown" ? d.name : contact.name,
        tags,
        stage: page.stageOnBooking || contact.stage,
        lastActivityAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(contacts.id, contactId));
  }
  const when = formatInZone(startsAt, page.timezone);
  await logActivity(page.workspaceId, contactId, "booking", `Booked an appointment for ${when}${page.stageOnBooking ? ` · stage → ${stageLabel(page.stageOnBooking)}` : ""}`);
  await notifyMembers(page.workspaceId, "New appointment booked", `${d.name} booked ${when}`, `/booking`);
  await audit(page.workspaceId, null, "booking.create", bookingId);

  // Best-effort DM confirmation in the conversation the link came from.
  if (page.confirmationMessage && contact) {
    const conv = await latestConversation(page.workspaceId, contactId);
    if (conv) {
      const first = (contact.name === "Unknown" ? d.name : contact.name).split(" ")[0] ?? "";
      const text = interpolate(page.confirmationMessage, { first_name: first, name: d.name, booking_time: when });
      await sendMessage({ conversationId: conv.id, workspaceId: page.workspaceId, text, senderType: "automation" }).catch(() => undefined);
    }
  }
  revalidatePath("/booking");
  return { booked: { when } };
}
