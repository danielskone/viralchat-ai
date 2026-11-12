import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { auditLogs, savedReplies, users } from "@/db/schema";
import { requireWorkspace, hasRole } from "@/lib/auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, PageHeader, Input, Textarea } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { createSavedReply } from "@/lib/actions/inbox";
import { deleteSavedReply, disableDemo, enableDemo } from "@/lib/actions/settings";
import { deleteWorkspace } from "@/lib/actions/workspace";
import { WorkspaceForm } from "./workspace-form";
import { timeAgo } from "@/lib/utils";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const ctx = await requireWorkspace();
  const isAdmin = hasRole(ctx.role, "admin");
  const [replies, logs] = await Promise.all([
    db.select().from(savedReplies).where(eq(savedReplies.workspaceId, ctx.workspace.id)),
    isAdmin
      ? db
          .select({ log: auditLogs, user: users.name })
          .from(auditLogs)
          .leftJoin(users, eq(users.id, auditLogs.userId))
          .where(eq(auditLogs.workspaceId, ctx.workspace.id))
          .orderBy(desc(auditLogs.createdAt))
          .limit(30)
      : Promise.resolve([]),
  ]);
  return (
    <>
      <PageHeader title="Settings" description="Workspace details, saved replies, demo data and security." />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Business information</CardTitle></CardHeader>
          <CardContent><WorkspaceForm workspace={ctx.workspace} disabled={!isAdmin} /></CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Saved replies</CardTitle>
            <CardDescription>Reusable answers for the inbox composer.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <form action={createSavedReply} className="flex flex-col gap-2">
              <Input name="title" placeholder="Title, e.g. Shipping times" required aria-label="Title" />
              <Textarea name="body" placeholder="Reply text" rows={3} required aria-label="Reply text" />
              <SubmitButton size="sm" variant="secondary" className="self-start">Add saved reply</SubmitButton>
            </form>
            <ul className="divide-y text-sm">
              {replies.map((r) => (
                <li key={r.id} className="flex items-start gap-2 py-2">
                  <div className="flex-1">
                    <p className="font-medium">{r.title}</p>
                    <p className="line-clamp-2 text-muted-foreground">{r.body}</p>
                  </div>
                  <form action={deleteSavedReply}><input type="hidden" name="id" value={r.id} /><Button size="sm" variant="ghost">Delete</Button></form>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
        <Card id="demo">
          <CardHeader>
            <CardTitle>Demo mode</CardTitle>
            <CardDescription>Explore the inbox, CRM and pipeline with clearly labelled sample data. Demo conversations never send real messages; you can type as the customer to see automations and AI respond.</CardDescription>
          </CardHeader>
          <CardContent>
            {isAdmin ? (
              ctx.workspace.demoMode ? (
                <form action={disableDemo}><SubmitButton variant="outline" pendingText="Removing…">Remove demo data</SubmitButton></form>
              ) : (
                <form action={enableDemo}><SubmitButton variant="secondary" pendingText="Loading…">Load demo data</SubmitButton></form>
              )
            ) : (
              <p className="text-sm text-muted-foreground">Only admins can change demo mode.</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Privacy & data</CardTitle>
            <CardDescription>Tools for privacy requests and compliance.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm text-muted-foreground">
            <p>• Export a contact’s full data (JSON) or permanently delete a contact and their messages from the contact’s profile.</p>
            <p>• Mark contacts as opted out to stop all automated and AI messages to them.</p>
            <p>• OAuth tokens and API keys are encrypted with AES-256-GCM; webhooks are signature-verified.</p>
            <p>• Automated messages respect Meta’s 24-hour window; human replies use the HUMAN_AGENT tag up to 7 days.</p>
          </CardContent>
        </Card>
        {isAdmin && (
          <Card className="lg:col-span-2">
            <CardHeader><CardTitle>Audit log</CardTitle><CardDescription>Security-relevant actions in this workspace.</CardDescription></CardHeader>
            <CardContent>
              {logs.length === 0 ? <p className="text-sm text-muted-foreground">No events yet.</p> : (
                <table className="w-full text-sm">
                  <tbody>
                    {logs.map(({ log, user }) => (
                      <tr key={log.id} className="border-b last:border-0">
                        <td className="py-2 font-mono text-xs">{log.action}</td>
                        <td className="py-2 text-muted-foreground">{user ?? "System"}</td>
                        <td className="py-2 text-right text-muted-foreground">{timeAgo(log.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        )}
        {ctx.role === "owner" && (
          <Card className="border-destructive/40 lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-destructive">Delete workspace</CardTitle>
              <CardDescription>Permanently deletes all contacts, conversations, automations and settings. Cancel any paid subscription first.</CardDescription>
            </CardHeader>
            <CardContent>
              <form action={deleteWorkspace} className="flex flex-wrap gap-2">
                <Input name="confirm" placeholder={`Type “${ctx.workspace.name}” to confirm`} className="max-w-sm" aria-label="Confirm workspace name" required />
                <Button variant="destructive">Delete workspace</Button>
              </form>
            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
}
