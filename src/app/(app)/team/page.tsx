import { and, eq, isNull, gt } from "drizzle-orm";
import { db } from "@/db";
import { invitations, memberships, users } from "@/db/schema";
import { requireWorkspace, hasRole } from "@/lib/auth";
import { getPlan, formatLimit } from "@/lib/plans";
import { Avatar, Badge, Card, CardContent, CardHeader, CardTitle, CardDescription, PageHeader, Select } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { changeRole, removeMember, revokeInvite } from "@/lib/actions/team";
import { InviteForm } from "./invite-form";
import { timeAgo } from "@/lib/utils";

export const metadata = { title: "Team" };

export default async function TeamPage() {
  const ctx = await requireWorkspace();
  const [members, invites] = await Promise.all([
    db
      .select({ id: users.id, name: users.name, email: users.email, role: memberships.role, joined: memberships.createdAt })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(eq(memberships.workspaceId, ctx.workspace.id))
      .orderBy(memberships.createdAt),
    db.select().from(invitations).where(and(eq(invitations.workspaceId, ctx.workspace.id), isNull(invitations.acceptedAt), gt(invitations.expiresAt, new Date()))),
  ]);
  const isAdmin = hasRole(ctx.role, "admin");
  const isOwner = ctx.role === "owner";
  const limit = getPlan(ctx.workspace.plan).limits.members;
  return (
    <>
      <PageHeader title="Team" description={`${members.length} of ${formatLimit(limit)} seats used. Owners manage billing; admins manage integrations and automations; staff work the inbox and CRM.`} />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Members</CardTitle></CardHeader>
          <CardContent>
            <ul className="divide-y">
              {members.map((m) => (
                <li key={m.id} className="flex flex-wrap items-center gap-3 py-3">
                  <Avatar name={m.name} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{m.name} {m.id === ctx.user.id && <span className="text-xs text-muted-foreground">(you)</span>}</p>
                    <p className="truncate text-xs text-muted-foreground">{m.email} · joined {timeAgo(m.joined)}</p>
                  </div>
                  {isOwner && m.id !== ctx.user.id ? (
                    <form action={changeRole} className="flex items-center gap-2">
                      <input type="hidden" name="userId" value={m.id} />
                      <Select name="role" defaultValue={m.role} className="h-8 w-28" aria-label={`Role for ${m.name}`}>
                        <option value="owner">Owner</option>
                        <option value="admin">Admin</option>
                        <option value="staff">Staff</option>
                      </Select>
                      <Button size="sm" variant="outline">Update</Button>
                    </form>
                  ) : (
                    <Badge tone="primary" className="capitalize">{m.role}</Badge>
                  )}
                  {isAdmin && m.id !== ctx.user.id && (
                    <form action={removeMember}>
                      <input type="hidden" name="userId" value={m.id} />
                      <Button size="sm" variant="ghost" className="text-destructive">Remove</Button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
        <div className="flex flex-col gap-6">
          {isAdmin && (
            <Card>
              <CardHeader>
                <CardTitle>Invite a teammate</CardTitle>
                <CardDescription>You’ll get a private invite link to share. It expires in 7 days and only works for that email.</CardDescription>
              </CardHeader>
              <CardContent><InviteForm /></CardContent>
            </Card>
          )}
          {invites.length > 0 && (
            <Card>
              <CardHeader><CardTitle>Pending invitations</CardTitle></CardHeader>
              <CardContent>
                <ul className="flex flex-col gap-2 text-sm">
                  {invites.map((i) => (
                    <li key={i.id} className="flex items-center gap-2">
                      <span className="flex-1 truncate">{i.email}</span>
                      <Badge className="capitalize">{i.role}</Badge>
                      {isAdmin && (
                        <form action={revokeInvite}>
                          <input type="hidden" name="id" value={i.id} />
                          <Button size="sm" variant="ghost">Revoke</Button>
                        </form>
                      )}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
