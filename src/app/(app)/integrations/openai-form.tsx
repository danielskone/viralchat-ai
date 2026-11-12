"use client";
import { useActionState } from "react";
import { Alert, Input } from "@/components/ui/primitives";
import { SubmitButton } from "@/components/ui/submit-button";
import { saveOpenAIKey, type KeyState } from "@/lib/actions/integrations";

export function OpenAIKeyForm() {
  const [state, action] = useActionState<KeyState, FormData>(saveOpenAIKey, undefined);
  return (
    <form action={action} className="flex flex-col gap-2">
      {state?.error && <Alert tone="danger">{state.error}</Alert>}
      {state?.ok && <Alert tone="success">{state.ok}</Alert>}
      <div className="flex gap-2">
        <Input name="apiKey" type="password" placeholder="sk-…" autoComplete="off" aria-label="OpenAI API key" required />
        <SubmitButton variant="outline" pendingText="Verifying…">Save key</SubmitButton>
      </div>
    </form>
  );
}
