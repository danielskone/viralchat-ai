import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { PanelsTopLeft, Plus } from "lucide-react";
import { db } from "@/db";
import { landingPages } from "@/db/schema";
import { hasRole, requireWorkspace } from "@/lib/auth";
import { createLandingPage } from "@/lib/actions/landing";
import { Badge, Card, CardContent, EmptyState, PageHeader } from "@/components/ui/primitives";
import { SubmitButton } from "@/components/ui/submit-button";

export const metadata = { title: "Landing Pages" };

export default async function LandingPagesList() {
  const ctx = await requireWorkspace();
  const pages = await db.select().from(landingPages).where(eq(landingPages.workspaceId, ctx.workspace.id)).orderBy(desc(landingPages.updatedAt));
  const canEdit = hasRole(ctx.role, "admin");
  const newButton = canEdit ? (
    <form action={createLandingPage}>
      <SubmitButton variant="gradient" pendingText="Creating…"><Plus className="size-4" /> New page</SubmitButton>
    </form>
  ) : null;

  return (
    <>
      <PageHeader title="Landing Pages & Forms" description="Simple pages with a lead form. Every sign-up becomes a contact, and can go straight to your booking page." actions={newButton} />
      {pages.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <EmptyState icon={<PanelsTopLeft className="size-5" />} title="No pages yet" description="Create a page, share its link in your bio, ads or DMs, and collect leads." action={newButton ?? undefined} />
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {pages.map((p) => (
            <Link key={p.id} href={`/pages/${p.id}`} className="rounded-2xl border bg-card p-5 transition hover:shadow-md">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate font-medium">{p.title}</p>
                {p.published ? <Badge tone="success">Live</Badge> : <Badge>Draft</Badge>}
              </div>
              <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{p.headline}</p>
              <p className="mt-3 text-sm"><strong>{p.submissions}</strong> <span className="text-muted-foreground">{p.submissions === 1 ? "lead" : "leads"}</span></p>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
