"use server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { users } from "@/db/schema";
import { createSession, destroySession, hashPassword, verifyPassword } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { rateLimit } from "@/lib/rate-limit";
import { headers } from "next/headers";

export type AuthState = { error?: string } | undefined;

const signupSchema = z.object({
  name: z.string().trim().min(1, "Enter your name").max(100),
  email: z.email("Enter a valid email").transform((e) => e.toLowerCase()),
  password: z.string().min(8, "Password must be at least 8 characters").max(200),
});

async function clientKey(prefix: string) {
  const h = await headers();
  return `${prefix}:${h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local"}`;
}

export async function signup(_: AuthState, form: FormData): Promise<AuthState> {
  if (!rateLimit(await clientKey("signup"), 10, 3600_000)) return { error: "Too many attempts. Try again later." };
  const parsed = signupSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const { name, email, password } = parsed.data;
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (existing) return { error: "An account with this email already exists. Try logging in." };
  const [user] = await db.insert(users).values({ name, email, passwordHash: await hashPassword(password) }).returning();
  await createSession(user!.id);
  await audit(null, user!.id, "user.signup");
  const invite = form.get("invite");
  redirect(typeof invite === "string" && invite ? `/invite/${encodeURIComponent(invite)}` : "/onboarding");
}

export async function login(_: AuthState, form: FormData): Promise<AuthState> {
  if (!rateLimit(await clientKey("login"), 20, 15 * 60_000)) return { error: "Too many attempts. Try again in a few minutes." };
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user || !(await verifyPassword(password, user.passwordHash))) return { error: "Incorrect email or password." };
  await createSession(user.id);
  await audit(null, user.id, "user.login");
  const next = String(form.get("next") ?? "");
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard");
}

export async function logout() {
  await destroySession();
  redirect("/login");
}
