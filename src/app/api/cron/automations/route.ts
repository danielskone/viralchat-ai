import { safeEqual } from "@/lib/crypto";
import { processDueRuns } from "@/lib/engine/runtime";
import { processDueEmails } from "@/lib/email-server";
import { pollAllYoutube } from "@/lib/youtube-server";

/**
 * Resumes delayed automation steps, expires unanswered questions, and sends due follow-up emails.
 * Call every minute from a scheduler (Vercel Cron, GitHub Actions, cron + curl) with:
 *   Authorization: Bearer $CRON_SECRET
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  if (!secret || !safeEqual(auth, `Bearer ${secret}`)) return new Response("Unauthorized", { status: 401 });
  const result = await processDueRuns(100);
  const emails = await processDueEmails(200);
  const youtube = await pollAllYoutube(20_000).catch((e) => ({ error: String(e) }));
  return Response.json({ ok: true, ...result, ...emails, youtube });
}
