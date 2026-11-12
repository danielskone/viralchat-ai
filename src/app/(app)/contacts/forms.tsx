"use client";
import { useActionState } from "react";
import { Plus, Upload } from "lucide-react";
import { Alert, Field, Input, Select } from "@/components/ui/primitives";
import { SubmitButton } from "@/components/ui/submit-button";
import { createContact, importContacts, type FormState } from "@/lib/actions/contacts";
import { STAGES } from "@/lib/utils";
import { Modal } from "@/components/ui/modal";

export function NewContactForm() {
  const [state, action] = useActionState<FormState, FormData>(createContact, undefined);
  return (
    <Modal trigger={<><Plus /> Add contact</>} title="Add contact" triggerVariant="gradient">
      <form action={action} className="flex flex-col gap-4">
        {state?.error && <Alert tone="danger">{state.error}</Alert>}
        <Field label="Name" htmlFor="c-name"><Input id="c-name" name="name" required /></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Email" htmlFor="c-email"><Input id="c-email" name="email" type="email" /></Field>
          <Field label="Phone" htmlFor="c-phone"><Input id="c-phone" name="phone" /></Field>
        </div>
        <Field label="Tags" htmlFor="c-tags" hint="Comma separated"><Input id="c-tags" name="tags" placeholder="vip, newsletter" /></Field>
        <Field label="Stage" htmlFor="c-stage">
          <Select id="c-stage" name="stage" defaultValue="new_lead">
            {STAGES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </Select>
        </Field>
        <SubmitButton variant="gradient">Create contact</SubmitButton>
      </form>
    </Modal>
  );
}

export function ImportForm() {
  const [state, action] = useActionState<FormState, FormData>(importContacts, undefined);
  return (
    <Modal trigger={<><Upload /> Import</>} title="Import contacts from CSV">
      <form action={action} className="flex flex-col gap-4">
        {state?.error && <Alert tone="danger">{state.error}</Alert>}
        {state?.ok && <Alert tone="success">{state.ok}</Alert>}
        <p className="text-sm text-muted-foreground">
          Columns recognised: <code>name</code> (or <code>first name</code>/<code>last name</code>), <code>email</code>, <code>phone</code>, <code>tags</code> (separated by ; ).
          Rows whose email already exists are skipped as duplicates.
        </p>
        <Input type="file" name="file" accept=".csv,text/csv" required />
        <p className="text-xs text-muted-foreground">Only import contacts who have agreed to hear from you.</p>
        <SubmitButton variant="gradient" pendingText="Importing…">Import</SubmitButton>
      </form>
    </Modal>
  );
}
