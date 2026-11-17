"use client";
import { useActionState } from "react";
import { Alert, Field, Input } from "@/components/ui/primitives";
import { SubmitButton } from "@/components/ui/submit-button";
import { saveEmailSettings, sendTestEmail, type EmailFormState } from "@/lib/actions/email";

export function EmailSettingsForm({ connected, fromEmail, fromName, address }: { connected: boolean; fromEmail: string; fromName: string; address: string }) {
  const [state, action] = useActionState<EmailFormState, FormData>(saveEmailSettings, undefined);
  return (
    <form action={action} className="flex flex-col gap-3">
      {state?.error && <Alert tone="danger">{state.error}</Alert>}
      {state?.ok && <Alert tone="success">{state.ok}</Alert>}
      <Field label="Resend API key" htmlFor="em-key" hint={connected ? "Saved (encrypted). Leave empty to keep it." : "Starts with re_"}>
        <Input id="em-key" name="apiKey" type="password" autoComplete="off" placeholder={connected ? "••••••••" : "re_…"} required={!connected} />
      </Field>
      <Field label="Send from (email)" htmlFor="em-from" hint="Must be on a domain you verified in Resend.">
        <Input id="em-from" name="fromEmail" type="email" defaultValue={fromEmail} placeholder="hello@yourbusiness.com" required />
      </Field>
      <Field label="Send from (name)" htmlFor="em-name"><Input id="em-name" name="fromName" defaultValue={fromName} maxLength={80} /></Field>
      <Field label="Business mailing address" htmlFor="em-addr" hint="Shown at the bottom of every email. US law (CAN-SPAM) requires it for marketing emails.">
        <Input id="em-addr" name="address" defaultValue={address} maxLength={200} />
      </Field>
      <SubmitButton variant={connected ? "outline" : "gradient"} className="self-start" pendingText="Checking key…">{connected ? "Save changes" : "Connect"}</SubmitButton>
    </form>
  );
}

export function TestEmailButton() {
  const [state, action] = useActionState<EmailFormState, FormData>(sendTestEmail, undefined);
  return (
    <form action={action} className="flex flex-1 flex-col gap-2">
      <SubmitButton variant="outline" size="sm" className="self-start" pendingText="Sending…">Send me a test email</SubmitButton>
      {state?.error && <Alert tone="danger">{state.error}</Alert>}
      {state?.ok && <Alert tone="success">{state.ok}</Alert>}
    </form>
  );
}
