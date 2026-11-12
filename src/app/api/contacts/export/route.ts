import { and, desc, eq, ilike, ne, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { contacts } from "@/db/schema";
import { getWorkspaceContext } from "@/lib/auth";
import { toCsv } from "@/lib/csv";
import { audit } from "@/lib/audit";

export async function GET(req: Request) {
  const ctx = await getWorkspaceContext();
  if (!ctx) return new Response("Unauthorized", { status: 401 });
  const sp = new URL(req.url).searchParams;
  const where: SQL[] = [eq(contacts.workspaceId, ctx.workspace.id), ne(contacts.source, "test")];
  const q = sp.get("q");
  if (q) where.push(or(ilike(contacts.name, `%${q}%`), ilike(contacts.email, `%${q}%`))!);
  if (sp.get("tag")) where.push(sql`${sp.get("tag")} = any(${contacts.tags})`);
  if (sp.get("stage")) where.push(eq(contacts.stage, sp.get("stage")!));
  const t = sp.get("temperature");
  if (t === "hot" || t === "warm" || t === "cold") where.push(eq(contacts.temperature, t));
  if (sp.get("source")) where.push(eq(contacts.source, sp.get("source")!));

  const rows = await db.select().from(contacts).where(and(...where)).orderBy(desc(contacts.createdAt)).limit(100_000);
  const fieldKeys = Array.from(new Set(rows.flatMap((r) => Object.keys(r.customFields ?? {}))));
  const csv = toCsv([
    ["id", "name", "email", "phone", "instagram_username", "source", "stage", "lead_score", "temperature", "tags", "opted_out", "created_at", ...fieldKeys],
    ...rows.map((r) => [
      r.id, r.name, r.email, r.phone, r.instagramUsername, r.source, r.stage, r.leadScore, r.temperature, r.tags.join(";"),
      r.optedOut ? "yes" : "no", r.createdAt.toISOString(), ...fieldKeys.map((k) => r.customFields?.[k] ?? ""),
    ]),
  ]);
  await audit(ctx.workspace.id, ctx.user.id, "contact.export", undefined, { count: rows.length });
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="contacts-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
