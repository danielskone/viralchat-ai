"use client";
import { useActionState } from "react";
import type { Workspace } from "@/db/schema";
import { Alert, Field, Input } from "@/components/ui/primitives";
import { SubmitButton } from "@/components/ui/submit-button";
import { updateWorkspace, type FormState } from "@/lib/actions/workspace";

export function WorkspaceForm({ workspace, disabled }: { workspace: Workspace; disabled: boolean }) {
  const [state, action] = useActionState<FormState, FormData>(updateWorkspace, undefined);
  return (
    <form action={action} className="flex flex-col gap-4">
      <fieldset disabled={disabled} className="contents">
        {state?.error && <Alert tone="danger">{state.error}</Alert>}
        {state?.ok && <Alert tone="success">{state.ok}</Alert>}
        <Field label="Business name" htmlFor="ws-name"><Input id="ws-name" name="name" defaultValue={workspace.name} required /></Field>
        <Field label="Business type" htmlFor="ws-type"><Input id="ws-type" name="businessType" defaultValue={workspace.businessType ?? ""} /></Field>
        <Field label="Website" htmlFor="ws-web"><Input id="ws-web" name="website" defaultValue={workspace.website ?? ""} /></Field>
        <Field label="Time zone" htmlFor="ws-tz"><Input id="ws-tz" name="timezone" defaultValue={workspace.timezone} /></Field>
        <SubmitButton variant="gradient" className="self-start">Save</SubmitButton>
      </fieldset>
    </form>
  );
}
