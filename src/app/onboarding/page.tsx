import { redirect } from "next/navigation";
import { requireUser, getWorkspaceContext } from "@/lib/auth";
import { Logo } from "@/components/logo";
import { Card, CardContent } from "@/components/ui/primitives";
import { OnboardingForm } from "./form";

export const metadata = { title: "Set up your workspace" };

export default async function OnboardingPage({ searchParams }: PageProps<"/onboarding">) {
  const user = await requireUser();
  const { new: isNew } = await searchParams;
  const ctx = await getWorkspaceContext();
  if (ctx && !isNew) redirect("/dashboard");
  return (
    <div className="mx-auto flex min-h-screen max-w-xl flex-col px-4 py-10">
      <Logo />
      <div className="mt-10">
        <p className="text-sm font-medium text-primary">Step 1 of 3 · Your business</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Welcome, {user.name.split(" ")[0]} 👋</h1>
        <p className="mt-2 text-muted-foreground">
          Tell us about your business. Next you’ll connect Instagram & Messenger and pick your first automation.
        </p>
      </div>
      <Card className="mt-8">
        <CardContent className="pt-6">
          <OnboardingForm />
        </CardContent>
      </Card>
    </div>
  );
}
