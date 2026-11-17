"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { broadcastRecipients, broadcasts, contacts, type BroadcastAudience } from "@/db/schema";
import { requireWorkspace } from "@/lib/auth";
import { audit, logActivity } from "@/lib/audit";
import { BROADCAST_MAX } from "@/lib/broadcast";
import { audienceFor } from "@/lib/broadcast-server";
import { bookingLinkFor } from "@/lib/booking-server";
import { interpolate } from "@/lib/engine/matcher";
import { sendMessage } from "@/lib/messaging";

export type BroadcastFormState = { error?: string; ok?: string } | undefined;

export async function createBroadcast() {
  const ctx = await requireWorkspace("admin");
  const [b] = await db
    .insert(broadcasts)
    .values({ workspaceId: ctx.workspace.id, name: "New broadcast", message: "Hi {{first_name}}! ", createdBy: ctx.user.id })
    .returning({ id: broadcasts.id });
  redirect(`/broadcasts/${b!.id}`);
}

function readAudience(form: FormData): BroadcastAudience {
  const ch = String(form.get("channel") ?? "all");
  return {
    channel: ch === "instagram" || ch === "messenger" ? ch : "all",
    tag: String(form.get("tag") ?? "").trim().slice(0, 40) || null,
    stage: String(form.get("stage") ?? "").trim().slice(0, 40) || null,
  };
}

export async function saveBroadcast(_: BroadcastFormState, form: FormData): Promise<BroadcastFormState> {
  const ctx = await requireWorkspace("admin");
  const id = String(form.get("id") ?? "");
  const message = String(form.get("message") ?? "").trim().slice(0, 1000);
  if (!message) return { error: "Write a message first." };
  const [b] = await db
    .update(broadcasts)
    .set({ name: String(form.get("name") ?? "").trim().slice(0, 120) || "Broadcast", message, audience: readAudience(form), updatedAt: new Date() })
    .where(and(eq(broadcasts.id, id), eq(broadcasts.workspaceId, ctx.workspace.id), eq(broadcasts.status, "draft")))
    .returning({ id: broadcasts.id });
  if (!b) return { error: "This broadcast was already sent, so it can't be changed." };
  revalidatePath(`/broadcasts/${id}`);
  return { ok: "Saved. The audience count below is updated." };
}

export async function deleteBroadcast(form: FormData) {
  const ctx = await requireWorkspace("admin");
  const id = String(form.get("id") ?? "");
  await db.delete(broadcasts).where(and(eq(broadcasts.id, id), eq(broadcasts.workspaceId, ctx.workspace.id), eq(broadcasts.status, "draft")));
  revalidatePath("/broadcasts");
  redirect("/broadcasts");
}

export async function sendBroadcast(_: BroadcastFormState, form: FormData): Promise<BroadcastFormState> {
  const ctx = await requireWorkspace("admin");
  const id = String(form.get("id") ?? "");
  // Lock: only one request can move a draft to "sending", so a double click never double-sends.
  const [b] = await db
    .update(broadcasts)
    .set({ status: "sending", updatedAt: new Date() })
    .where(and(eq(broadcasts.id, id), eq(broadcasts.workspaceId, ctx.workspace.id), eq(broadcasts.status, "draft")))
    .returning();
  if (!b) return { error: "This broadcast was already sent." };
  if (!b.message.trim()) {
    await db.update(broadcasts).set({ status: "draft" }).where(eq(broadcasts.id, b.id));
    return { error: "Write a message first." };
  }

  const { eligible } = await audienceFor(ctx.workspace.id, b.audience);
  const list = eligible.slice(0, BROADCAST_MAX);
  let sent = 0;
  let failed = 0;
  const sendOne = async (r: (typeof list)[number]) => {
    const [c] = await db.select({ name: contacts.name }).from(contacts).where(eq(contacts.id, r.contactId)).limit(1);
    const name = c?.name ?? "";
    const vars: Record<string, string> = { name, first_name: name.split(" ")[0] ?? "" };
    if (b.message.includes("{{booking_link}}")) vars.booking_link = await bookingLinkFor(ctx.workspace.id, r.contactId);
    const res = await sendMessage({ conversationId: r.conversationId, workspaceId: ctx.workspace.id, text: interpolate(b.message, vars), senderType: "automation" }).catch(
      (e: unknown) => ({ ok: false, error: e instanceof Error ? e.message : String(e) }),
    );
    if (res.ok) sent++;
    else failed++;
    await db
      .insert(broadcastRecipients)
      .values({ broadcastId: b.id, conversationId: r.conversationId, contactId: r.contactId, status: res.ok ? "sent" : "failed", error: res.ok ? null : (res.error ?? null) })
      .onConflictDoNothing();
    if (res.ok) await logActivity(ctx.workspace.id, r.contactId, "broadcast", `Received broadcast "${b.name}"`);
  };
  // Small batches keep us well under Meta's rate limits.
  for (let i = 0; i < list.length; i += 5) await Promise.all(list.slice(i, i + 5).map(sendOne));

  await db.update(broadcasts).set({ status: "sent", sentCount: sent, failedCount: failed, sentAt: new Date(), updatedAt: new Date() }).where(eq(broadcasts.id, b.id));
  await audit(ctx.workspace.id, ctx.user.id, "broadcast.send", b.id, { sent, failed });
  revalidatePath("/broadcasts");
  revalidatePath(`/broadcasts/${b.id}`);
  return { ok: `Sent to ${sent} ${sent === 1 ? "person" : "people"}${failed ? `, ${failed} failed` : ""}.` };
}
