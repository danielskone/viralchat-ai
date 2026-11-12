"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { contactNotes, contacts, conversations, activities, workspaces } from "@/db/schema";
import { requireWorkspace } from "@/lib/auth";
import { audit, logActivity } from "@/lib/audit";
import { getPlan } from "@/lib/plans";
import { count } from "drizzle-orm";
import { stageLabel, temperatureFromScore } from "@/lib/utils";
import { parseCsv } from "@/lib/csv";

export type FormState = { error?: string; ok?: string } | undefined;

const contactSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  email: z.union([z.literal(""), z.email("Invalid email")]).optional(),
  phone: z.string().trim().max(40).optional(),
  tags: z.string().optional(),
  stage: z.string().optional(),
});

async function assertContactLimit(workspaceId: string, adding = 1) {
  const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
  const [{ n }] = (await db.select({ n: count() }).from(contacts).where(eq(contacts.workspaceId, workspaceId))) as [{ n: number }];
  const limit = getPlan(ws?.plan).limits.contacts;
  if (n + adding > limit) throw new Error(`Your plan allows ${limit.toLocaleString()} contacts. Upgrade on the Billing page to add more.`);
}

const tagList = (s?: string) =>
  Array.from(new Set((s ?? "").split(",").map((t) => t.trim().toLowerCase()).filter(Boolean))).slice(0, 50);

export async function createContact(_: FormState, form: FormData): Promise<FormState> {
  const ctx = await requireWorkspace();
  const parsed = contactSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  try {
    await assertContactLimit(ctx.workspace.id);
  } catch (e) {
    return { error: (e as Error).message };
  }
  const [c] = await db
    .insert(contacts)
    .values({
      workspaceId: ctx.workspace.id,
      name: parsed.data.name,
      email: parsed.data.email?.toLowerCase() || null,
      phone: parsed.data.phone || null,
      tags: tagList(parsed.data.tags),
      stage: parsed.data.stage || "new_lead",
      source: "manual",
      ownerId: ctx.user.id,
    })
    .returning();
  await logActivity(ctx.workspace.id, c!.id, "created", `Contact created by ${ctx.user.name}`);
  revalidatePath("/contacts");
  redirect(`/contacts/${c!.id}`);
}

export async function updateContact(_: FormState, form: FormData): Promise<FormState> {
  const ctx = await requireWorkspace();
  const id = String(form.get("id"));
  const parsed = contactSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const [before] = await db.select().from(contacts).where(and(eq(contacts.id, id), eq(contacts.workspaceId, ctx.workspace.id))).limit(1);
  if (!before) return { error: "Contact not found" };
  const score = Math.max(0, Math.min(100, Number(form.get("leadScore") ?? before.leadScore) || 0));
  const ownerId = String(form.get("ownerId") ?? "") || null;
  const custom: Record<string, string> = {};
  for (const [k, v] of form.entries()) {
    if (k.startsWith("cf_key_")) {
      const idx = k.slice(7);
      const key = String(v).trim();
      const val = String(form.get(`cf_val_${idx}`) ?? "").trim();
      if (key) custom[key.slice(0, 60)] = val.slice(0, 1000);
    }
  }
  await db
    .update(contacts)
    .set({
      name: parsed.data.name,
      email: parsed.data.email?.toLowerCase() || null,
      phone: parsed.data.phone || null,
      tags: tagList(parsed.data.tags),
      stage: parsed.data.stage || before.stage,
      leadScore: score,
      temperature: temperatureFromScore(score),
      ownerId,
      customFields: custom,
      optedOut: form.get("optedOut") === "on",
      updatedAt: new Date(),
    })
    .where(eq(contacts.id, id));
  if (before.stage !== parsed.data.stage && parsed.data.stage) {
    await logActivity(ctx.workspace.id, id, "stage_changed", `Stage changed to ${stageLabel(parsed.data.stage)} by ${ctx.user.name}`);
  }
  revalidatePath(`/contacts/${id}`);
  return { ok: "Contact saved" };
}

export async function setContactStage(contactId: string, stage: string) {
  const ctx = await requireWorkspace();
  const r = await db
    .update(contacts)
    .set({ stage, updatedAt: new Date() })
    .where(and(eq(contacts.id, contactId), eq(contacts.workspaceId, ctx.workspace.id)))
    .returning({ id: contacts.id });
  if (r.length) await logActivity(ctx.workspace.id, contactId, "stage_changed", `Stage changed to ${stageLabel(stage)} by ${ctx.user.name}`);
  revalidatePath("/pipeline");
}

export async function addNote(form: FormData) {
  const ctx = await requireWorkspace();
  const contactId = String(form.get("contactId"));
  const body = String(form.get("body") ?? "").trim();
  if (!body) return;
  const [c] = await db.select({ id: contacts.id }).from(contacts).where(and(eq(contacts.id, contactId), eq(contacts.workspaceId, ctx.workspace.id))).limit(1);
  if (!c) return;
  await db.insert(contactNotes).values({ workspaceId: ctx.workspace.id, contactId, authorId: ctx.user.id, body: body.slice(0, 5000) });
  await logActivity(ctx.workspace.id, contactId, "note", `${ctx.user.name} added a note`);
  revalidatePath(`/contacts/${contactId}`);
}

export async function deleteContact(form: FormData) {
  const ctx = await requireWorkspace("admin");
  const id = String(form.get("id"));
  await db.delete(contacts).where(and(eq(contacts.id, id), eq(contacts.workspaceId, ctx.workspace.id)));
  await audit(ctx.workspace.id, ctx.user.id, "contact.delete", id);
  revalidatePath("/contacts");
  redirect("/contacts");
}

