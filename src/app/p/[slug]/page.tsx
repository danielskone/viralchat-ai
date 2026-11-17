import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { landingPages, workspaces } from "@/db/schema";
import { Logo } from "@/components/logo";
import { LeadForm } from "./lead-form";

export const dynamic = "force-dynamic";

async function load(slug: string) {
  const [row] = await db
    .select({ page: landingPages, wsName: workspaces.name })
    .from(landingPages)
    .innerJoin(workspaces, eq(workspaces.id, landingPages.workspaceId))
    .where(eq(landingPages.slug, slug))
    .limit(1);
  return row;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const row = await load(slug);
  if (!row?.page.published) return { title: "Page not available", robots: { index: false } };
  return { title: row.page.headline, description: row.page.subheadline ?? undefined };
}

export default async function PublicLandingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const row = await load(slug);
  if (!row) notFound();
  const { page, wsName } = row;

  return (
    <div className="min-h-screen bg-muted/30 px-4 py-10">
      <div className="mx-auto max-w-xl">
        <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
          {page.published && page.imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={page.imageUrl} alt="" className="max-h-72 w-full object-cover" />
          )}
          <div className="p-6 sm:p-8">
            <p className="text-sm text-muted-foreground">{wsName}</p>
            {page.published ? (
              <>
                <h1 className="mt-1 text-2xl font-semibold sm:text-3xl">{page.headline}</h1>
                {page.subheadline && <p className="mt-2 text-lg text-muted-foreground">{page.subheadline}</p>}
                {page.body && <p className="mt-4 whitespace-pre-line">{page.body}</p>}
                <div className="mt-6">
                  <LeadForm slug={page.slug} phone={page.fields.phone} phoneRequired={page.fields.phoneRequired} message={page.fields.message} buttonText={page.buttonText} />
                </div>
              </>
            ) : (
              <p className="mt-3 rounded-xl border bg-muted/50 p-4 text-sm">This page isn&apos;t available right now.</p>
            )}
          </div>
        </div>
        <div className="mt-6 flex justify-center opacity-70"><Logo /></div>
      </div>
    </div>
  );
}
