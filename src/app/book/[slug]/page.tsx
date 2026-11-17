import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { bookingPages, workspaces } from "@/db/schema";
import { openSlots } from "@/lib/booking-server";
import { Logo } from "@/components/logo";
import { BookingFlow } from "./booking-flow";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [page] = await db.select({ title: bookingPages.title }).from(bookingPages).where(eq(bookingPages.slug, slug)).limit(1);
  return { title: page?.title ?? "Book a time", robots: { index: false } };
}

export default async function PublicBookingPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ c?: string }> }) {
  const { slug } = await params;
  const { c } = await searchParams;
  const [row] = await db
    .select({ page: bookingPages, wsName: workspaces.name })
    .from(bookingPages)
    .innerJoin(workspaces, eq(workspaces.id, bookingPages.workspaceId))
    .where(eq(bookingPages.slug, slug))
    .limit(1);
  if (!row) notFound();
  const { page, wsName } = row;

  return (
    <div className="min-h-screen bg-muted/30 px-4 py-10">
      <div className="mx-auto max-w-2xl">
        <div className="rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
          <p className="text-sm text-muted-foreground">{wsName}</p>
          <h1 className="mt-1 text-2xl font-semibold">{page.title}</h1>
          {page.description && <p className="mt-2 whitespace-pre-line text-muted-foreground">{page.description}</p>}
          <p className="mt-2 text-sm text-muted-foreground">{page.durationMinutes} minutes · times in {page.timezone.replace(/_/g, " ")}</p>
          <div className="mt-6">
            {page.enabled ? (
              <BookingFlow slug={page.slug} timezone={page.timezone} days={await openSlots(page)} contactToken={c ?? ""} />
            ) : (
              <p className="rounded-xl border bg-muted/50 p-4 text-sm">Online booking isn&apos;t available right now. Please message us to set up a time.</p>
            )}
          </div>
        </div>
        <div className="mt-6 flex justify-center opacity-70"><Logo /></div>
      </div>
    </div>
  );
}
