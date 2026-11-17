import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { Megaphone, Plus } from "lucide-react";
import { db } from "@/db";
import { broadcasts } from "@/db/schema";
import { hasRole, requireWorkspace } from "@/lib/auth";
import { createBroadcast } from "@/lib/actions/broadcasts";
import { Alert, Badge, Card, CardContent, EmptyState, PageHeader } from "@/components/ui/primitives";
import { SubmitButton } from "@/components/ui/submit-button";

export const metadata = { title: "Broadcasts" };

export default async function BroadcastsPage() {
  const ctx = await requireWorkspace();
  const rows = await db.select().from(broadcasts).where(eq(broadcasts.workspaceId, ctx.workspace.id)).orderBy(desc(broadcasts.createdAt)).limit(100);
  const fmt = new Intl.DateTimeFormat("en-US", { timeZone: ctx.workspace.timezone || "UTC", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  const newButton = hasRole(ctx.role, "admin") ? (
    <form action={createBroadcast}>
      <SubmitButton variant="gradient" pendingText="Creating…"><Plus className="size-4" /> New broadcast</SubmitButton>
    </form>
  ) : null;
  return (
    <>
      <PageHeader title="Broadcasts" description="Send one message to many people at once on Instagram and Messenger." actions={newButton} />
      <div className="mb-6">
        <Alert tone="info" title="Meta's 24-hour rule">
          Meta only lets businesses send bulk messages to people who messaged you in the last 24 hours. ViralChat checks this for you and only sends to people who qualify.
        </Alert>
      </div>
      {rows.length === 0 ? (
        <Card><CardContent className="pt-6"><EmptyState icon={<Megaphone className="size-5" />} title="No broadcasts yet" description="Announce a sale, share a booking link, or follow up with today's leads." action={newButton ?? undefined} /></CardContent></Card>
      ) : (
        <Card>
          <CardContent className="pt-2">
            <ul className="divide-y">
              {rows.map((b) => (
                <li key={b.id}>
                  <Link href={`/broadcasts/${b.id}`} className="flex flex-wrap items-center gap-3 py-3 hover:opacity-80">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{b.name}</p>
                      <p className="truncate text-sm text-muted-foreground">{b.message}</p>
                    </div>
                    {b.status === "sent" ? (
                      <span className="text-sm text-muted-foreground">Sent {b.sentAt ? fmt.format(b.sentAt) : ""} · {b.sentCount} delivered{b.failedCount ? ` · ${b.failedCount} failed` : ""}</span>
                    ) : b.status === "sending" ? (
                      <Badge tone="warning">Sending</Badge>
                    ) : (
                      <Badge>Draft</Badge>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </>
  );
}
