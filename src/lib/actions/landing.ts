"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { contacts, formSubmissions, landingPages } from "@/db/schema";
import { requireWorkspace } from "@/lib/auth";
import { audit, logActivity } from "@/lib/audit";
import { slugify } from "@/lib/booking";
import { bookingLinkFor, notifyMembers } from "@/lib/booking-server";
import { enrollContact } from "@/lib/email-server";
import { interpolate } from "@/lib/engine/matcher";
import { stageLabel } from "@/lib/utils";

export type LandingFormState = { error?: string; ok?: string } | undefined;

async function uniqueSlug(base: string, exceptId?: string) {
  const root = slugify(base);
  for (let i = 0; i < 6; i++) {
    const slug = i === 0 ? root : `${root}-${Math.random().toString(36).slice(2, 6)}`;
    const where = exceptId ? and(eq(landingPages.slug, slug), ne(landingPages.id, exceptId)) : eq(landingPages.slug, slug);
    const [clash] = await db.select({ id: landingPages.id }).from(landingPages).where(where).limit(1);
    if (!clash) return slug;
  }
  return `${root}-${Date.now().toString(36)}`;
}

export async function createLandingPage() {
  const ctx = await requireWorkspace("admin");
  const slug = await uniqueSlug(`${ctx.workspace.name}-offer`);
  const [page] = await db
    .insert(landingPages)
    .values({
      workspaceId: ctx.workspace.id,
      slug,
      title: "New lead page",
      headline: `Get a free quote from ${ctx.workspace.name}`,
      subheadline: "Leave your details and we'll get back to you fast.",
      buttonText: "Get my quote",
      successMessage: "Thanks, {{first_name}}! We got your details and will be in touch soon.",
      tagOnSubmit: "lead-form",
      stageOnSubmit: "new_lead",
    })
    .returning({ id: landingPages.id });
  await audit(ctx.workspace.id, ctx.user.id, "landing.create", page!.id);
  redirect(`/pages/${page!.id}`);
}

export async function saveLandingPage(_: LandingFormState, form: FormData): Promise<LandingFormState> {
  const ctx = await requireWorkspace("admin");
  const id = String(form.get("id") ?? "");
  const [page] = await db.select().from(landingPages).where(and(eq(landingPages.id, id), eq(landingPages.workspaceId, ctx.workspace.id))).limit(1);
  if (!page) return { error: "That page no longer exists." };

  const str = (k: string, max: number) => String(form.get(k) ?? "").trim().slice(0, max);
  const slug = slugify(str("slug", 60));
  const [clash] = await db.select({ id: landingPages.id }).from(landingPages).where(and(eq(landingPages.slug, slug), ne(landingPages.id, page.id))).limit(1);
  if (clash) return { error: `The link name "${slug}" is taken. Pick another.` };

  const headline = str("headline", 200);
  if (!headline) return { error: "Add a headline." };
  const imageUrl = str("imageUrl", 1000);
  if (imageUrl && !/^https:\/\/\S+$/i.test(imageUrl)) return { error: "The image link must start with https://" };
  const afterSubmit = form.get("afterSubmit") === "booking" ? "booking" : "message";
  const published = form.get("published") === "on";

  await db
    .update(landingPages)
    .set({
      slug,
      title: str("title", 120) || "Untitled page",
      headline,
      subheadline: str("subheadline", 300) || null,
      body: str("body", 4000) || null,
      imageUrl: imageUrl || null,
      buttonText: str("buttonText", 40) || "Send",
      fields: {
        phone: form.get("fieldPhone") === "on",
        phoneRequired: form.get("fieldPhone") === "on" && form.get("phoneRequired") === "on",
        message: form.get("fieldMessage") === "on",
      },
      afterSubmit,
      successMessage: str("successMessage", 1000) || null,
      tagOnSubmit: str("tagOnSubmit", 40) || null,
      stageOnSubmit: str("stageOnSubmit", 40) || null,
      published,
      updatedAt: new Date(),
    })
    .where(eq(landingPages.id, page.id));
  await audit(ctx.workspace.id, ctx.user.id, "landing.save", page.id, { published });
  revalidatePath("/pages");
  revalidatePath(`/pages/${page.id}`);
  return { ok: published ? "Saved. Your page is live." : "Saved as a draft. Turn on Published to make the link work." };
}

