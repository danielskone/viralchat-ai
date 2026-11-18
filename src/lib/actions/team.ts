"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, count, eq, gt, isNull } from "drizzle-orm";
import { db } from "@/db";
import { invitations, memberships, users, workspaces } from "@/db/schema";
import { requireUser, requireWorkspace, setCurrentWorkspace } from "@/lib/auth";
import { randomToken, sha256 } from "@/lib/crypto";
import { workspacePlan } from "@/lib/plans";
import { audit } from "@/lib/audit";

export type InviteState = { error?: string; link?: string } | undefined;

export async function inviteMember(_: InviteState, form: FormData): Promise<InviteState> {
  const ctx = await requireWorkspace("admin");
  const parsed = z.object({ email: z.email(), role: z.enum(["admin", "staff"]) }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: "Enter a valid email and role" };
  const [{ n }] = (await db.select({ n: count() }).from(memberships).where(eq(memberships.workspaceId, ctx.workspace.id))) as [{ n: number }];
  const limit = workspacePlan(ctx.workspace).limits.members;
  if (n >= limit) return { error: `Your plan includes ${limit} team member${limit === 1 ? "" : "s"}. Upgrade on the Billing page to invite more.` };
  const email = parsed.data.email.toLowerCase();
  const [existing] = await db
    .select()
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(and(eq(memberships.workspaceId, ctx.workspace.id), eq(users.email, email)))
    .limit(1);
  if (existing) return { error: "That person is already a member." };
  const token = randomToken();
  await db.insert(invitations).values({
    workspaceId: ctx.workspace.id,
    email,
    role: parsed.data.role,
    tokenHash: sha256(token),
    invitedBy: ctx.user.id,
    expiresAt: new Date(Date.now() + 7 * 86400_000),
  });
  await audit(ctx.workspace.id, ctx.user.id, "team.invite", email, { role: parsed.data.role });
  revalidatePath("/team");
  return { link: `${process.env.APP_URL ?? ""}/invite/${token}` };
}

export async function revokeInvite(form: FormData) {
  const ctx = await requireWorkspace("admin");
  await db.delete(invitations).where(and(eq(invitations.id, String(form.get("id"))), eq(invitations.workspaceId, ctx.workspace.id)));
  revalidatePath("/team");
}

export async function changeRole(form: FormData) {
  const ctx = await requireWorkspace("owner");
  const userId = String(form.get("userId"));
  const role = z.enum(["owner", "admin", "staff"]).parse(form.get("role"));
  if (userId === ctx.user.id) throw new Error("You can't change your own role");
  await db.update(memberships).set({ role }).where(and(eq(memberships.workspaceId, ctx.workspace.id), eq(memberships.userId, userId)));
  await audit(ctx.workspace.id, ctx.user.id, "team.role_change", userId, { role });
  revalidatePath("/team");
}

export async function removeMember(form: FormData) {
  const ctx = await requireWorkspace("admin");
  const userId = String(form.get("userId"));
  if (userId === ctx.user.id) throw new Error("Use “Leave workspace” to remove yourself");
  const [target] = await db.select().from(memberships).where(and(eq(memberships.workspaceId, ctx.workspace.id), eq(memberships.userId, userId))).limit(1);
  if (target?.role === "owner" && ctx.role !== "owner") throw new Error("Only an owner can remove an owner");
  await db.delete(memberships).where(and(eq(memberships.workspaceId, ctx.workspace.id), eq(memberships.userId, userId)));
  await audit(ctx.workspace.id, ctx.user.id, "team.remove", userId);
  revalidatePath("/team");
}

export async function acceptInvite(form: FormData) {
  const user = await requireUser();
  const token = String(form.get("token"));
  const [inv] = await db
    .select()
    .from(invitations)
    .where(and(eq(invitations.tokenHash, sha256(token)), isNull(invitations.acceptedAt), gt(invitations.expiresAt, new Date())))
    .limit(1);
  if (!inv) redirect("/dashboard");
  if (inv.email !== user.email.toLowerCase()) throw new Error("This invitation was sent to a different email address");
  const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, inv.workspaceId)).limit(1);
  if (!ws) redirect("/dashboard");
  await db.insert(memberships).values({ workspaceId: inv.workspaceId, userId: user.id, role: inv.role }).onConflictDoNothing();
  await db.update(invitations).set({ acceptedAt: new Date() }).where(eq(invitations.id, inv.id));
  await setCurrentWorkspace(inv.workspaceId);
  await audit(inv.workspaceId, user.id, "team.join");
  redirect("/dashboard");
}
