import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq, ne, or } from "drizzle-orm";
import { ArrowLeft, Trash2, Download } from "lucide-react";
import { InstagramIcon as Instagram, MessengerIcon as MessageCircle } from "@/components/brand-icons";
import { db } from "@/db";
import { activities, contactNotes, contacts, conversations, memberships, users } from "@/db/schema";
import { requireWorkspace, hasRole } from "@/lib/auth";
import { Avatar, Badge, Card, CardContent, CardHeader, CardTitle, Textarea } from "@/components/ui/primitives";
import { Button, buttonVariants } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { addNote, deleteContact, mergeContacts } from "@/lib/actions/contacts";
import { timeAgo, stageLabel } from "@/lib/utils";
import { ContactEditForm } from "./edit-form";

export default async function ContactPage({ params }: PageProps<"/contacts/[id]">) {
  const ctx = await requireWorkspace();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [contact] = await db.select().from(contacts).where(and(eq(contacts.id, id), eq(contacts.workspaceId, ctx.workspace.id))).limit(1);
  if (!contact) notFound();

  const dupeConds = [contact.email && eq(contacts.email, contact.email), contact.phone && eq(contacts.phone, contact.phone)].filter(Boolean);
  const [notes, timeline, convs, team, dupes] = await Promise.all([
    db
      .select({ note: contactNotes, author: users.name })
      .from(contactNotes)
      .leftJoin(users, eq(users.id, contactNotes.authorId))
      .where(eq(contactNotes.contactId, id))
      .orderBy(desc(contactNotes.createdAt)),
    db.select().from(activities).where(eq(activities.contactId, id)).orderBy(desc(activities.createdAt)).limit(30),
    db.select().from(conversations).where(eq(conversations.contactId, id)),
    db.select({ id: users.id, name: users.name }).from(memberships).innerJoin(users, eq(users.id, memberships.userId)).where(eq(memberships.workspaceId, ctx.workspace.id)),
    dupeConds.length
      ? db
          .select({ id: contacts.id, name: contacts.name, email: contacts.email })
          .from(contacts)
          .where(and(eq(contacts.workspaceId, ctx.workspace.id), ne(contacts.id, id), or(...(dupeConds as never[]))))
          .limit(5)
      : Promise.resolve([]),
  ]);

  return (
    <>
      <Link href="/contacts" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Contacts
      </Link>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center">
        <Avatar name={contact.name} src={contact.avatarUrl} className="size-14 text-base" />
        <div className="flex-1">
          <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold tracking-tight">
            {contact.name}
            {contact.isDemo && <Badge tone="warning">Demo</Badge>}
            {contact.optedOut && <Badge tone="danger">Opted out</Badge>}
          </h1>
          <p className="text-sm text-muted-foreground">
            {stageLabel(contact.stage)} · Score {contact.leadScore} ({contact.temperature}) · Source: {contact.source} · Added {timeAgo(contact.createdAt)}
          </p>
        </div>
        <div className="flex gap-2">
          {convs.map((c) => (
            <Link key={c.id} href={`/inbox?c=${c.id}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
              {c.channel === "instagram" ? <Instagram /> : <MessageCircle />} Open {c.channel} chat
            </Link>
          ))}
          <a href={`/api/contacts/${contact.id}/data`} className={buttonVariants({ variant: "ghost", size: "sm" })} title="Export this contact's data (privacy request)">
            <Download /> Data export
          </a>
        </div>
      </div>

      {dupes.length > 0 && (
        <Card className="mb-6 border-warning/50 bg-warning/5">
          <CardContent className="pt-5 text-sm">
            <p className="font-medium">Possible duplicates</p>
            <ul className="mt-2 flex flex-col gap-2">
              {dupes.map((d) => (
                <li key={d.id} className="flex flex-wrap items-center gap-3">
                  <Link href={`/contacts/${d.id}`} className="hover:underline">{d.name} {d.email && `(${d.email})`}</Link>
                  {hasRole(ctx.role, "admin") && (
                    <form action={mergeContacts}>
                      <input type="hidden" name="primaryId" value={contact.id} />
                      <input type="hidden" name="duplicateId" value={d.id} />
                      <Button size="sm" variant="outline">Merge into this contact</Button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Profile</CardTitle></CardHeader>
          <CardContent>
            <ContactEditForm contact={contact} team={team} />
          </CardContent>
        </Card>
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader><CardTitle>Notes</CardTitle></CardHeader>
            <CardContent>
              <form action={addNote} className="flex flex-col gap-2">
                <input type="hidden" name="contactId" value={contact.id} />
                <Textarea name="body" placeholder="Add an internal note…" required />
                <SubmitButton size="sm" variant="secondary">Add note</SubmitButton>
              </form>
              <ul className="mt-4 flex flex-col gap-3">
                {notes.map(({ note, author }) => (
                  <li key={note.id} className="rounded-xl bg-muted p-3 text-sm">
                    <p className="whitespace-pre-wrap">{note.body}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{author ?? "Someone"} · {timeAgo(note.createdAt)}</p>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Activity timeline</CardTitle></CardHeader>
            <CardContent>
              {timeline.length === 0 ? (
                <p className="text-sm text-muted-foreground">No activity yet.</p>
              ) : (
                <ol className="relative flex flex-col gap-4 border-l pl-4">
                  {timeline.map((a) => (
                    <li key={a.id} className="text-sm">
                      <span className="absolute -left-1 mt-1.5 size-2 rounded-full bg-primary" />
                      <p>{a.description}</p>
                      <p className="text-xs text-muted-foreground">{timeAgo(a.createdAt)}</p>
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>
          {hasRole(ctx.role, "admin") && (
            <form action={deleteContact}>
              <input type="hidden" name="id" value={contact.id} />
              <Button variant="ghost" className="w-full text-destructive" type="submit">
                <Trash2 /> Permanently delete contact and messages
              </Button>
            </form>
          )}
        </div>
      </div>
    </>
  );
}
