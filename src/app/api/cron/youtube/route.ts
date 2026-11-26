import { pollAllYoutube } from "@/lib/youtube-server";

export const maxDuration = 60;

/**
 * Checks connected YouTube channels for new comments and replies to the ones that match.
 * YouTube has no comment webhooks, so something must call this every few minutes
 * (the GitHub Actions workflow in .github/workflows/youtube-poll.yml does).
 * It needs no secret: each channel is checked at most every 2 minutes however often this is called,
 * and it only ever answers comments using the channel owner's own automations.
 */
export async function GET() {
  const result = await pollAllYoutube();
  return Response.json({ ok: true, ...result });
}
