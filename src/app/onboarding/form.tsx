"use client";
import { useActionState, useState, useSyncExternalStore } from "react";
import { Input, Field, Alert, Select } from "@/components/ui/primitives";
import { SubmitButton } from "@/components/ui/submit-button";
import { createWorkspace, type FormState } from "@/lib/actions/workspace";
import { cn } from "@/lib/utils";

const TYPES = ["Content creator", "E-commerce", "Agency", "Local business", "Coaching / consulting", "Real estate", "Restaurant", "Church / ministry", "Nonprofit", "SaaS / tech", "Other"];

export function OnboardingForm() {
  const [state, action] = useActionState<FormState, FormData>(createWorkspace, undefined);
  const [type, setType] = useState("");
  const tz = useSyncExternalStore(
    () => () => {},
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    () => "UTC",
  );
  return (
    <form action={action} className="flex flex-col gap-5">
      {state?.error && <Alert tone="danger">{state.error}</Alert>}
      <Field label="Business name" htmlFor="name">
        <Input id="name" name="name" required placeholder="e.g. Glow Studio" />
      </Field>
      <Field label="Website (optional)" htmlFor="website">
        <Input id="website" name="website" placeholder="https://" />
      </Field>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1.5 text-sm font-medium">What kind of business is it?</legend>
        <div className="flex flex-wrap gap-2">
          {TYPES.map((t) => (
            <button
              type="button"
              key={t}
              aria-pressed={type === t}
              onClick={() => setType(t)}
              className={cn("rounded-full border px-3 py-1.5 text-sm transition-colors", type === t ? "border-primary bg-accent text-accent-foreground" : "hover:bg-muted")}
            >
              {t}
            </button>
          ))}
        </div>
        <input type="hidden" name="businessType" value={type} />
      </fieldset>
      <Field label="Time zone" htmlFor="timezone">
        <Select key={tz} id="timezone" name="timezone" defaultValue={tz}>
          {Array.from(new Set([tz, ...Intl.supportedValuesOf("timeZone")])).map((z) => (
            <option key={z} value={z}>{z}</option>
          ))}
        </Select>
      </Field>
      <SubmitButton variant="gradient" size="lg" pendingText="Creating workspace…">Create workspace</SubmitButton>
    </form>
  );
}
