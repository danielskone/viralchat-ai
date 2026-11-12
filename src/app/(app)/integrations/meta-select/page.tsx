import Link from "next/link";
import { redirect } from "next/navigation";
import { requireWorkspace } from "@/lib/auth";
import { readPendingPages } from "@/lib/meta-pending";
import { selectMetaPage } from "@/lib/actions/integrations";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, Badge, Alert } from "@/components/ui/primitives";
import { SubmitButton } from "@/components/ui/submit-button";
import { META_SCOPES } from "@/lib/meta";

export default async function MetaSelectPage() {
  const ctx = await requireWorkspace("admin");
  const pending = await readPendingPages();
  if (!pending || pending.ws !== ctx.workspace.id) redirect("/integrations?error=Authorization%20expired.%20Please%20connect%20again.");
  const missing = META_SCOPES.filter((s) => !pending.scopes.includes(s));
  return (
    <div className="mx-auto max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle>Choose the Facebook Page to connect</CardTitle>
          <CardDescription>Messenger conversations come from the Page. Instagram DMs and comments come from the Instagram professional account linked to it.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {missing.length > 0 && (
            <Alert tone="warning" title="Some permissions were not granted">
              Missing: {missing.join(", ")}. Features that need them won’t work until you reconnect and allow them.
            </Alert>
          )}
          {pending.pages.map((p) => (
            <form key={p.id} action={selectMetaPage} className="flex items-center gap-3 rounded-xl border p-4">
              <input type="hidden" name="pageId" value={p.id} />
              <div className="flex-1">
                <p className="font-medium">{p.name}</p>
                <p className="text-sm text-muted-foreground">
                  {p.igUsername ? <>Instagram: <Badge tone="primary">@{p.igUsername}</Badge></> : "No Instagram professional account linked (Messenger only)"}
                </p>
              </div>
              <SubmitButton variant="gradient" pendingText="Connecting…">Connect</SubmitButton>
            </form>
          ))}
          <Link href="/integrations" className="text-sm text-muted-foreground hover:underline">Cancel</Link>
        </CardContent>
      </Card>
    </div>
  );
}
