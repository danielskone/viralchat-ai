import "server-only";
import { and, eq, isNotNull, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  contacts,
  emailEnrollments,
  emailMessages,
  emailSequences,
  integrations,
  workspaces,
  type EmailSequence,
} from "@/db/schema";
import { logActivity } from "./audit";
import { appUrl, bookingLinkFor } from "./booking-server";
import { decrypt, signState, verifyState } from "./crypto";
import { formatFrom, renderEmail, stepDueAt } from "./email";
import { interpolate } from "./engine/matcher";

export type EmailSettings = {
  apiKey: string;
  fromEmail: string;
  fromName: string;
  address: string;
};

export async function getEmailSettings(
  workspaceId: string,
): Promise<EmailSettings | null> {
  const [row] = await db
    .select()
    .from(integrations)
    .where(
      and(
        eq(integrations.workspaceId, workspaceId),
        eq(integrations.provider, "resend"),
      ),
    )
    .limit(1);
  if (
    !row ||
    row.status !== "connected" ||
    !row.secretEnc ||
    !row.config?.fromEmail
  )
    return null;
  return {
    apiKey: decrypt(row.secretEnc),
    fromEmail: row.config.fromEmail,
    fromName: row.config.fromName ?? "",
    address: row.config.address ?? "",
  };
}

export class EmailSendError extends Error {}

/** Sends one email through Resend's API. Throws EmailSendError with Resend's message on failure. */
export async function sendViaResend(opts: {
  apiKey: string;
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  oneClickUrl?: string;
}) {
  let res: Response;
  try {
    res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${opts.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: opts.from,
        to: [opts.to],
        subject: opts.subject,
        html: opts.html,
        text: opts.text,
        headers: opts.oneClickUrl
          ? {
              "List-Unsubscribe": `<${opts.oneClickUrl}>`,
              "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
            }
          : undefined,
      }),
    });
  } catch (e) {
    throw new EmailSendError(
      `Couldn't reach the email service (${e instanceof Error ? e.message : String(e)})`,
    );
  }
  const data = (await res.json().catch(() => ({}))) as {
    id?: string;
    message?: string;
  };
  if (!res.ok || !data.id)
    throw new EmailSendError(
      data.message || `Email service error (${res.status})`,
    );
  return data.id;
}

export function unsubscribeUrl(workspaceId: string, contactId: string) {
  return `${appUrl()}/unsubscribe?t=${encodeURIComponent(signState({ ws: workspaceId, c: contactId }, 3 * 365 * 24 * 3600))}`;
}

/** One-click (RFC 8058) endpoint used in the List-Unsubscribe header. */
export function oneClickUnsubscribeUrl(workspaceId: string, contactId: string) {
  return `${appUrl()}/api/email/unsubscribe?t=${encodeURIComponent(signState({ ws: workspaceId, c: contactId }, 3 * 365 * 24 * 3600))}`;
}

export async function unsubscribeContact(t: string | null | undefined) {
  const tok = readUnsubscribeToken(t);
  if (!tok) return false;
  const [c] = await db
    .update(contacts)
    .set({ emailOptedOut: true, updatedAt: new Date() })
    .where(and(eq(contacts.id, tok.c), eq(contacts.workspaceId, tok.ws)))
    .returning({ id: contacts.id });
  if (c) {
    await db
      .update(emailEnrollments)
      .set({
        status: "stopped",
        lastError: "Contact unsubscribed",
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(emailEnrollments.contactId, c.id),
          eq(emailEnrollments.status, "active"),
        ),
      );
    await logActivity(
      tok.ws,
      c.id,
      "email_unsubscribed",
      "Unsubscribed from emails",
    );
  }
  return !!c;
}

export function readUnsubscribeToken(t: string | null | undefined) {
  if (!t) return null;
  try {
    return verifyState<{ ws: string; c: string }>(t);
  } catch {
    return null;
  }
}

/** Starts every active sequence that matches this event for the contact, and sends any first email that has no delay. */
export async function enrollContact(
  workspaceId: string,
  contactId: string,
  trigger: "form_submitted" | "booking_created",
  pageId?: string | null,
) {
  const seqs = await db
    .select()
    .from(emailSequences)
    .where(
      and(
        eq(emailSequences.workspaceId, workspaceId),
        eq(emailSequences.active, true),
        eq(emailSequences.trigger, trigger),
      ),
    );
  for (const s of seqs) {
    if (trigger === "form_submitted" && s.pageId && s.pageId !== pageId)
      continue;
    if (s.steps.length === 0) continue;
    const [e] = await db
      .insert(emailEnrollments)
      .values({
        workspaceId,
        sequenceId: s.id,
        contactId,
        nextStep: 0,
        nextAt: stepDueAt(s.steps, 0, new Date()),
      })
      .onConflictDoNothing()
      .returning();
    if (e && e.nextAt && e.nextAt.getTime() <= Date.now())
      await processEnrollment(e.id).catch(() => undefined);
  }
}