export async function deleteLandingPage(form: FormData) {
  const ctx = await requireWorkspace("admin");
  const id = String(form.get("id") ?? "");
  await db.delete(landingPages).where(and(eq(landingPages.id, id), eq(landingPages.workspaceId, ctx.workspace.id)));
  await audit(ctx.workspace.id, ctx.user.id, "landing.delete", id);
  revalidatePath("/pages");
  redirect("/pages");
}

const leadSchema = z.object({
  slug: z.string().min(1).max(60),
  name: z.string().trim().min(1, "Please enter your name.").max(120),
  email: z.string().trim().email("Please enter a valid email.").max(200),
  phone: z.string().trim().max(40),
  message: z.string().trim().max(2000),
  website: z.string().max(200), // honeypot: real people never fill this hidden field
});

export type LeadFormState = { error?: string; done?: { message: string; next?: string } } | undefined;

/** Public action used by /p/[slug]. No login. */
export async function submitLeadForm(_: LeadFormState, form: FormData): Promise<LeadFormState> {
  const parsed = leadSchema.safeParse({
    slug: form.get("slug") ?? "",
    name: form.get("name") ?? "",
    email: form.get("email") ?? "",
    phone: form.get("phone") ?? "",
    message: form.get("message") ?? "",
    website: form.get("website") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Please check the form." };
  const d = parsed.data;

  const [page] = await db.select().from(landingPages).where(eq(landingPages.slug, d.slug)).limit(1);
  if (!page || !page.published) return { error: "This form isn't available." };
  const first = d.name.split(" ")[0] ?? "";
  const thanks = interpolate(page.successMessage || "Thanks, {{first_name}}! We'll be in touch soon.", { first_name: first, name: d.name });
  if (d.website) return { done: { message: thanks } }; // bot: pretend success, store nothing
  if (page.fields.phoneRequired && !d.phone) return { error: "Please enter your phone number." };

  // Match an existing contact by email, else create one.
  const [existing] = await db
    .select()
    .from(contacts)
    .where(and(eq(contacts.workspaceId, page.workspaceId), sql`lower(${contacts.email}) = ${d.email.toLowerCase()}`))
    .limit(1);
  let contactId: string;
  if (existing) {
    contactId = existing.id;
    const tags = page.tagOnSubmit && !existing.tags.includes(page.tagOnSubmit) ? [...existing.tags, page.tagOnSubmit] : existing.tags;
    await db
      .update(contacts)
      .set({
        phone: existing.phone ?? (d.phone || null),
        name: existing.name === "Unknown" ? d.name : existing.name,
        tags,
        stage: page.stageOnSubmit || existing.stage,
        lastActivityAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(contacts.id, existing.id));
  } else {
    const [c] = await db
      .insert(contacts)
      .values({
        workspaceId: page.workspaceId,
        name: d.name,
        email: d.email,
        phone: d.phone || null,
        source: "landing_page",
        tags: page.tagOnSubmit ? [page.tagOnSubmit] : [],
        stage: page.stageOnSubmit || "new_lead",
      })
      .returning({ id: contacts.id });
    contactId = c!.id;
    await logActivity(page.workspaceId, contactId, "created", `Contact created from the "${page.title}" page`);
  }

  const data: Record<string, string> = { name: d.name, email: d.email };
  if (d.phone) data.phone = d.phone;
  if (d.message) data.message = d.message;
  await db.insert(formSubmissions).values({ workspaceId: page.workspaceId, pageId: page.id, contactId, data });
  await db.update(landingPages).set({ submissions: sql`${landingPages.submissions} + 1` }).where(eq(landingPages.id, page.id));
  await logActivity(
    page.workspaceId,
    contactId,
    "form_submitted",
    `Filled in the "${page.title}" form${page.stageOnSubmit ? ` · stage → ${stageLabel(page.stageOnSubmit)}` : ""}`,
  );
  await notifyMembers(page.workspaceId, "New lead from your page", `${d.name} filled in "${page.title}"`, `/pages/${page.id}`);
  await audit(page.workspaceId, null, "landing.submit", page.id);

  await enrollContact(page.workspaceId, contactId, "form_submitted", page.id).catch(() => undefined);
  const next = page.afterSubmit === "booking" ? await bookingLinkFor(page.workspaceId, contactId) : "";
  revalidatePath(`/pages/${page.id}`);
  return { done: { message: thanks, next: next || undefined } };
}
