import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { automations, chatbots, integrations } from "@/db/schema";
import { requireWorkspace, hasRole } from "@/lib/auth";
import { recentRuns } from "@/lib/actions/automations";
import { Builder } from "./builder";
import { QuickBuilder } from "./quick-builder";

export default async function AutomationPage({ params }: PageProps<"/automations/[id]">) {
  const ctx = await requireWorkspace();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [a] = await db.select().from(automations).where(and(eq(automations.id, id), eq(automations.workspaceId, ctx.workspace.id))).limit(1);
  if (!a) notFound();
  const [[meta], [bot], runs] = await Promise.all([
    db.select().from(integrations).where(and(eq(integrations.workspaceId, ctx.workspace.id), eq(integrations.provider, "meta"))).limit(1),
    db.select().from(chatbots).where(eq(chatbots.workspaceId, ctx.workspace.id)).limit(1),
    recentRuns(id),
  ]);
  const serialized = { ...a, createdAt: a.createdAt.toISOString(), updatedAt: a.updatedAt.toISOString() };
  if (a.quick) return <QuickBuilder automation={serialized} metaConnected={meta?.status === "connected"} canDelete={hasRole(ctx.role, "admin")} />;
  return (
    <Builder
      automation={{ ...a, createdAt: a.createdAt.toISOString(), updatedAt: a.updatedAt.toISOString() }}
      metaConnected={meta?.status === "connected"}
      aiEnabled={Boolean(bot)}
      canDelete={hasRole(ctx.role, "admin")}
      runs={runs.map((r) => ({ id: r.id, status: r.status, error: r.error, startedAt: r.startedAt.toISOString(), log: r.log, contactId: r.contactId }))}
    />
  );
}
