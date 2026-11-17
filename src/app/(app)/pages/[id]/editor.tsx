"use client";
import { useActionState, useState } from "react";
import type { LandingPage } from "@/db/schema";
import { Alert, Field, Input, Select, Textarea } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { deleteLandingPage, saveLandingPage, type LandingFormState } from "@/lib/actions/landing";
import { STAGES } from "@/lib/utils";

export function LandingEditor({ page, bookingOn, disabled }: { page: LandingPage; bookingOn: boolean; disabled: boolean }) {
  const [state, action] = useActionState<LandingFormState, FormData>(saveLandingPage, undefined);
  const [phone, setPhone] = useState(page.fields.phone);
  const [after, setAfter] = useState(page.afterSubmit);
  return (
    <div className="flex flex-col gap-4">
      <form action={action} className="flex flex-col gap-4">
        <fieldset disabled={disabled} className="contents">
          <input type="hidden" name="id" value={page.id} />
          {state?.error && <Alert tone="danger">{state.error}</Alert>}
          {state?.ok && <Alert tone="success">{state.ok}</Alert>}

          <label className="flex items-center gap-3 rounded-xl border p-3">
            <input type="checkbox" name="published" defaultChecked={page.published} className="size-4" />
            <span>
              <span className="font-medium">Published</span>
              <span className="block text-sm text-muted-foreground">When off, the link shows &ldquo;not available&rdquo;.</span>
            </span>
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Page name (only you see this)" htmlFor="lp-title"><Input id="lp-title" name="title" defaultValue={page.title} maxLength={120} /></Field>
            <Field label="Link name" htmlFor="lp-slug" hint={`Link ends in /p/${page.slug}`}><Input id="lp-slug" name="slug" defaultValue={page.slug} maxLength={60} required /></Field>
          </div>
          <Field label="Headline" htmlFor="lp-headline"><Input id="lp-headline" name="headline" defaultValue={page.headline} maxLength={200} required /></Field>
          <Field label="Subheadline" htmlFor="lp-sub"><Input id="lp-sub" name="subheadline" defaultValue={page.subheadline ?? ""} maxLength={300} /></Field>
          <Field label="More details" htmlFor="lp-body" hint="Optional. Each new line shows as its own line.">
            <Textarea id="lp-body" name="body" rows={4} defaultValue={page.body ?? ""} maxLength={4000} />
          </Field>
          <Field label="Image link" htmlFor="lp-img" hint="Optional. A picture link starting with https://">
            <Input id="lp-img" name="imageUrl" type="url" defaultValue={page.imageUrl ?? ""} maxLength={1000} placeholder="https://" />
          </Field>

          <div className="flex flex-col gap-2 rounded-xl border p-3 text-sm">
            <p className="font-medium">Form fields</p>
            <p className="text-muted-foreground">Name and email are always asked.</p>
            <label className="flex items-center gap-2"><input type="checkbox" name="fieldPhone" checked={phone} onChange={(e) => setPhone(e.target.checked)} className="size-4" /> Phone number</label>
            {phone && <label className="ml-6 flex items-center gap-2"><input type="checkbox" name="phoneRequired" defaultChecked={page.fields.phoneRequired} className="size-4" /> Phone is required</label>}
            <label className="flex items-center gap-2"><input type="checkbox" name="fieldMessage" defaultChecked={page.fields.message} className="size-4" /> Message box</label>
          </div>
          <Field label="Button text" htmlFor="lp-btn"><Input id="lp-btn" name="buttonText" defaultValue={page.buttonText} maxLength={40} /></Field>

          <p className="pt-2 text-sm font-medium">After someone signs up</p>
          <Field label="Then" htmlFor="lp-after">
            <Select id="lp-after" name="afterSubmit" value={after} onChange={(e) => setAfter(e.target.value)}>
              <option value="message">Show a thank-you message</option>
              <option value="booking">Show a thank-you message and a &ldquo;Book a time&rdquo; button</option>
            </Select>
          </Field>
          {after === "booking" && !bookingOn && <Alert tone="warning">Booking is turned off, so the button won&apos;t show. Turn it on in the Booking page.</Alert>}
          <Field label="Thank-you message" htmlFor="lp-thanks" hint="Variables: {{first_name}}, {{name}}">
            <Textarea id="lp-thanks" name="successMessage" rows={2} defaultValue={page.successMessage ?? ""} maxLength={1000} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Add tag" htmlFor="lp-tag"><Input id="lp-tag" name="tagOnSubmit" defaultValue={page.tagOnSubmit ?? ""} maxLength={40} /></Field>
            <Field label="Move to stage" htmlFor="lp-stage">
              <Select id="lp-stage" name="stageOnSubmit" defaultValue={page.stageOnSubmit ?? ""}>
                <option value="">Don&apos;t change</option>
                {STAGES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </Select>
            </Field>
          </div>
          <SubmitButton variant="gradient" className="self-start">Save page</SubmitButton>
        </fieldset>
      </form>
      {!disabled && (
        <form action={deleteLandingPage} onSubmit={(e) => { if (!confirm("Delete this page? Its leads stay in Contacts.")) e.preventDefault(); }}>
          <input type="hidden" name="id" value={page.id} />
          <Button variant="ghost" size="sm" className="text-destructive">Delete page</Button>
        </form>
      )}
    </div>
  );
}
