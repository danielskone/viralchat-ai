"use client";
import { useActionState } from "react";
import { CalendarDays, CheckCircle2 } from "lucide-react";
import { submitLeadForm, type LeadFormState } from "@/lib/actions/landing";
import { Alert, Field, Input, Textarea } from "@/components/ui/primitives";
import { buttonVariants } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";

export function LeadForm({ slug, phone, phoneRequired, message, buttonText }: { slug: string; phone: boolean; phoneRequired: boolean; message: boolean; buttonText: string }) {
  const [state, action] = useActionState<LeadFormState, FormData>(submitLeadForm, undefined);
  if (state?.done) {
    return (
      <div className="flex flex-col items-center gap-3 py-4 text-center">
        <CheckCircle2 className="size-12 text-success" />
        <p className="whitespace-pre-line text-lg">{state.done.message}</p>
        {state.done.next && (
          <a href={state.done.next} className={buttonVariants({ variant: "gradient", size: "lg" })}>
            <CalendarDays className="size-4" /> Book a time
          </a>
        )}
      </div>
    );
  }
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="slug" value={slug} />
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>Website <input name="website" tabIndex={-1} autoComplete="off" /></label>
      </div>
      {state?.error && <Alert tone="danger">{state.error}</Alert>}
      <Field label="Your name" htmlFor="l-name"><Input id="l-name" name="name" required maxLength={120} autoComplete="name" /></Field>
      <Field label="Email" htmlFor="l-email"><Input id="l-email" name="email" type="email" required maxLength={200} autoComplete="email" /></Field>
      {phone && (
        <Field label={phoneRequired ? "Phone" : "Phone (optional)"} htmlFor="l-phone">
          <Input id="l-phone" name="phone" type="tel" required={phoneRequired} maxLength={40} autoComplete="tel" />
        </Field>
      )}
      {message && <Field label="Message" htmlFor="l-msg"><Textarea id="l-msg" name="message" rows={3} maxLength={2000} /></Field>}
      <SubmitButton variant="gradient" size="lg" pendingText="Sending…">{buttonText}</SubmitButton>
    </form>
  );
}
