"use client";
import { useActionState, useMemo, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import type { DaySlots } from "@/lib/booking";
import { createPublicBooking, type PublicBookingState } from "@/lib/actions/booking";
import { Alert, Field, Input, Textarea } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { cn } from "@/lib/utils";

export function BookingFlow({ slug, timezone, days, contactToken }: { slug: string; timezone: string; days: DaySlots[]; contactToken: string }) {
  const [state, action] = useActionState<PublicBookingState, FormData>(createPublicBooking, undefined);
  const [date, setDate] = useState(days[0]?.date ?? "");
  const [start, setStart] = useState<string | null>(null);
  const fmt = useMemo(
    () => ({
      day: new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" }),
      time: new Intl.DateTimeFormat("en-US", { timeZone: timezone, hour: "numeric", minute: "2-digit" }),
      full: new Intl.DateTimeFormat("en-US", { timeZone: timezone, dateStyle: "full", timeStyle: "short" }),
    }),
    [timezone],
  );

  if (state?.booked) {
    return (
      <div className="flex flex-col items-center gap-3 py-6 text-center">
        <CheckCircle2 className="size-12 text-success" />
        <h2 className="text-xl font-semibold">You&apos;re booked!</h2>
        <p className="text-muted-foreground">{state.booked.when}</p>
        <p className="text-sm text-muted-foreground">You can close this page.</p>
      </div>
    );
  }
  if (days.length === 0) return <p className="rounded-xl border bg-muted/50 p-4 text-sm">No open times right now. Please check back later or message us.</p>;

  const slots = days.find((d) => d.date === date)?.slots ?? [];
  const dayLabel = (ymd: string) => fmt.day.format(new Date(`${ymd}T12:00:00Z`));

  if (start) {
    return (
      <form action={action} className="flex flex-col gap-4">
        <input type="hidden" name="slug" value={slug} />
        <input type="hidden" name="start" value={start} />
        <input type="hidden" name="c" value={contactToken} />
        <div className="flex items-center justify-between gap-2 rounded-xl border bg-muted/40 p-3">
          <p className="font-medium">{fmt.full.format(new Date(start))}</p>
          <Button type="button" variant="ghost" size="sm" onClick={() => setStart(null)}>Change</Button>
        </div>
        {state?.error && <Alert tone="danger">{state.error}</Alert>}
        <Field label="Your name" htmlFor="b-name"><Input id="b-name" name="name" required maxLength={120} autoComplete="name" /></Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Email" htmlFor="b-email"><Input id="b-email" name="email" type="email" maxLength={200} autoComplete="email" /></Field>
          <Field label="Phone" htmlFor="b-phone"><Input id="b-phone" name="phone" type="tel" maxLength={40} autoComplete="tel" /></Field>
        </div>
        <Field label="Anything we should know?" htmlFor="b-notes"><Textarea id="b-notes" name="notes" rows={3} maxLength={1000} /></Field>
        <SubmitButton variant="gradient" size="lg" pendingText="Booking…">Confirm booking</SubmitButton>
      </form>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {state?.error && <Alert tone="danger">{state.error}</Alert>}
      <div>
        <p className="mb-2 text-sm font-medium">Pick a day</p>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {days.map((d) => (
            <button
              key={d.date}
              type="button"
              onClick={() => setDate(d.date)}
              className={cn("shrink-0 rounded-xl border px-3 py-2 text-sm", d.date === date ? "brand-gradient border-transparent text-white" : "bg-card hover:bg-muted")}
            >
              {dayLabel(d.date)}
            </button>
          ))}
        </div>
      </div>
      <div>
        <p className="mb-2 text-sm font-medium">Pick a time</p>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {slots.map((s) => (
            <button key={s} type="button" onClick={() => setStart(s)} className="rounded-xl border bg-card px-2 py-2.5 text-sm font-medium hover:border-primary hover:bg-accent">
              {fmt.time.format(new Date(s))}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
