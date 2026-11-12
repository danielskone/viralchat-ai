"use server";
import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { chatbots, memberships, workspaces } from "@/db/schema";
import { requireUser, requireWorkspace, setCurrentWorkspace } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { getPlan } from "@/lib/plans";

const schema = z.object({
  name: z.string().trim().min(1, "Enter your business name").max(120),
  businessType: z.string().trim().max(60).optional(),
  website: z.string().trim().max(300).optional(),
  timezone: z.string().trim().max(60).optional(),
});

export type FormState = { error?: string; ok?: string } | undefined;

export async function createWorkspace(_: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = schema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  // Multiple workspaces are a Business+ feature; the first one is always allowed.
  const existing = await db
    .select({ plan: workspaces.plan })
    .from(memberships)
    .innerJoin(workspaces, eq(workspaces.id, memberships.workspaceId))
    .where(eq(memberships.userId, user.id));
  if (existing.length > 0 && !existing.some((w) => ["business", "agency"].includes(w.plan))) {
    return { error: "Multiple workspaces are available on the Business and Agency plans." };
  }

  const ws = await db.transaction(async (tx) => {
    const [ws] = await tx
      .insert(workspaces)
      .values({
        name: parsed.data.name,
        businessType: parsed.data.businessType || null,
        website: parsed.data.website || null,
        timezone: parsed.data.timezone || "UTC",
      })
      .returning();
    await tx.insert(memberships).values({ workspaceId: ws!.id, userId: user.id, role: "owner" });
    await tx.insert(chatbots).values({ workspaceId: ws!.id });
    return ws!;
  });
  await setCurrentWorkspace(ws.id);
  await audit(ws.id, user.id, "workspace.create", ws.id);
  redirect("/dashboard?welcome=1");
}

export async function switchWorkspace(form: FormData) {
  await setCurrentWorkspace(String(form.get("workspaceId")));
  redirect("/dashboard");
}

export async function updateWorkspace(_: FormState, form: FormData): Promise<FormState> {
  const ctx = await requireWorkspace("admin");
  const parsed = schema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  await db
    .update(workspaces)
    .set({
      name: parsed.data.name,
      businessType: parsed.data.businessType || null,
      website: parsed.data.website || null,
      timezone: parsed.data.timezone || "UTC",
    })
    .where(eq(workspaces.id, ctx.workspace.id));
  await audit(ctx.workspace.id, ctx.user.id, "workspace.update");
  revalidatePath("/", "layout");
  return { ok: "Saved" };
}

export async function deleteWorkspace(form: FormData) {
  const ctx = await requireWorkspace("owner");
  if (String(form.get("confirm")) !== ctx.workspace.name) throw new Error("Type the workspace name to confirm");
  await db.delete(workspaces).where(eq(workspaces.id, ctx.workspace.id));
  await audit(null, ctx.user.id, "workspace.delete", ctx.workspace.id);
  redirect("/onboarding");
}

export async function canAddWorkspace() {
  const ctx = await requireWorkspace();
  return ctx.workspaces.length === 0 || getPlan(ctx.workspace.plan).id === "business" || getPlan(ctx.workspace.plan).id === "agency";
}
