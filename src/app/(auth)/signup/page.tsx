import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { AuthForm } from "../auth-form";

export const metadata = { title: "Create account" };

export default async function SignupPage({ searchParams }: PageProps<"/signup">) {
  const { invite } = await searchParams;
  if (await getCurrentUser()) redirect(typeof invite === "string" ? `/invite/${invite}` : "/onboarding");
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Start automating conversations</h1>
      <p className="mb-6 mt-1 text-sm text-muted-foreground">Free plan, no credit card needed.</p>
      <AuthForm mode="signup" invite={typeof invite === "string" ? invite : undefined} />
    </>
  );
}
