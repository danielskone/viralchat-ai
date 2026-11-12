import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { AuthForm } from "../auth-form";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  if (await getCurrentUser()) redirect("/dashboard");
  const { next } = await searchParams;
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
      <p className="mb-6 mt-1 text-sm text-muted-foreground">Sign in to your ViralChat AI workspace.</p>
      <AuthForm mode="login" next={typeof next === "string" ? next : undefined} />
    </>
  );
}
