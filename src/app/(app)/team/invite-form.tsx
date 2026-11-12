"use client";
import { useActionState } from "react";
import { Alert, Input, Select } from "@/components/ui/primitives";
import { SubmitButton } from "@/components/ui/submit-button";
import { inviteMember, type InviteState } from "@/lib/actions/team";

export function InviteForm() {
  const [state, action] = useActionState<InviteState, FormData>(inviteMember, undefined);
  return (
    <form action={action} className="flex flex-col gap-3">
      {state?.error && <Alert tone="danger">{state.error}</Alert>}
      {state?.link && (
        <Alert tone="success" title="Invite created. Share this link:">
          <code className="block break-all text-xs">{state.link.startsWith("/") ? (typeof window !== "undefined" ? window.location.origin : "") + state.link : state.link}</code>
        </Alert>
      )}
      <Input name="email" type="email" placeholder="teammate@company.com" required aria-label="Email" />
      <Select name="role" defaultValue="staff" aria-label="Role">
        <option value="staff">Staff</option>
        <option value="admin">Admin</option>
      </Select>
      <SubmitButton variant="gradient">Create invite link</SubmitButton>
    </form>
  );
}