/** Sends the next due email for one enrollment. Claims it first so two runs never send the same email. */
export async function processEnrollment(enrollmentId: string) {
  const [e] = await db
    .update(emailEnrollments)
    .set({ nextAt: null, updatedAt: new Date() })
    .where(
      and(
        eq(emailEnrollments.id, enrollmentId),
        eq(emailEnrollments.status, "active"),
        isNotNull(emailEnrollments.nextAt),
        lte(emailEnrollments.nextAt, new Date()),
      ),
    )
    .returning();
  if (!e) return;
  const finish = (status: string, lastError: string | null = null) =>
    db
      .update(emailEnrollments)
      .set({ status, lastError, updatedAt: new Date() })
      .where(eq(emailEnrollments.id, e.id));

  const [seq] = await db
    .select()
    .from(emailSequences)
    .where(eq(emailSequences.id, e.sequenceId))
    .limit(1);
  const [contact] = await db
    .select()
    .from(contacts)
    .where(eq(contacts.id, e.contactId))
    .limit(1);
  if (!seq || !contact) return finish("stopped");
  if (!seq.active) return finish("stopped", "Sequence was turned off");
  if (!contact.email) return finish("stopped", "Contact has no email address");
  if (contact.emailOptedOut) return finish("stopped", "Contact unsubscribed");
  const step = seq.steps[e.nextStep];
  if (!step) return finish("completed");

  const settings = await getEmailSettings(e.workspaceId);
  if (!settings) return finish("failed", "Email service is not connected");
  const [ws] = await db
    .select({ name: workspaces.name })
    .from(workspaces)
    .where(eq(workspaces.id, e.workspaceId))
    .limit(1);

  const vars: Record<string, string> = {
    name: contact.name,
    first_name: contact.name.split(" ")[0] ?? "",
  };
  if ((step.subject + step.body).includes("{{booking_link}}"))
    vars.booking_link = await bookingLinkFor(e.workspaceId, contact.id);
  const subject = interpolate(step.subject, vars);
  const unsub = unsubscribeUrl(e.workspaceId, contact.id);
  const { html, text } = renderEmail({
    body: interpolate(step.body, vars),
    businessName: settings.fromName || ws?.name || "",
    address: settings.address,
    unsubscribeUrl: unsub,
  });

  try {
    const providerId = await sendViaResend({
      apiKey: settings.apiKey,
      from: formatFrom(settings.fromName || ws?.name || "", settings.fromEmail),
      to: contact.email,
      subject,
      html,
      text,
      oneClickUrl: oneClickUnsubscribeUrl(e.workspaceId, contact.id),
    });
    await db
      .insert(emailMessages)
      .values({
        workspaceId: e.workspaceId,
        contactId: contact.id,
        sequenceId: seq.id,
        toEmail: contact.email,
        subject,
        status: "sent",
        providerId,
      });
    await logActivity(
      e.workspaceId,
      contact.id,
      "email_sent",
      `Email sent: "${subject}"`,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await db
      .insert(emailMessages)
      .values({
        workspaceId: e.workspaceId,
        contactId: contact.id,
        sequenceId: seq.id,
        toEmail: contact.email,
        subject,
        status: "failed",
        error: msg,
      });
    return finish("failed", msg);
  }

  const next = e.nextStep + 1;
  if (next >= seq.steps.length) return finish("completed");
  await db
    .update(emailEnrollments)
    .set({
      nextStep: next,
      nextAt: stepDueAt(seq.steps, next, new Date()),
      updatedAt: new Date(),
    })
    .where(eq(emailEnrollments.id, e.id));
}

export async function processDueEmails(limit = 100) {
  const due = await db
    .select({ id: emailEnrollments.id })
    .from(emailEnrollments)
    .where(
      and(
        eq(emailEnrollments.status, "active"),
        lte(emailEnrollments.nextAt, new Date()),
      ),
    )
    .orderBy(emailEnrollments.nextAt)
    .limit(limit);
  for (const d of due) await processEnrollment(d.id).catch(() => undefined);
  return { emailsProcessed: due.length };
}

export async function sequenceStats(seq: EmailSequence) {
  const rows = await db
    .select({ status: emailEnrollments.status, n: sql<number>`count(*)::int` })
    .from(emailEnrollments)
    .where(eq(emailEnrollments.sequenceId, seq.id))
    .groupBy(emailEnrollments.status);
  return Object.fromEntries(rows.map((r) => [r.status, r.n])) as Record<
    string,
    number
  >;
}
