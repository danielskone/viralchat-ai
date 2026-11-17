import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import { db } from "@/db";
import { broadcastRecipients, broadcasts, contacts } from "@/db/schema";
import { hasRole, requireWorkspace } from "@/lib/auth";
import { audienceFor } from "@/lib/broadcast-server";
import { BROADCAST_MAX } from "@/lib/broadcast";
import { getMetaIntegration } from "@/lib/messaging";
import { Alert, Badge, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/primitives";
import { BroadcastEditor, SendBroadcastForm } from "./editor";

export const metadata = { title: "Broadcast" };
// Sending runs inside this page's server action; give it time for larger audiences.
export const maxDuration = 300;

export default async function BroadcastDetail({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireWorkspace();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [b] = await db.select().from(broadcasts).where(and(eq(broadcasts.id, id), eq(broadcasts.workspaceId, ctx.workspace.id))).limit(1);
  if (!b) notFound();
  const canEdit = hasRole(ctx.role, "admin");

  if (b.status !== "draft") {
    const results = await db
      .select({ r: broadcastRecipients, name: contacts.name })
      .from(broadcastRecipients)
      .leftJoin(contacts, eq(contacts.id, broadcastRecipients.contactId))
      .where(eq(broadcastRecipients.broadcastId, b.id))
      .orderBy(desc(broadcastRecipients.createdAt))
      .limit(500);
    return (
      <>
        <Link href="/broadcasts" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> All broadcasts</Link>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">{b.name} {b.status === "sent" ? <Badge tone="success">Sent</Badge> : <Badge tone="warning">Sending</Badge>}</CardTitle>
            <CardDescription>{b.sentCount} delivered{b.failedCount ? ` · ${b.failedCount} failed` : ""}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <p className="whitespace-pre-line rounded-xl border bg-muted/40 p-3 text-sm">{b.message}</p>
            {results.length > 0 && (
              <ul className="divide-y text-sm">
                {results.map(({ r, name }) => (
                  <li key={r.id} className="flex flex-wrap items-center gap-2 py-2">
                    {r.contactId ? <Link href={`/contacts/${r.contactId}`} className="font-medium hover:underline">{name ?? "Contact"}</Link> : <span>Deleted contact</span>}
                    {r.status === "sent" ? <Badge tone="success">Delivered</Badge> : <Badge tone="danger">Failed</Badge>}
                    {r.error && <span className="text-muted-foreground">{r.error}</span>}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </>
    );
  }

  const [{ eligible, outsideWindow }, meta] = await Promise.all([audienceFor(ctx.workspace.id, b.audience), getMetaIntegration(ctx.workspace.id)]);
  const count = Math.min(eligible.length, BROADCAST_MAX);

  return (
    <>
      <Link href="/broadcasts" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> All broadcasts</Link>
      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Write your broadcast</CardTitle>
            <CardDescription>Save to update who will get it.</CardDescription>
          </CardHeader>
          <CardContent><BroadcastEditor b={b} disabled={!canEdit} /></CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Who gets it</CardTitle>
            <CardDescription>Based on your last save.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="rounded-xl border p-4">
              <p className="text-3xl font-semibold">{count}</p>
              <p className="text-sm text-muted-foreground">{count === 1 ? "person" : "people"} can get this now (they messaged you in the last 24 hours)</p>
            </div>
            {outsideWindow > 0 && (
              <p className="text-sm text-muted-foreground">{outsideWindow} more {outsideWindow === 1 ? "person matches" : "people match"} but haven&apos;t messaged in the last 24 hours, so Meta doesn&apos;t allow sending to them. They&apos;ll qualify again as soon as they message you.</p>
            )}
            {eligible.length > BROADCAST_MAX && <Alert tone="warning">Only the first {BROADCAST_MAX} will be sent in one go.</Alert>}
            {!meta && <Alert tone="warning">Instagram and Messenger aren&apos;t connected, so nothing can be sent. Connect them on the <Link className="underline" href="/integrations">Integrations</Link> page.</Alert>}
            {canEdit && <SendBroadcastForm id={b.id} count={count} disabled={count === 0 || !meta} />}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
