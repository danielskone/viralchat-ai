import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { and, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import { memberships, sessions, users, workspaces, type Role, type User, type Workspace } from "@/db/schema";
import { randomToken, sha256 } from "./crypto";

const SESSION_COOKIE = "vc_session";
const WORKSPACE_COOKIE = "vc_ws";
const SESSION_DAYS = 30;

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export async function createSession(userId: string) {
  const token = randomToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400_000);
  await db.insert(sessions).values({ id: sha256(token), userId, expiresAt });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await db.delete(sessions).where(eq(sessions.id, sha256(token)));
  jar.delete(SESSION_COOKIE);
  jar.delete(WORKSPACE_COOKIE);
}

export const getCurrentUser = cache(async (): Promise<Omit<User, "passwordHash"> | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const rows = await db
    .select({ id: users.id, email: users.email, name: users.name, createdAt: users.createdAt })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, sha256(token)), gt(sessions.expiresAt, new Date())))
    .limit(1);
  return rows[0] ?? null;
});

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export type WorkspaceContext = {
  user: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;
  workspace: Workspace;
  role: Role;
  workspaces: { id: string; name: string; role: Role }[];
};

export const getWorkspaceContext = cache(async (): Promise<WorkspaceContext | null> => {
  const user = await getCurrentUser();
  if (!user) return null;
  const rows = await db
    .select({ workspace: workspaces, role: memberships.role })
    .from(memberships)
    .innerJoin(workspaces, eq(workspaces.id, memberships.workspaceId))
    .where(eq(memberships.userId, user.id))
    .orderBy(workspaces.createdAt);
  if (rows.length === 0) return null;
  const preferred = (await cookies()).get(WORKSPACE_COOKIE)?.value;
  const current = rows.find((r) => r.workspace.id === preferred) ?? rows[0]!;
  return {
    user,
    workspace: current.workspace,
    role: current.role,
    workspaces: rows.map((r) => ({ id: r.workspace.id, name: r.workspace.name, role: r.role })),
  };
});

/** Every workspace-scoped page/action goes through this; data access must filter by ctx.workspace.id. */
export async function requireWorkspace(minRole: Role = "staff"): Promise<WorkspaceContext> {
  const user = await requireUser();
  const ctx = await getWorkspaceContext();
  if (!ctx) redirect("/onboarding");
  if (!hasRole(ctx.role, minRole)) {
    throw new Error(`Forbidden: requires ${minRole} role (user ${user.id} is ${ctx.role})`);
  }
  return ctx;
}

const RANK: Record<Role, number> = { staff: 1, admin: 2, owner: 3 };
export function hasRole(role: Role, min: Role) {
  return RANK[role] >= RANK[min];
}

export async function setCurrentWorkspace(workspaceId: string) {
  const user = await requireUser();
  const m = await db
    .select()
    .from(memberships)
    .where(and(eq(memberships.userId, user.id), eq(memberships.workspaceId, workspaceId)))
    .limit(1);
  if (!m[0]) throw new Error("Not a member of that workspace");
  (await cookies()).set(WORKSPACE_COOKIE, workspaceId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 365 * 86400,
  });
}
