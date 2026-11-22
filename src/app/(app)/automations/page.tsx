import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { Workflow, Plus, Copy, MessageCircleReply } from "lucide-react";
import { db } from "@/db";
import { automations, integrations } from "@/db/schema";
import { requireWorkspace } from "@/lib/auth";
import { Badge, Card, EmptyState, PageHeader, Alert } from "@/components/ui/primitives";
import { Button, buttonVariants } from "@/components/ui/button";
import { createAutomation, createCommentDm, duplicateAutomation } from "@/lib/actions/automations";
import { TRIGGER_LABELS } from "@/lib/node-catalog";
import { timeAgo } from "@/lib/utils";
import { and } from "drizzle-orm";
import { InstagramIcon, MessengerIcon } from "@/components/brand-icons";

export const metadata = { title: "Automations" };

export default async function AutomationsPage() {
  const ctx = await requireWorkspace();
  const [rows, [meta]] = await Promise.all([
    db.select().from(automations).where(eq(automations.workspaceId, ctx.workspace.id)).orderBy(desc(automations.updatedAt)),
    db.select().from(integrations).where(and(eq(integrations.workspaceId, ctx.workspace.id), eq(integrations.provider, "meta"))).limit(1),
  ]);
  return (
    <>
      <PageHeader
        title="Automations"
        description="Keyword triggers and flows that reply, qualify and route conversations for you."
        actions={
          <>
            <Link href="/templates" className={buttonVariants({ variant: "outline" })}>Browse templates</Link>
            <form action={createAutomation}>
              <Button variant="outline"><Plus /> Custom flow</Button>
            </form>
            <form action={createCommentDm}>
              <Button variant="gradient"><MessageCircleReply /> Comment to DM</Button>
            </form>
          </>
        }
      />
      {meta?.status !== "connected" && rows.some((r) => r.status === "active") && (
        <div className="mb-4">
          <Alert tone="warning" title="Active automations won't run until Meta is connected">
            Connect your Instagram professional account and Facebook Page on the <Link href="/integrations" className="underline">Integrations</Link> page.
          </Alert>
        </div>
      )}
      {rows.length === 0 ? (
        <EmptyState
          icon={<Workflow />}
          title="No automations yet"
          description="Start from a proven template like Comment-to-DM, or build your own flow from scratch."
          action={
            <form action={createCommentDm}>
              <Button variant="gradient"><MessageCircleReply /> Set up Comment to DM</Button>
            </form>
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((a) => (
            <Card key={a.id} className="flex flex-col p-5 transition-shadow hover:shadow-md">
              <div className="flex items-start justify-between gap-2">
                <Link href={`/automations/${a.id}`} className="font-semibold hover:underline">{a.name}</Link>
                <Badge tone={a.status === "active" ? "success" : a.status === "paused" ? "warning" : "default"}>{a.status}</Badge>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{a.quick ? "Comment to DM" : TRIGGER_LABELS[a.triggerType]}</p>
              {a.keywords.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1">
                  {a.keywords.slice(0, 5).map((k) => <Badge key={k} tone="primary">{k}</Badge>)}
                </div>
              )}
              <div className="mt-auto flex items-center gap-3 pt-4 text-xs text-muted-foreground">
                {a.channels.includes("instagram") && <InstagramIcon className="size-3.5" aria-label="Instagram" />}
                {a.channels.includes("messenger") && <MessengerIcon className="size-3.5" aria-label="Messenger" />}
                <span>{a.runsCount.toLocaleString()} runs</span>
                <span>· edited {timeAgo(a.updatedAt)}</span>
                <form action={duplicateAutomation} className="ml-auto">
                  <input type="hidden" name="id" value={a.id} />
                  <button className="rounded p-1 hover:bg-muted" aria-label={`Duplicate ${a.name}`} title="Duplicate"><Copy className="size-3.5" /></button>
                </form>
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
