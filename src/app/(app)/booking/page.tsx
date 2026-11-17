import Link from "next/link";
import { and, asc, eq, gte } from "drizzle-orm";
import { CalendarDays, ExternalLink } from "lucide-react";
import { db } from "@/db";
import { bookings } from "@/db/schema";
import { requireWorkspace, hasRole } from "@/lib/auth";
import { appUrl, formatInZone, getOrCreateBookingPage } from "@/lib/booking-server";
import { cancelBooking } from "@/lib/actions/booking";
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState, PageHeader } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { CopyButton } from "./copy-button";
import { BookingSettingsForm } from "./settings-form";

export const metadata = { title: "Appointment Booking" };

export default async function BookingPage() {
  const ctx = await requireWorkspace();
  const page = await getOrCreateBookingPage(ctx.workspace);
  const upcoming = await db
    .select()
    .from(bookings)
    .where(and(eq(bookings.workspaceId, ctx.workspace.id), eq(bookings.status, "confirmed"), gte(bookings.endsAt, new Date())))
    .orderBy(asc(bookings.startsAt))
    .limit(100);
  const url = `${appUrl()}/book/${page.slug}`;

  return (
    <>
      <PageHeader title="Appointment Booking" description="Let people book a time with you from a link. Send it in a DM with {{booking_link}} in any automation." />
      <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                Your booking link {page.enabled ? <Badge tone="success">Live</Badge> : <Badge>Off</Badge>}
              </CardTitle>
              <CardDescription>
                {page.enabled
                  ? "Share it anywhere. In automations, use {{booking_link}} so the booking is linked to that person's contact."
                  : "Turn on booking in the settings to make this link work."}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-lg border bg-muted/50 px-3 py-2 text-sm">{url}</code>
              <CopyButton text={url} />
              {page.enabled && (
                <Link href={`/book/${page.slug}`} target="_blank" className="inline-flex h-9 items-center gap-1 rounded-lg border px-3 text-sm hover:bg-muted">
                  Open <ExternalLink className="size-3.5" />
                </Link>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Upcoming appointments</CardTitle>
              <CardDescription>Times shown in {page.timezone}.</CardDescription>
            </CardHeader>
            <CardContent>
              {upcoming.length === 0 ? (
                <EmptyState icon={<CalendarDays className="size-5" />} title="No upcoming appointments" description="New bookings show up here, in your notifications, and on the contact's timeline." />
              ) : (
                <ul className="divide-y">
                  {upcoming.map((b) => (
                    <li key={b.id} className="flex flex-wrap items-center gap-3 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">{formatInZone(b.startsAt, page.timezone, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</p>
                        <p className="truncate text-sm text-muted-foreground">
                          {b.contactId ? <Link className="hover:underline" href={`/contacts/${b.contactId}`}>{b.name}</Link> : b.name}
                          {b.email ? ` · ${b.email}` : ""}
                          {b.phone ? ` · ${b.phone}` : ""}
                        </p>
                        {b.notes && <p className="mt-1 line-clamp-2 text-sm">{b.notes}</p>}
                      </div>
                      <form action={cancelBooking}>
                        <input type="hidden" name="id" value={b.id} />
                        <Button size="sm" variant="ghost">Cancel</Button>
                      </form>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Booking settings</CardTitle>
            <CardDescription>Your hours, meeting length, and what happens after someone books.</CardDescription>
          </CardHeader>
          <CardContent>
            <BookingSettingsForm page={page} disabled={!hasRole(ctx.role, "admin")} />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
