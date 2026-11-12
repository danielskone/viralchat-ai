import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { parseMetaWebhook, messagingWindow } from "@/lib/meta-parse";
import { verifyMetaSignature } from "@/lib/crypto";

describe("parseMetaWebhook", () => {
  it("parses Messenger messages and ignores echoes", () => {
    const events = parseMetaWebhook({
      object: "page",
      entry: [{ id: "PAGE1", time: 1, messaging: [
        { sender: { id: "PSID1" }, recipient: { id: "PAGE1" }, timestamp: 1700000000000, message: { mid: "m1", text: "INFO" } },
        { sender: { id: "PAGE1" }, recipient: { id: "PSID1" }, timestamp: 1700000000001, message: { mid: "m2", text: "echo", is_echo: true } },
      ] }],
    });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ kind: "message", channel: "messenger", accountId: "PAGE1", senderId: "PSID1", text: "INFO" });
  });

  it("parses Instagram DMs, story replies and comments", () => {
    const events = parseMetaWebhook({
      object: "instagram",
      entry: [{
        id: "IG1",
        time: 1700000000,
        messaging: [{ sender: { id: "IGSID" }, recipient: { id: "IG1" }, timestamp: 1700000000000, message: { mid: "m3", text: "love it", reply_to: { story: { id: "s1" } } } }],
        changes: [{ field: "comments", value: { id: "C1", text: "LINK pls", from: { id: "IGSID2", username: "maya" }, media: { id: "MEDIA1" } } }],
      }],
    });
    expect(events[0]).toMatchObject({ kind: "message", channel: "instagram", isStoryReply: true });
    expect(events[1]).toMatchObject({ kind: "comment", commentId: "C1", postId: "MEDIA1", fromName: "maya", text: "LINK pls" });
  });

  it("parses Facebook Page feed comments", () => {
    const [ev] = parseMetaWebhook({ object: "page", entry: [{ id: "PAGE1", changes: [{ field: "feed", value: { item: "comment", verb: "add", comment_id: "C9", post_id: "P1", message: "INFO", from: { id: "U1", name: "Sam" }, created_time: 1700000000 } }] }] });
    expect(ev).toMatchObject({ kind: "comment", channel: "messenger", commentId: "C9", fromName: "Sam" });
  });

  it("ignores unknown objects", () => {
    expect(parseMetaWebhook({ object: "whatsapp_business_account", entry: [] })).toEqual([]);
    expect(parseMetaWebhook(null)).toEqual([]);
  });
});

describe("messagingWindow", () => {
  const now = Date.parse("2026-01-10T00:00:00Z");
  it("allows automation within 24h only", () => {
    expect(messagingWindow(new Date(now - 3600_000), "automation", now).allowed).toBe(true);
    expect(messagingWindow(new Date(now - 25 * 3600_000), "automation", now).allowed).toBe(false);
  });
  it("allows agents up to 7 days with HUMAN_AGENT tag", () => {
    const w = messagingWindow(new Date(now - 3 * 86400_000), "agent", now);
    expect(w).toEqual({ allowed: true, tag: "HUMAN_AGENT" });
    expect(messagingWindow(new Date(now - 8 * 86400_000), "agent", now).allowed).toBe(false);
  });
  it("blocks when the contact never messaged", () => {
    expect(messagingWindow(null, "agent", now).allowed).toBe(false);
  });
});

describe("verifyMetaSignature", () => {
  it("accepts valid and rejects tampered payloads", () => {
    const body = JSON.stringify({ object: "page" });
    const sig = "sha256=" + createHmac("sha256", "secret").update(body).digest("hex");
    expect(verifyMetaSignature(body, sig, "secret")).toBe(true);
    expect(verifyMetaSignature(body + " ", sig, "secret")).toBe(false);
    expect(verifyMetaSignature(body, null, "secret")).toBe(false);
  });
});
