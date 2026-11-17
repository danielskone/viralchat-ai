import { unsubscribeContact } from "@/lib/email-server";

/** One-click unsubscribe (RFC 8058): mail apps POST here from the List-Unsubscribe header. */
export async function POST(req: Request) {
  const ok = await unsubscribeContact(new URL(req.url).searchParams.get("t"));
  return new Response(ok ? "Unsubscribed" : "Invalid link", { status: ok ? 200 : 400 });
}

export async function GET(req: Request) {
  const t = new URL(req.url).searchParams.get("t") ?? "";
  return Response.redirect(new URL(`/unsubscribe?t=${encodeURIComponent(t)}`, req.url), 303);
}
