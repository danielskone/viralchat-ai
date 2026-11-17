"use client";
import { useActionState, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { EmailSequence, EmailStep } from "@/db/schema";
import { Alert, Field, Input, Select, Textarea } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { deleteSequence, saveSequence, type EmailFormState } from "@/lib/actions/email";
import { MAX_EMAIL_STEPS } from "@/lib/email";

export function SequenceEditor({ seq, pages, disabled }: { seq: EmailSequence; pages: { id: string; title: string }[]; disabled: boolean }) {
  const [state, action] = useActionState<EmailFormState, FormData>(saveSequence, undefined);
  const [trigger, setTrigger] = useState(seq.trigger);
  const [steps, setSteps] = useState<(EmailStep & { key: number })[]>(seq.steps.map((s, i) => ({ ...s, key: i })));
  const [nextKey, setNextKey] = useState(seq.steps.length);
  const update = (key: number, patch: Partial<EmailStep>) => setSteps((all) => all.map((s) => (s.key === key ? { ...s, ...patch } : s)));

  return (
    <div className="flex flex-col gap-4">
      <form action={action} className="flex flex-col gap-4">
        <fieldset disabled={disabled} className="contents">
          <input type="hidden" name="id" value={seq.id} />
          {state?.error && <Alert tone="danger">{state.error}</Alert>}
          {state?.ok && <Alert tone="success">{state.ok}</Alert>}
          <label className="flex items-center gap-3 rounded-xl border p-3">
            <input type="checkbox" name="active" defaultChecked={seq.active} className="size-4" />
            <span><span className="font-medium">On</span><span className="block text-sm text-muted-foreground">When on, new people start getting these emails.</span></span>
          </label>
          <Field label="Name (only you see this)" htmlFor="sq-name"><Input id="sq-name" name="name" defaultValue={seq.name} maxLength={120} /></Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Start when" htmlFor="sq-trigger">
              <Select id="sq-trigger" name="trigger" value={trigger} onChange={(e) => setTrigger(e.target.value)}>
                <option value="form_submitted">Someone fills in a form</option>
                <option value="booking_created">Someone books a time</option>
              </Select>
            </Field>
            {trigger === "form_submitted" && (
              <Field label="Which form" htmlFor="sq-page">
                <Select id="sq-page" name="pageId" defaultValue={seq.pageId ?? ""}>
                  <option value="">Any of my pages</option>
                  {pages.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
                </Select>
              </Field>
            )}
          </div>
          <p className="text-xs text-muted-foreground">Variables: {"{{first_name}}"}, {"{{name}}"}, {"{{booking_link}}"}. Every email gets your business name, address and an unsubscribe link at the bottom.</p>

          {steps.map((s, i) => (
            <div key={s.key} className="flex flex-col gap-3 rounded-xl border p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium">Email {i + 1}</p>
                <Button type="button" variant="ghost" size="icon" aria-label={`Remove email ${i + 1}`} onClick={() => setSteps((all) => all.filter((x) => x.key !== s.key))}><Trash2 className="size-4" /></Button>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span>Send</span>
                <Input name={`delay${i}`} type="number" min={0} max={365} value={s.delayDays} onChange={(e) => update(s.key, { delayDays: Number(e.target.value) })} className="h-8 w-20" aria-label="Days to wait" />
                <span>{i === 0 ? "days after they start (0 = right away)" : "days after the previous email"}</span>
              </div>
              <Field label="Subject" htmlFor={`sq-subj${i}`}><Input id={`sq-subj${i}`} name={`subject${i}`} value={s.subject} onChange={(e) => update(s.key, { subject: e.target.value })} maxLength={200} /></Field>
              <Field label="Message" htmlFor={`sq-body${i}`}><Textarea id={`sq-body${i}`} name={`body${i}`} rows={5} value={s.body} onChange={(e) => update(s.key, { body: e.target.value })} maxLength={5000} /></Field>
            </div>
          ))}
          {steps.length < MAX_EMAIL_STEPS && (
            <Button
              type="button"
              variant="outline"
              className="self-start"
              onClick={() => { setSteps((all) => [...all, { key: nextKey, delayDays: all.length ? 2 : 0, subject: "", body: "" }]); setNextKey((k) => k + 1); }}
            >
              <Plus className="size-4" /> Add email
            </Button>
          )}
          <SubmitButton variant="gradient" className="self-start">Save follow-up</SubmitButton>
        </fieldset>
      </form>
      {!disabled && (
        <form action={deleteSequence} onSubmit={(e) => { if (!confirm("Delete this follow-up?")) e.preventDefault(); }}>
          <input type="hidden" name="id" value={seq.id} />
          <Button variant="ghost" size="sm" className="text-destructive">Delete follow-up</Button>
        </form>
      )}
    </div>
  );
}
