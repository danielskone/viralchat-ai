"use server";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { savedReplies } from "@/db/schema";
import { requireWorkspace } from "@/lib/auth";
import { clearDemoData, loadDemoData } from "@/lib/demo";
import { audit } from "@/lib/audit";

export async function enableDemo() {
  const ctx = await requireWorkspace("admin");
  await loadDemoData(ctx.workspace.id);
  await audit(ctx.workspace.id, ctx.user.id, "demo.load");
  revalidatePath("/", "layout");
}

export async function disableDemo() {
  const ctx = await requireWorkspace("admin");
  await clearDemoData(ctx.workspace.id);
  await audit(ctx.workspace.id, ctx.user.id, "demo.clear");
  revalidatePath("/", "layout");
}

export async function deleteSavedReply(form: FormData) {
  const ctx = await requireWorkspace();
  await db.delete(savedReplies).where(and(eq(savedReplies.id, String(form.get("id"))), eq(savedReplies.workspaceId, ctx.workspace.id)));
  revalidatePath("/settings");
}
