"use client";
import { useActionState } from "react";
import type { Broadcast } from "@/db/schema";
import { Alert, Field, Input, Select, Textarea } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { deleteBroadcast, saveBroadcast, sendBroadcast, type BroadcastFormState } from "@/lib/actions/broadcasts";
import { STAGES } from "@/lib/utils";

export function BroadcastEditor({ b, disabled }: { b: Broadcast; disabled: boolean }) {
  const [state, action] = useActionState<BroadcastFormState, FormData>(saveBroadcast, undefined);
  return (
    <div className="flex flex-col gap-4">
      <form action={action} className="flex flex-col gap-4">
        <fieldset disabled={disabled} className="contents">
          <input type="hidden" name="id" value={b.id} />
          {state?.error && <Alert tone="danger">{state.error}</Alert>}
          {state?.ok && <Alert tone="success">{state.ok}</Alert>}
          <Field label="Name (only you see this)" htmlFor="bc-name"><Input id="bc-name" name="name" defaultValue={b.name} maxLength={120} /></Field>
          <Field label="Message" htmlFor="bc-msg" hint="Variables: {{first_name}}, {{name}}, {{booking_link}}">
            <Textarea id="bc-msg" name="message" rows={5} defaultValue={b.message} maxLength={1000} required />
          </Field>
          <p className="pt-2 text-sm font-medium">Send to</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Channel" htmlFor="bc-ch">
              <Select id="bc-ch" name="channel" defaultValue={b.audience.channel}>
                <option value="all">Instagram and Messenger</option>
                <option value="instagram">Instagram only</option>
                <option value="messenger">Messenger only</option>
              </Select>
            </Field>
            <Field label="Only people tagged" htmlFor="bc-tag"><Input id="bc-tag" name="tag" defaultValue={b.audience.tag ?? ""} placeholder="Any tag" maxLength={40} /></Field>
            <Field label="Only in stage" htmlFor="bc-stage">
              <Select id="bc-stage" name="stage" defaultValue={b.audience.stage ?? ""}>
                <option value="">Any stage</option>
                {STAGES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </Select>
            </Field>
          </div>
          <SubmitButton variant="outline" className="self-start">Save</SubmitButton>
        </fieldset>
      </form>
      {!disabled && (
        <form action={deleteBroadcast} onSubmit={(e) => { if (!confirm("Delete this draft?")) e.preventDefault(); }}>
          <input type="hidden" name="id" value={b.id} />
          <Button variant="ghost" size="sm" className="text-destructive">Delete draft</Button>
        </form>
      )}
    </div>
  );
}

export function SendBroadcastForm({ id, count, disabled }: { id: string; count: number; disabled: boolean }) {
  const [state, action] = useActionState<BroadcastFormState, FormData>(sendBroadcast, undefined);
  return (
    <form
      action={action}
      onSubmit={(e) => { if (!confirm(`Send this message to ${count} ${count === 1 ? "person" : "people"} now? This can't be undone.`)) e.preventDefault(); }}
      className="flex flex-col gap-3"
    >
      <input type="hidden" name="id" value={id} />
      {state?.error && <Alert tone="danger">{state.error}</Alert>}
      {state?.ok && <Alert tone="success">{state.ok}</Alert>}
      <SubmitButton variant="gradient" size="lg" disabled={disabled} pendingText="Sending…">Send now to {count} {count === 1 ? "person" : "people"}</SubmitButton>
      <p className="text-xs text-muted-foreground">Save your latest changes first. Sending uses the saved message.</p>
    </form>
  );
}
