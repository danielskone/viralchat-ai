"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { emailSequences, integrations, landingPages, type EmailStep } from "@/db/schema";
import { requireWorkspace } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { appUrl } from "@/lib/booking-server";
import { encrypt } from "@/lib/crypto";
import { MAX_EMAIL_STEPS, formatFrom, renderEmail } from "@/lib/email";
import { EmailSendError, getEmailSettings, sendViaResend } from "@/lib/email-server";

export type EmailFormState = { error?: string; ok?: string } | undefined;

const EMAIL = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/;

/** Checks the key with Resend. Sending-only keys can't list domains; Resend answers "restricted_api_key", which still proves the key is real. */
async function verifyResendKey(key: string): Promise<string | null> {
  try {
    const res = await fetch("https://api.resend.com/domains", { headers: { Authorization: `Bearer ${key}` } });
    if (res.ok) return null;
    const data = (await res.json().catch(() => ({}))) as { name?: string; message?: string };
    if (data.name === "restricted_api_key") return null;
    return data.message || `Resend said no (${res.status}).`;
  } catch (e) {
    return `Couldn't reach Resend: ${e instanceof Error ? e.message : String(e)}`;
  }
}

export async function saveEmailSettings(_: EmailFormState, form: FormData): Promise<EmailFormState> {
  const ctx = await requireWorkspace("admin");
  const apiKey = String(form.get("apiKey") ?? "").trim();
  const fromEmail = String(form.get("fromEmail") ?? "").trim().toLowerCase();
  const fromName = String(form.get("fromName") ?? "").trim().slice(0, 80);
  const address = String(form.get("address") ?? "").trim().slice(0, 200);
  if (!EMAIL.test(fromEmail)) return { error: "Enter the email address your emails come from." };

  const [existing] = await db
    .select()
    .from(integrations)
    .where(and(eq(integrations.workspaceId, ctx.workspace.id), eq(integrations.provider, "resend")))
    .limit(1);
  let secretEnc = existing?.secretEnc ?? null;
  if (apiKey) {
    if (!apiKey.startsWith("re_")) return { error: "That doesn't look like a Resend API key (it should start with re_)." };
    const problem = await verifyResendKey(apiKey);
    if (problem) return { error: problem };
    secretEnc = encrypt(apiKey);
  }
  if (!secretEnc) return { error: "Paste your Resend API key." };

  const values = {
    workspaceId: ctx.workspace.id,
    provider: "resend" as const,
    status: "connected" as const,
    secretEnc,
    config: { fromEmail, fromName, address },
    lastError: null,
    connectedAt: existing?.connectedAt ?? new Date(),
    connectedBy: ctx.user.id,
    updatedAt: new Date(),
  };
  await db.insert(integrations).values(values).onConflictDoUpdate({ target: [integrations.workspaceId, integrations.provider], set: values });
  await audit(ctx.workspace.id, ctx.user.id, "integration.resend.connect");
  revalidatePath("/email");
  return { ok: "Saved. Now send yourself a test email to make sure it arrives." };
}

export async function removeEmailSettings() {
  const ctx = await requireWorkspace("admin");
  await db
    .update(integrations)
    .set({ status: "disconnected", secretEnc: null, updatedAt: new Date() })
    .where(and(eq(integrations.workspaceId, ctx.workspace.id), eq(integrations.provider, "resend")));
  await audit(ctx.workspace.id, ctx.user.id, "integration.resend.disconnect");
  revalidatePath("/email");
}

export async function sendTestEmail(_: EmailFormState): Promise<EmailFormState> {
  const ctx = await requireWorkspace("admin");
  const s = await getEmailSettings(ctx.workspace.id);
  if (!s) return { error: "Save your email settings first." };
  const name = s.fromName || ctx.workspace.name;
  const { html, text } = renderEmail({
    body: `Hi ${ctx.user.name.split(" ")[0]},\n\nThis is a test email from ViralChat AI. If you're reading it, your follow-up emails are ready to go.`,
    businessName: name,
    address: s.address,
    unsubscribeUrl: `${appUrl()}/email`,
  });
  try {
    await sendViaResend({ apiKey: s.apiKey, from: formatFrom(name, s.fromEmail), to: ctx.user.email, subject: "ViralChat AI test email", html, text });
  } catch (e) {
    const msg = e instanceof EmailSendError ? e.message : String(e);
    return { error: `The test email wasn't sent. Resend said: ${msg}` };
  }
  return { ok: `Test email sent to ${ctx.user.email}. Check your inbox (and spam folder).` };
}

