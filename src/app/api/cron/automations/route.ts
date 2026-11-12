import { safeEqual } from "@/lib/crypto";
import { processDueRuns } from "@/lib/engine/runtime";

/**
 * Resumes delayed automation steps and expires unanswered questions.
 * Call every minute from a scheduler (Vercel Cron, GitHub Actions, cron + curl) with:
 *   Authorization: Bearer $CRON_SECRET
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  if (!secret || !safeEqual(auth, `Bearer ${secret}`)) return new Response("Unauthorized", { status: 401 });
  const result = await processDueRuns(100);
  return Response.json({ ok: true, ...result });
}
