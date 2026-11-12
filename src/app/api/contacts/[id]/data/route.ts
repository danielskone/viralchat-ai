import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { activities, contactNotes, contacts, conversations, messages } from "@/db/schema";
import { getWorkspaceContext } from "@/lib/auth";
import { audit } from "@/lib/audit";

/** Full data export for one contact (privacy / data-subject access requests). */
export async function GET(_req: Request, { params }: RouteContext<"/api/contacts/[id]/data">) {
  const ctx = await getWorkspaceContext();
  if (!ctx) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  const [contact] = await db.select().from(contacts).where(and(eq(contacts.id, id), eq(contacts.workspaceId, ctx.workspace.id))).limit(1);
  if (!contact) return new Response("Not found", { status: 404 });
  const convs = await db.select().from(conversations).where(eq(conversations.contactId, id));
  const msgs = convs.length ? await db.select().from(messages).where(inArray(messages.conversationId, convs.map((c) => c.id))) : [];
  const notes = await db.select().from(contactNotes).where(eq(contactNotes.contactId, id));
  const acts = await db.select().from(activities).where(eq(activities.contactId, id));
  await audit(ctx.workspace.id, ctx.user.id, "contact.data_export", id);
  return new Response(JSON.stringify({ exportedAt: new Date().toISOString(), contact, conversations: convs, messages: msgs, notes, activities: acts }, null, 2), {
    headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="contact-${id}.json"` },
  });
}
