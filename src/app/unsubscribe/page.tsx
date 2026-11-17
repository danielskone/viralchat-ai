import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { workspaces } from "@/db/schema";
import { readUnsubscribeToken, unsubscribeContact } from "@/lib/email-server";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/logo";

export const dynamic = "force-dynamic";
export const metadata = { title: "Unsubscribe", robots: { index: false } };

async function unsubscribe(form: FormData) {
  "use server";
  const ok = await unsubscribeContact(String(form.get("t") ?? ""));
  redirect(ok ? "/unsubscribe?done=1" : "/unsubscribe");
}

export default async function UnsubscribePage({ searchParams }: { searchParams: Promise<{ t?: string; done?: string }> }) {
  const { t, done } = await searchParams;
  const tok = readUnsubscribeToken(t);
  const [ws] = tok ? await db.select({ name: workspaces.name }).from(workspaces).where(eq(workspaces.id, tok.ws)).limit(1) : [];
  // The button posts back here; a link scanner opening the page never unsubscribes anyone.
  return (
    <div className="min-h-screen bg-muted/30 px-4 py-16">
      <div className="mx-auto max-w-md rounded-2xl border bg-card p-8 text-center shadow-sm">
        {done ? (
          <div className="flex flex-col gap-2">
            <h1 className="text-xl font-semibold">You&apos;re unsubscribed</h1>
            <p className="text-sm text-muted-foreground">You won&apos;t get any more follow-up emails.</p>
          </div>
        ) : !tok || !ws ? (
          <p>This unsubscribe link isn&apos;t valid.</p>
        ) : (
          <form action={unsubscribe} className="flex flex-col items-center gap-4">
            <input type="hidden" name="t" value={t} />
            <h1 className="text-xl font-semibold">Unsubscribe from {ws.name}?</h1>
            <p className="text-sm text-muted-foreground">You&apos;ll stop getting follow-up emails from {ws.name}.</p>
            <UnsubButton />
          </form>
        )}
      </div>
      <div className="mt-6 flex justify-center opacity-70"><Logo /></div>
    </div>
  );
}

function UnsubButton() {
  return <Button type="submit" variant="outline">Unsubscribe</Button>;
}
