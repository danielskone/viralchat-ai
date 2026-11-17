import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
import { Mail, Plus } from "lucide-react";
import { db } from "@/db";
import { contacts, emailMessages, emailSequences, integrations } from "@/db/schema";
import { hasRole, requireWorkspace } from "@/lib/auth";
import { createSequence, removeEmailSettings } from "@/lib/actions/email";
import { Alert, Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState, PageHeader } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { EmailSettingsForm, TestEmailButton } from "./settings-form";

export const metadata = { title: "Email Follow-ups" };

const TRIGGER_LABEL: Record<string, string> = { form_submitted: "After a form sign-up", booking_created: "After a booking" };

export default async function EmailPage() {
  const ctx = await requireWorkspace();
  const isAdmin = hasRole(ctx.role, "admin");
  const [conn] = await db.select().from(integrations).where(and(eq(integrations.workspaceId, ctx.workspace.id), eq(integrations.provider, "resend"))).limit(1);
  const connected = conn?.status === "connected" && !!conn.secretEnc;
  const seqs = await db.select().from(emailSequences).where(eq(emailSequences.workspaceId, ctx.workspace.id)).orderBy(desc(emailSequences.createdAt));
  const recent = await db
    .select({ m: emailMessages, name: contacts.name })
    .from(emailMessages)
    .leftJoin(contacts, eq(contacts.id, emailMessages.contactId))
    .where(eq(emailMessages.workspaceId, ctx.workspace.id))
    .orderBy(desc(emailMessages.createdAt))
    .limit(20);
  const fmt = new Intl.DateTimeFormat("en-US", { timeZone: ctx.workspace.timezone || "UTC", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  const newButton = isAdmin ? (
    <form action={createSequence}><SubmitButton variant="gradient" pendingText="Creating…"><Plus className="size-4" /> New follow-up</SubmitButton></form>
  ) : null;

  return (
    <>
      <PageHeader title="Email Follow-ups" description="Automatic emails to people who fill in your forms or book a time." actions={connected ? newButton : null} />
      <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">Email service {connected ? <Badge tone="success">Connected</Badge> : <Badge>Not connected</Badge>}</CardTitle>
            <CardDescription>
              Emails are sent through your own <a className="underline" href="https://resend.com" target="_blank" rel="noreferrer">Resend</a> account (free for up to 3,000 emails a month).
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {isAdmin ? (
              <EmailSettingsForm connected={connected} fromEmail={conn?.config?.fromEmail ?? ""} fromName={conn?.config?.fromName ?? ctx.workspace.name} address={conn?.config?.address ?? ""} />
            ) : (
              !connected && <Alert tone="info">Ask an admin to connect the email service.</Alert>
            )}
            {isAdmin && connected && (
              <div className="flex flex-wrap items-start gap-2 border-t pt-4">
                <TestEmailButton />
                <form action={removeEmailSettings}><Button variant="ghost" size="sm" className="text-destructive">Disconnect</Button></form>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Your follow-ups</CardTitle>
              <CardDescription>Each one is a short series of emails that starts automatically.</CardDescription>
            </CardHeader>
            <CardContent>
              {seqs.length === 0 ? (
                <EmptyState
                  icon={<Mail className="size-5" />}
                  title="No follow-ups yet"
                  description={connected ? "Create one to email new leads automatically." : "Connect your email service first."}
                  action={connected ? (newButton ?? undefined) : undefined}
                />
              ) : (
                <ul className="divide-y">
                  {seqs.map((s) => (
                    <li key={s.id}>
                      <Link href={`/email/${s.id}`} className="flex items-center gap-3 py-3 hover:opacity-80">
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium">{s.name}</p>
                          <p className="text-sm text-muted-foreground">{TRIGGER_LABEL[s.trigger] ?? s.trigger} · {s.steps.length} {s.steps.length === 1 ? "email" : "emails"}</p>
                        </div>
                        {s.active ? <Badge tone="success">On</Badge> : <Badge>Off</Badge>}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Recently sent</CardTitle></CardHeader>
            <CardContent>
              {recent.length === 0 ? (
                <p className="text-sm text-muted-foreground">No emails sent yet.</p>
              ) : (
                <ul className="divide-y text-sm">
                  {recent.map(({ m, name }) => (
                    <li key={m.id} className="flex flex-wrap items-center gap-2 py-2">
                      <span className="min-w-0 flex-1 truncate"><span className="font-medium">{name ?? m.toEmail}</span> · {m.subject}</span>
                      {m.status === "sent" ? <Badge tone="success">Sent</Badge> : <Badge tone="danger" title={m.error ?? ""}>Failed</Badge>}
                      <span className="text-xs text-muted-foreground">{fmt.format(m.createdAt)}</span>
                      {m.error && <p className="w-full text-xs text-destructive">{m.error}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
