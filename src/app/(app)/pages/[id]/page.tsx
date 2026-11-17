import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { ArrowLeft, ExternalLink, Inbox } from "lucide-react";
import { db } from "@/db";
import { bookingPages, formSubmissions, landingPages } from "@/db/schema";
import { hasRole, requireWorkspace } from "@/lib/auth";
import { appUrl } from "@/lib/booking-server";
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState } from "@/components/ui/primitives";
import { CopyButton } from "../../booking/copy-button";
import { LandingEditor } from "./editor";

export const metadata = { title: "Edit page" };

export default async function LandingPageEditor({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireWorkspace();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [page] = await db.select().from(landingPages).where(and(eq(landingPages.id, id), eq(landingPages.workspaceId, ctx.workspace.id))).limit(1);
  if (!page) notFound();
  const subs = await db.select().from(formSubmissions).where(eq(formSubmissions.pageId, page.id)).orderBy(desc(formSubmissions.createdAt)).limit(50);
  const [bp] = await db.select({ enabled: bookingPages.enabled }).from(bookingPages).where(eq(bookingPages.workspaceId, ctx.workspace.id)).limit(1);
  const url = `${appUrl()}/p/${page.slug}`;
  const fmt = new Intl.DateTimeFormat("en-US", { timeZone: ctx.workspace.timezone || "UTC", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

  return (
    <>
      <Link href="/pages" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> All pages</Link>
      <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Edit page</CardTitle>
            <CardDescription>Change the words, choose the form fields, and decide what happens after someone signs up.</CardDescription>
          </CardHeader>
          <CardContent>
            <LandingEditor page={page} bookingOn={!!bp?.enabled} disabled={!hasRole(ctx.role, "admin")} />
          </CardContent>
        </Card>
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">Page link {page.published ? <Badge tone="success">Live</Badge> : <Badge>Draft</Badge>}</CardTitle>
              <CardDescription>{page.published ? "Put it in your bio, ads, or DMs." : "Turn on Published and save to make this link work."}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-lg border bg-muted/50 px-3 py-2 text-sm">{url}</code>
              <CopyButton text={url} />
              {page.published && (
                <Link href={`/p/${page.slug}`} target="_blank" className="inline-flex h-9 items-center gap-1 rounded-lg border px-3 text-sm hover:bg-muted">
                  Open <ExternalLink className="size-3.5" />
                </Link>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Leads from this page ({page.submissions})</CardTitle>
              <CardDescription>Each one is also saved in Contacts.</CardDescription>
            </CardHeader>
            <CardContent>
              {subs.length === 0 ? (
                <EmptyState icon={<Inbox className="size-5" />} title="No leads yet" description="When someone fills in the form, they show up here." />
              ) : (
                <ul className="divide-y">
                  {subs.map((s) => (
                    <li key={s.id} className="py-3 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        {s.contactId ? <Link href={`/contacts/${s.contactId}`} className="font-medium hover:underline">{s.data.name}</Link> : <span className="font-medium">{s.data.name}</span>}
                        <span className="shrink-0 text-xs text-muted-foreground">{fmt.format(s.createdAt)}</span>
                      </div>
                      <p className="truncate text-muted-foreground">{[s.data.email, s.data.phone].filter(Boolean).join(" · ")}</p>
                      {s.data.message && <p className="mt-1 line-clamp-3">{s.data.message}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
