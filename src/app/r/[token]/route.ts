import { NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { automationRuns, automations } from "@/db/schema";
import { verifyState } from "@/lib/crypto";
import { logActivity } from "@/lib/audit";
import { normalizeUrl } from "@/lib/comment-flow";

/** Tracked link from a Comment-to-DM message: records the tap, then sends the person on to the real link. */
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const data = verifyState<{ r: string; i: string }>(token);
  const fallback = new URL("/", req.url);
  if (!data) return NextResponse.redirect(fallback);
  const [row] = await db
    .select({ run: automationRuns, quick: automations.quick })
    .from(automationRuns)
    .innerJoin(automations, eq(automations.id, automationRuns.automationId))
    .where(eq(automationRuns.id, data.r))
    .limit(1);
  const link = row?.quick?.link.links[Number(data.i)];
  if (!row || !link) return NextResponse.redirect(fallback);

  if (!(row.run.context as { linkClicked?: boolean }).linkClicked) {
    await db
      .update(automationRuns)
      .set({
        context: sql`jsonb_set(${automationRuns.context} || '{"linkClicked":true}'::jsonb, '{q,clicked}', 'true'::jsonb, true)`,
      })
      .where(eq(automationRuns.id, row.run.id));
    if (row.run.contactId && !row.run.isTest) await logActivity(row.run.workspaceId, row.run.contactId, "link_clicked", `Tapped “${link.label}”`);
  }
  return NextResponse.redirect(normalizeUrl(link.url), 302);
}
