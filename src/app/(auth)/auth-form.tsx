"use client";
import { useActionState } from "react";
import Link from "next/link";
import { Input, Field, Alert } from "@/components/ui/primitives";
import { SubmitButton } from "@/components/ui/submit-button";
import { login, signup, type AuthState } from "./actions";

export function AuthForm({ mode, next, invite }: { mode: "login" | "signup"; next?: string; invite?: string }) {
  const [state, action] = useActionState<AuthState, FormData>(mode === "login" ? login : signup, undefined);
  return (
    <form action={action} className="flex flex-col gap-4">
      {state?.error && <Alert tone="danger">{state.error}</Alert>}
      {mode === "signup" && (
        <Field label="Your name" htmlFor="name">
          <Input id="name" name="name" autoComplete="name" required />
        </Field>
      )}
      <Field label="Email" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </Field>
      <Field label="Password" htmlFor="password" hint={mode === "signup" ? "At least 8 characters." : undefined}>
        <Input id="password" name="password" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} required minLength={mode === "signup" ? 8 : undefined} />
      </Field>
      {next && <input type="hidden" name="next" value={next} />}
      {invite && <input type="hidden" name="invite" value={invite} />}
      <SubmitButton variant="gradient" size="lg" pendingText={mode === "login" ? "Signing in…" : "Creating account…"}>
        {mode === "login" ? "Sign in" : "Create free account"}
      </SubmitButton>
      <p className="text-center text-sm text-muted-foreground">
        {mode === "login" ? (
          <>New to ViralChat AI? <Link className="text-primary hover:underline" href="/signup">Create an account</Link></>
        ) : (
          <>Already have an account? <Link className="text-primary hover:underline" href="/login">Sign in</Link></>
        )}
      </p>
    </form>
  );
}
