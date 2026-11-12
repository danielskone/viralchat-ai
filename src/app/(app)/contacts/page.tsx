import Link from "next/link";
import { and, desc, eq, ilike, ne, or, sql, type SQL } from "drizzle-orm";
import { Download, Users, Search } from "lucide-react";
import { db } from "@/db";
import { contacts } from "@/db/schema";
import { requireWorkspace } from "@/lib/auth";
import { Avatar, Badge, Card, EmptyState, Input, PageHeader, Select } from "@/components/ui/primitives";
import { Button, buttonVariants } from "@/components/ui/button";
import { STAGES, stageLabel, timeAgo } from "@/lib/utils";
import { NewContactForm, ImportForm } from "./forms";
import { bulkTag } from "@/lib/actions/contacts";

export const metadata = { title: "Contacts" };
const PAGE_SIZE = 50;

export default async function ContactsPage({ searchParams }: PageProps<"/contacts">) {
  const ctx = await requireWorkspace();
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const tag = typeof sp.tag === "string" ? sp.tag : "";
  const stage = typeof sp.stage === "string" ? sp.stage : "";
  const temperature = typeof sp.temperature === "string" ? sp.temperature : "";
  const source = typeof sp.source === "string" ? sp.source : "";
  const page = Math.max(1, Number(sp.page ?? 1) || 1);

  const where: SQL[] = [eq(contacts.workspaceId, ctx.workspace.id), ne(contacts.source, "test")];
  if (q) where.push(or(ilike(contacts.name, `%${q}%`), ilike(contacts.email, `%${q}%`), ilike(contacts.phone, `%${q}%`), ilike(contacts.instagramUsername, `%${q}%`))!);
  if (tag) where.push(sql`${tag} = any(${contacts.tags})`);
  if (stage) where.push(eq(contacts.stage, stage));
  if (temperature === "hot" || temperature === "warm" || temperature === "cold") where.push(eq(contacts.temperature, temperature));
  if (source) where.push(eq(contacts.source, source));

  const [rows, totalRows, allTags] = await Promise.all([
    db.select().from(contacts).where(and(...where)).orderBy(desc(contacts.lastActivityAt)).limit(PAGE_SIZE).offset((page - 1) * PAGE_SIZE),
    db.select({ total: sql<number>`count(*)`.mapWith(Number).as("total") }).from(contacts).where(and(...where)),
    db.execute<{ tag: string }>(sql`select distinct unnest(tags) as tag from contacts where workspace_id = ${ctx.workspace.id} order by 1 limit 200`),
  ]);
  const total = totalRows[0]?.total ?? 0;
  const qs = new URLSearchParams(Object.entries({ q, tag, stage, temperature, source }).filter(([, v]) => v) as [string, string][]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <PageHeader
        title="Contacts"
        description={`${total.toLocaleString()} contact${total === 1 ? "" : "s"} in ${ctx.workspace.name}`}
        actions={
          <>
            <a href={`/api/contacts/export?${qs}`} className={buttonVariants({ variant: "outline" })}><Download /> Export CSV</a>
            <ImportForm />
            <NewContactForm />
          </>
        }
      />
      <form className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-6" role="search">
        <div className="relative lg:col-span-2">
          <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
          <Input name="q" defaultValue={q} placeholder="Search name, email, phone, @username" className="pl-9" aria-label="Search contacts" />
        </div>
        <Select name="tag" defaultValue={tag} aria-label="Tag">
          <option value="">All tags</option>
          {Array.from(allTags).map((t) => <option key={t.tag} value={t.tag}>{t.tag}</option>)}
        </Select>
        <Select name="stage" defaultValue={stage} aria-label="Stage">
          <option value="">All stages</option>
          {STAGES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </Select>
        <Select name="temperature" defaultValue={temperature} aria-label="Lead temperature">
          <option value="">Any temperature</option>
          <option value="hot">Hot</option>
          <option value="warm">Warm</option>
          <option value="cold">Cold</option>
        </Select>
        <div className="flex gap-2">
          <Select name="source" defaultValue={source} aria-label="Source">
            <option value="">Any source</option>
            {["instagram", "messenger", "manual", "import", "demo"].map((s) => <option key={s} value={s}>{s}</option>)}
          </Select>
          <Button type="submit" variant="secondary">Filter</Button>
        </div>
      </form>

      {rows.length === 0 ? (
        <EmptyState
          icon={<Users />}
          title={q || tag || stage || temperature || source ? "No contacts match these filters" : "No contacts yet"}
          description="Contacts are created automatically when people DM or comment on your connected accounts. You can also add or import them."
        />
      ) : (
        <form action={bulkTag}>
          <Card className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="w-8 p-3"><span className="sr-only">Select</span></th>
                  <th className="p-3">Contact</th>
                  <th className="hidden p-3 md:table-cell">Tags</th>
                  <th className="p-3">Stage</th>
                  <th className="p-3">Score</th>
                  <th className="hidden p-3 lg:table-cell">Source</th>
                  <th className="hidden p-3 sm:table-cell">Last activity</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id} className="border-b last:border-0 hover:bg-muted/50">
                    <td className="p-3"><input type="checkbox" name="ids" value={c.id} aria-label={`Select ${c.name}`} /></td>
                    <td className="p-3">
                      <Link href={`/contacts/${c.id}`} className="flex items-center gap-3">
                        <Avatar name={c.name} src={c.avatarUrl} className="size-8" />
                        <div className="min-w-0">
                          <p className="truncate font-medium">
                            {c.name} {c.isDemo && <Badge tone="warning">Demo</Badge>}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">{c.email ?? (c.instagramUsername ? `@${c.instagramUsername}` : c.phone ?? "")}</p>
                        </div>
                      </Link>
                    </td>
                    <td className="hidden p-3 md:table-cell">
                      <div className="flex max-w-56 flex-wrap gap-1">
                        {c.tags.slice(0, 3).map((t) => <Badge key={t} tone="primary">{t}</Badge>)}
                        {c.tags.length > 3 && <Badge>+{c.tags.length - 3}</Badge>}
                      </div>
                    </td>
                    <td className="p-3 whitespace-nowrap">{stageLabel(c.stage)}</td>
                    <td className="p-3">
                      <Badge tone={c.temperature === "hot" ? "danger" : c.temperature === "warm" ? "warning" : "default"}>
                        {c.leadScore} · {c.temperature}
                      </Badge>
                    </td>
                    <td className="hidden p-3 capitalize lg:table-cell">{c.source}</td>
                    <td className="hidden p-3 text-muted-foreground sm:table-cell">{timeAgo(c.lastActivityAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Input name="tag" placeholder="Tag selected…" className="w-44" aria-label="Tag to add to selected contacts" />
              <Button type="submit" variant="outline" size="sm">Apply tag</Button>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              Page {page} of {pages}
              {page > 1 && <Link className={buttonVariants({ variant: "outline", size: "sm" })} href={`/contacts?${qs}&page=${page - 1}`}>Previous</Link>}
              {page < pages && <Link className={buttonVariants({ variant: "outline", size: "sm" })} href={`/contacts?${qs}&page=${page + 1}`}>Next</Link>}
            </div>
          </div>
        </form>
      )}
    </>
  );
}
