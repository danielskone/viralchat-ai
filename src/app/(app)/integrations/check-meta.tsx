"use client";
import { useActionState } from "react";
import { CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { checkMetaConnection } from "@/lib/actions/integrations";

export function CheckMetaButton() {
  const [state, action, pending] = useActionState(checkMetaConnection, undefined);
  return (
    <>
      <form action={action}>
        <Button variant="outline" disabled={pending}>
          {pending && <Loader2 className="animate-spin" />} {pending ? "Checking…" : "Check connection"}
        </Button>
      </form>
      {state && (
        <p role="status" className={`flex w-full items-start gap-1.5 text-sm ${state.ok ? "text-success" : "text-destructive"}`}>
          {state.ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0" /> : <AlertTriangle className="mt-0.5 size-4 shrink-0" />}
          {state.ok ?? state.error}
        </p>
      )}
    </>
  );
}