export async function bulkTag(form: FormData) {
  const ctx = await requireWorkspace();
  const ids = form.getAll("ids").map(String);
  const tag = String(form.get("tag") ?? "").trim().toLowerCase();
  if (!ids.length || !tag) return;
  const rows = await db.select().from(contacts).where(and(eq(contacts.workspaceId, ctx.workspace.id), inArray(contacts.id, ids)));
  for (const r of rows) {
    if (!r.tags.includes(tag)) await db.update(contacts).set({ tags: [...r.tags, tag] }).where(eq(contacts.id, r.id));
  }
  revalidatePath("/contacts");
}

export async function mergeContacts(form: FormData) {
  const ctx = await requireWorkspace("admin");
  const primaryId = String(form.get("primaryId"));
  const duplicateId = String(form.get("duplicateId"));
  const both = await db.select().from(contacts).where(and(eq(contacts.workspaceId, ctx.workspace.id), inArray(contacts.id, [primaryId, duplicateId])));
  const primary = both.find((c) => c.id === primaryId);
  const dupe = both.find((c) => c.id === duplicateId);
  if (!primary || !dupe) throw new Error("Contacts not found");
  const dupeConvs = await db.select().from(conversations).where(eq(conversations.contactId, dupe.id));
  const primaryConvs = await db.select().from(conversations).where(eq(conversations.contactId, primary.id));
  await db.transaction(async (tx) => {
    for (const conv of dupeConvs) {
      if (primaryConvs.some((p) => p.channel === conv.channel)) continue; // keep primary's thread for that channel
      await tx.update(conversations).set({ contactId: primary.id }).where(eq(conversations.id, conv.id));
    }
    await tx.update(contactNotes).set({ contactId: primary.id }).where(eq(contactNotes.contactId, dupe.id));
    await tx.update(activities).set({ contactId: primary.id }).where(eq(activities.contactId, dupe.id));
    // Clear unique external ids on the duplicate before copying them onto the primary
    await tx.delete(contacts).where(eq(contacts.id, dupe.id));
    await tx
      .update(contacts)
      .set({
        email: primary.email ?? dupe.email,
        phone: primary.phone ?? dupe.phone,
        instagramId: primary.instagramId ?? dupe.instagramId,
        messengerId: primary.messengerId ?? dupe.messengerId,
        instagramUsername: primary.instagramUsername ?? dupe.instagramUsername,
        tags: Array.from(new Set([...primary.tags, ...dupe.tags])),
        leadScore: Math.max(primary.leadScore, dupe.leadScore),
        temperature: temperatureFromScore(Math.max(primary.leadScore, dupe.leadScore)),
        customFields: { ...dupe.customFields, ...primary.customFields },
      })
      .where(eq(contacts.id, primary.id));
  });
  await logActivity(ctx.workspace.id, primary.id, "merged", `Merged duplicate contact "${dupe.name}"`);
  await audit(ctx.workspace.id, ctx.user.id, "contact.merge", primary.id, { duplicateId });
  redirect(`/contacts/${primary.id}`);
}

export async function importContacts(_: FormState, form: FormData): Promise<FormState> {
  const ctx = await requireWorkspace();
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a CSV file" };
  if (file.size > 5 * 1024 * 1024) return { error: "CSV must be under 5 MB" };
  const rows = parseCsv(await file.text());
  if (rows.length < 2) return { error: "The CSV has no data rows" };
  const header = rows[0]!.map((h) => h.trim().toLowerCase());
  const col = (names: string[]) => header.findIndex((h) => names.includes(h));
  const iName = col(["name", "full name", "full_name"]);
  const iFirst = col(["first name", "first_name", "firstname"]);
  const iLast = col(["last name", "last_name", "lastname"]);
  const iEmail = col(["email", "email address", "e-mail"]);
  const iPhone = col(["phone", "phone number", "mobile"]);
  const iTags = col(["tags", "tag"]);
  if (iName < 0 && iFirst < 0 && iEmail < 0) return { error: "CSV needs a name, first name, or email column" };

  const existing = await db.select({ email: contacts.email }).from(contacts).where(eq(contacts.workspaceId, ctx.workspace.id));
  const seen = new Set(existing.map((e) => e.email).filter(Boolean) as string[]);
  const values: (typeof contacts.$inferInsert)[] = [];
  let skipped = 0;
  for (const r of rows.slice(1)) {
    const email = iEmail >= 0 ? r[iEmail]?.trim().toLowerCase() || null : null;
    if (email && (seen.has(email) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
      skipped++;
      continue;
    }
    const name = (iName >= 0 ? r[iName] : [r[iFirst] ?? "", iLast >= 0 ? r[iLast] ?? "" : ""].join(" "))?.trim() || email || "";
    if (!name) {
      skipped++;
      continue;
    }
    if (email) seen.add(email);
    values.push({
      workspaceId: ctx.workspace.id,
      name: name.slice(0, 120),
      email,
      phone: iPhone >= 0 ? r[iPhone]?.trim() || null : null,
      tags: iTags >= 0 ? tagList((r[iTags] ?? "").replace(/;/g, ",")) : [],
      source: "import",
    });
  }
  try {
    await assertContactLimit(ctx.workspace.id, values.length);
  } catch (e) {
    return { error: (e as Error).message };
  }
  for (let i = 0; i < values.length; i += 500) await db.insert(contacts).values(values.slice(i, i + 500));
  await audit(ctx.workspace.id, ctx.user.id, "contact.import", undefined, { imported: values.length, skipped });
  revalidatePath("/contacts");
  return { ok: `Imported ${values.length} contacts${skipped ? `, skipped ${skipped} duplicates or invalid rows` : ""}.` };
}
