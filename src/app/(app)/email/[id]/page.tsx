import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import { db } from "@/db";
import { contacts, emailEnrollments, emailSequences, landingPages } from "@/db/schema";
import { hasRole, requireWorkspace } from "@/lib/auth";
import { getEmailSettings } from "@/lib/email-server";
import { Alert, Badge, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/primitives";
import { SequenceEditor } from "./editor";

export const metadata = { title: "Email follow-up" };

const STATUS: Record<string, { label: string; tone: "success" | "default" | "danger" | "primary" }> = {
  active: { label: "In progress", tone: "primary" },
  completed: { label: "Finished", tone: "success" },
  stopped: { label: "Stopped", tone: "default" },
  failed: { label: "Failed", tone: "danger" },
};

export default async function SequencePage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireWorkspace();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [seq] = await db.select().from(emailSequences).where(and(eq(emailSequences.id, id), eq(emailSequences.workspaceId, ctx.workspace.id))).limit(1);
  if (!seq) notFound();
  const pages = await db.select({ id: landingPages.id, title: landingPages.title }).from(landingPages).where(eq(landingPages.workspaceId, ctx.workspace.id));
  const people = await db
    .select({ e: emailEnrollments, name: contacts.name, email: contacts.email })
    .from(emailEnrollments)
    .innerJoin(contacts, eq(contacts.id, emailEnrollments.contactId))
    .where(eq(emailEnrollments.sequenceId, seq.id))
    .orderBy(desc(emailEnrollments.createdAt))
    .limit(100);
  const connected = !!(await getEmailSettings(ctx.workspace.id));

  return (
    <>
      <Link href="/email" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> Email follow-ups</Link>
      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">Edit follow-up {seq.active ? <Badge tone="success">On</Badge> : <Badge>Off</Badge>}</CardTitle>
            <CardDescription>The first email goes out right away (or after its wait). Later emails go out in the daily send, around midnight US Eastern time.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {!connected && <Alert tone="warning">Your email service isn&apos;t connected, so this can&apos;t be turned on yet. <Link className="underline" href="/email">Connect it here</Link>.</Alert>}
            <SequenceEditor seq={seq} pages={pages} disabled={!hasRole(ctx.role, "admin")} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>People in this follow-up ({people.length})</CardTitle>
            <CardDescription>Anyone who unsubscribes is stopped automatically.</CardDescription>
          </CardHeader>
          <CardContent>
            {people.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nobody yet. People join when the trigger happens while this is on.</p>
            ) : (
              <ul className="divide-y text-sm">
                {people.map(({ e, name, email }) => {
                  const st = STATUS[e.status] ?? STATUS.stopped!;
                  return (
                    <li key={e.id} className="py-2">
                      <div className="flex items-center gap-2">
                        <Link href={`/contacts/${e.contactId}`} className="min-w-0 flex-1 truncate font-medium hover:underline">{name}</Link>
                        <Badge tone={st.tone}>{st.label}</Badge>
                      </div>
                      <p className="truncate text-xs text-muted-foreground">{email} · {Math.min(e.nextStep, seq.steps.length)} of {seq.steps.length} sent{e.lastError ? ` · ${e.lastError}` : ""}</p>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
