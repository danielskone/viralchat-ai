import { after } from "next/server";
import { db } from "@/db";
import { webhookEvents } from "@/db/schema";
import { verifyMetaSignature } from "@/lib/crypto";
import { metaConfig } from "@/lib/meta";
import { parseMetaWebhook } from "@/lib/meta-parse";
import { processMetaEvent } from "@/lib/inbound";
import { rateLimit } from "@/lib/rate-limit";

/** Webhook verification handshake (GET) — Meta calls this when you save the callback URL. */
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const cfg = metaConfig();
  if (sp.get("hub.mode") === "subscribe" && cfg.verifyToken && sp.get("hub.verify_token") === cfg.verifyToken) {
    return new Response(sp.get("hub.challenge") ?? "", { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}

/** Event delivery (POST). Verifies X-Hub-Signature-256, acknowledges fast, processes after responding. */
export async function POST(req: Request) {
  const cfg = metaConfig();
  if (!cfg.appSecret) return new Response("Meta app secret not configured", { status: 503 });
  if (!rateLimit("meta-webhook", 3000, 60_000)) return new Response("Too many requests", { status: 429 });
  const raw = await req.text();
  if (!verifyMetaSignature(raw, req.headers.get("x-hub-signature-256"), cfg.appSecret)) {
    return new Response("Invalid signature", { status: 401 });
  }
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return new Response("Bad JSON", { status: 400 });
  }
  const events = parseMetaWebhook(body);
  after(async () => {
    for (const ev of events) {
      try {
        await processMetaEvent(ev);
      } catch (e) {
        console.error("[meta webhook] processing failed", e);
        await db
          .insert(webhookEvents)
          .values({ source: "meta-error", dedupeKey: `${Date.now()}-${Math.random()}`, payload: ev as unknown as Record<string, unknown>, error: e instanceof Error ? e.message : String(e) })
          .catch(() => {});
      }
    }
  });
  return new Response("EVENT_RECEIVED", { status: 200 });
}
