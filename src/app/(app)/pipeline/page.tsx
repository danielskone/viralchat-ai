import { and, desc, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { contacts } from "@/db/schema";
import { requireWorkspace } from "@/lib/auth";
import { PageHeader } from "@/components/ui/primitives";
import { Board } from "./board";

export const metadata = { title: "CRM Pipeline" };

export default async function PipelinePage() {
  const ctx = await requireWorkspace();
  const rows = await db
    .select({ id: contacts.id, name: contacts.name, stage: contacts.stage, score: contacts.leadScore, temperature: contacts.temperature, tags: contacts.tags, avatarUrl: contacts.avatarUrl, isDemo: contacts.isDemo })
    .from(contacts)
    .where(and(eq(contacts.workspaceId, ctx.workspace.id), ne(contacts.source, "test")))
    .orderBy(desc(contacts.leadScore))
    .limit(1000);
  return (
    <>
      <PageHeader title="CRM Pipeline" description="Drag contacts between stages. Automations can move contacts too, using the “Set stage” step." />
      <Board initial={rows} />
    </>
  );
}
