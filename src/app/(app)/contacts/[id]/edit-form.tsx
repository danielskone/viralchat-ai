"use client";
import { useActionState, useState } from "react";
import { Plus, X } from "lucide-react";
import type { Contact } from "@/db/schema";
import { Alert, Field, Input, Select } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { updateContact, type FormState } from "@/lib/actions/contacts";
import { STAGES } from "@/lib/utils";

export function ContactEditForm({ contact, team }: { contact: Contact; team: { id: string; name: string }[] }) {
  const [state, action] = useActionState<FormState, FormData>(updateContact, undefined);
  const [fields, setFields] = useState(() => {
    const entries = Object.entries(contact.customFields ?? {});
    return entries.length ? entries.map(([k, v], i) => ({ i, k, v })) : [];
  });
  return (
    <form action={action} className="flex flex-col gap-4">
      {state?.error && <Alert tone="danger">{state.error}</Alert>}
      {state?.ok && <Alert tone="success">{state.ok}</Alert>}
      <input type="hidden" name="id" value={contact.id} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" htmlFor="name"><Input id="name" name="name" defaultValue={contact.name} required /></Field>
        <Field label="Email" htmlFor="email"><Input id="email" name="email" type="email" defaultValue={contact.email ?? ""} /></Field>
        <Field label="Phone" htmlFor="phone"><Input id="phone" name="phone" defaultValue={contact.phone ?? ""} /></Field>
        <Field label="Tags" htmlFor="tags" hint="Comma separated"><Input id="tags" name="tags" defaultValue={contact.tags.join(", ")} /></Field>
        <Field label="Pipeline stage" htmlFor="stage">
          <Select id="stage" name="stage" defaultValue={contact.stage}>
            {STAGES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </Select>
        </Field>
        <Field label="Lead score (0–100)" htmlFor="leadScore" hint="70+ is Hot, 35+ is Warm">
          <Input id="leadScore" name="leadScore" type="number" min={0} max={100} defaultValue={contact.leadScore} />
        </Field>
        <Field label="Owner" htmlFor="ownerId">
          <Select id="ownerId" name="ownerId" defaultValue={contact.ownerId ?? ""}>
            <option value="">Unassigned</option>
            {team.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </Select>
        </Field>
        <div className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium">Channels</span>
          <span className="text-muted-foreground">
            {contact.instagramId ? `Instagram${contact.instagramUsername ? ` @${contact.instagramUsername}` : ""}` : "No Instagram"} ·{" "}
            {contact.messengerId ? "Messenger" : "No Messenger"}
          </span>
        </div>
      </div>
      <div>
        <p className="mb-2 text-sm font-medium">Custom fields</p>
        <div className="flex flex-col gap-2">
          {fields.map((f) => (
            <div key={f.i} className="flex gap-2">
              <Input name={`cf_key_${f.i}`} defaultValue={f.k} placeholder="Field" className="w-40" aria-label="Field name" />
              <Input name={`cf_val_${f.i}`} defaultValue={f.v} placeholder="Value" aria-label="Field value" />
              <Button type="button" variant="ghost" size="icon" aria-label="Remove field" onClick={() => setFields(fields.filter((x) => x.i !== f.i))}><X /></Button>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" className="self-start" onClick={() => setFields([...fields, { i: Date.now(), k: "", v: "" }])}>
            <Plus /> Add field
          </Button>
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="optedOut" defaultChecked={contact.optedOut} /> Contact has opted out of messages (automations and AI will not message them)
      </label>
      <SubmitButton variant="gradient" className="self-start">Save changes</SubmitButton>
    </form>
  );
}