export async function createSequence() {
  const ctx = await requireWorkspace("admin");
  const [s] = await db
    .insert(emailSequences)
    .values({
      workspaceId: ctx.workspace.id,
      name: "Follow up new leads",
      trigger: "form_submitted",
      steps: [
        { delayDays: 0, subject: "Thanks for reaching out, {{first_name}}!", body: `Hi {{first_name}},\n\nThanks for getting in touch with ${ctx.workspace.name}. We'll reply soon.\n\nWant to talk sooner? Pick a time here: {{booking_link}}` },
        { delayDays: 2, subject: "Still interested, {{first_name}}?", body: "Hi {{first_name}},\n\nJust checking in. Reply to this email or book a time: {{booking_link}}" },
      ],
    })
    .returning({ id: emailSequences.id });
  redirect(`/email/${s!.id}`);
}

export async function saveSequence(_: EmailFormState, form: FormData): Promise<EmailFormState> {
  const ctx = await requireWorkspace("admin");
  const id = String(form.get("id") ?? "");
  const trigger = form.get("trigger") === "booking_created" ? "booking_created" : "form_submitted";
  let pageId: string | null = String(form.get("pageId") ?? "") || null;
  if (trigger !== "form_submitted") pageId = null;
  if (pageId) {
    const [p] = await db.select({ id: landingPages.id }).from(landingPages).where(and(eq(landingPages.id, pageId), eq(landingPages.workspaceId, ctx.workspace.id))).limit(1);
    if (!p) pageId = null;
  }
  const steps: EmailStep[] = [];
  for (let i = 0; i < MAX_EMAIL_STEPS; i++) {
    const subject = String(form.get(`subject${i}`) ?? "").trim().slice(0, 200);
    const body = String(form.get(`body${i}`) ?? "").trim().slice(0, 5000);
    if (!subject && !body) continue;
    if (!subject || !body) return { error: `Email ${steps.length + 1} needs both a subject and a message.` };
    const d = Number(form.get(`delay${i}`));
    steps.push({ subject, body, delayDays: Number.isFinite(d) ? Math.min(365, Math.max(0, Math.round(d))) : 0 });
  }
  const active = form.get("active") === "on";
  if (active && steps.length === 0) return { error: "Add at least one email before turning this on." };
  if (active && !(await getEmailSettings(ctx.workspace.id))) return { error: "Connect your email service at the top of the Email page before turning this on." };

  const [row] = await db
    .update(emailSequences)
    .set({ name: String(form.get("name") ?? "").trim().slice(0, 120) || "Email follow-up", trigger, pageId, steps, active, updatedAt: new Date() })
    .where(and(eq(emailSequences.id, id), eq(emailSequences.workspaceId, ctx.workspace.id)))
    .returning({ id: emailSequences.id });
  if (!row) return { error: "That follow-up no longer exists." };
  await audit(ctx.workspace.id, ctx.user.id, "email.sequence.save", id, { active });
  revalidatePath("/email");
  revalidatePath(`/email/${id}`);
  return { ok: active ? "Saved and on. New people will start getting these emails." : "Saved. It's off, so nobody gets these emails yet." };
}

export async function deleteSequence(form: FormData) {
  const ctx = await requireWorkspace("admin");
  const id = String(form.get("id") ?? "");
  await db.delete(emailSequences).where(and(eq(emailSequences.id, id), eq(emailSequences.workspaceId, ctx.workspace.id)));
  await audit(ctx.workspace.id, ctx.user.id, "email.sequence.delete", id);
  revalidatePath("/email");
  redirect("/email");
}
