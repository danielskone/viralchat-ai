"use client";
import { useActionState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { checkYoutubeNow } from "@/lib/actions/youtube";

export function CheckYoutubeButton() {
  const [state, action, pending] = useActionState(checkYoutubeNow, null);
  return (
    <>
      <form action={action}>
        <Button variant="outline" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : <RefreshCw />} {pending ? "Checking…" : "Check for new comments now"}
        </Button>
      </form>
      {state && (
        <p role="status" className={`w-full text-sm ${state.tone === "success" ? "text-success" : state.tone === "danger" ? "text-destructive" : "text-muted-foreground"}`}>
          {state.message}
        </p>
      )}
    </>
  );
}
