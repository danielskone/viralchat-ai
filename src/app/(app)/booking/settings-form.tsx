"use client";
import { useActionState } from "react";
import type { BookingPage } from "@/db/schema";
import { Alert, Field, Input, Select, Textarea } from "@/components/ui/primitives";
import { SubmitButton } from "@/components/ui/submit-button";
import { saveBookingSettings, type BookingFormState } from "@/lib/actions/booking";
import { WEEKDAYS } from "@/lib/booking";
import { STAGES } from "@/lib/utils";

export function BookingSettingsForm({ page, disabled }: { page: BookingPage; disabled: boolean }) {
  const [state, action] = useActionState<BookingFormState, FormData>(saveBookingSettings, undefined);
  return (
    <form action={action} className="flex flex-col gap-4">
      <fieldset disabled={disabled} className="contents">
        {state?.error && <Alert tone="danger">{state.error}</Alert>}
        {state?.ok && <Alert tone="success">{state.ok}</Alert>}

        <label className="flex items-center gap-3 rounded-xl border p-3">
          <input type="checkbox" name="enabled" defaultChecked={page.enabled} className="size-4 accent-[var(--primary)]" />
          <span>
            <span className="font-medium">Booking is on</span>
            <span className="block text-sm text-muted-foreground">When off, the link shows &ldquo;not available&rdquo;.</span>
          </span>
        </label>

        <Field label="Page title" htmlFor="bk-title"><Input id="bk-title" name="title" defaultValue={page.title} maxLength={120} /></Field>
        <Field label="Description" htmlFor="bk-desc" hint="Optional. What the call is about.">
          <Textarea id="bk-desc" name="description" rows={2} defaultValue={page.description ?? ""} maxLength={1000} />
        </Field>
        <Field label="Link name" htmlFor="bk-slug" hint={`Your link ends in /book/${page.slug}`}>
          <Input id="bk-slug" name="slug" defaultValue={page.slug} maxLength={40} required />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Meeting length (minutes)" htmlFor="bk-dur"><Input id="bk-dur" name="durationMinutes" type="number" min={5} max={480} defaultValue={page.durationMinutes} /></Field>
          <Field label="Break between (minutes)" htmlFor="bk-buf"><Input id="bk-buf" name="bufferMinutes" type="number" min={0} max={240} defaultValue={page.bufferMinutes} /></Field>
          <Field label="Minimum notice (hours)" htmlFor="bk-notice"><Input id="bk-notice" name="minNoticeHours" type="number" min={0} max={720} defaultValue={page.minNoticeHours} /></Field>
          <Field label="Book up to (days ahead)" htmlFor="bk-ahead"><Input id="bk-ahead" name="maxDaysAhead" type="number" min={1} max={365} defaultValue={page.maxDaysAhead} /></Field>
        </div>
        <Field label="Time zone" htmlFor="bk-tz" hint="For example America/New_York or America/Chicago.">
          <Input id="bk-tz" name="timezone" defaultValue={page.timezone} required />
        </Field>

        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium">Weekly hours</p>
          {WEEKDAYS.map((day, d) => {
            const w = page.weeklyHours[String(d)]?.[0];
            return (
              <div key={d} className="flex items-center gap-2 text-sm">
                <label className="flex w-32 items-center gap-2">
                  <input type="checkbox" name={`day${d}`} defaultChecked={!!w} className="size-4" />
                  {day}
                </label>
                <Input type="time" name={`start${d}`} defaultValue={w?.start ?? "09:00"} className="h-8 w-28" aria-label={`${day} start`} />
                <span className="text-muted-foreground">to</span>
                <Input type="time" name={`end${d}`} defaultValue={w?.end ?? "17:00"} className="h-8 w-28" aria-label={`${day} end`} />
              </div>
            );
          })}
        </div>

        <p className="pt-2 text-sm font-medium">After someone books</p>
        <Field label="Confirmation DM" htmlFor="bk-confirm" hint="Sent in their Instagram or Messenger chat when they booked from a DM link. Variables: {{first_name}}, {{booking_time}}. Leave empty to skip.">
          <Textarea id="bk-confirm" name="confirmationMessage" rows={2} defaultValue={page.confirmationMessage ?? ""} maxLength={1000} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Add tag" htmlFor="bk-tag"><Input id="bk-tag" name="tagOnBooking" defaultValue={page.tagOnBooking ?? ""} maxLength={40} /></Field>
          <Field label="Move to stage" htmlFor="bk-stage">
            <Select id="bk-stage" name="stageOnBooking" defaultValue={page.stageOnBooking ?? ""}>
              <option value="">Don&apos;t change</option>
              {STAGES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </Select>
          </Field>
        </div>

        <SubmitButton variant="gradient" className="self-start">Save booking settings</SubmitButton>
      </fieldset>
    </form>
  );
}
