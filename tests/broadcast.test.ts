import { describe, expect, it } from "vitest";
import { pickRecipients } from "@/lib/broadcast";

const now = new Date("2026-11-17T12:00:00Z").getTime();
const hoursAgo = (h: number) => new Date(now - h * 3600_000);

describe("pickRecipients", () => {
  it("only includes people inside the 24-hour window", () => {
    const r = pickRecipients(
      [
        { conversationId: "a", contactId: "1", channel: "instagram", lastInboundAt: hoursAgo(2) },
        { conversationId: "b", contactId: "2", channel: "messenger", lastInboundAt: hoursAgo(30) },
        { conversationId: "c", contactId: "3", channel: "messenger", lastInboundAt: null },
      ],
      now,
    );
    expect(r.eligible.map((e) => e.conversationId)).toEqual(["a"]);
    expect(r.outsideWindow).toBe(2);
  });
  it("sends one message per person, on their most recent channel", () => {
    const r = pickRecipients(
      [
        { conversationId: "ig", contactId: "1", channel: "instagram", lastInboundAt: hoursAgo(5) },
        { conversationId: "fb", contactId: "1", channel: "messenger", lastInboundAt: hoursAgo(1) },
      ],
      now,
    );
    expect(r.eligible.map((e) => e.conversationId)).toEqual(["fb"]);
    expect(r.outsideWindow).toBe(0);
  });
  it("still uses an in-window channel when another channel is stale", () => {
    const r = pickRecipients(
      [
        { conversationId: "ig", contactId: "1", channel: "instagram", lastInboundAt: hoursAgo(50) },
        { conversationId: "fb", contactId: "1", channel: "messenger", lastInboundAt: hoursAgo(3) },
      ],
      now,
    );
    expect(r.eligible.map((e) => e.conversationId)).toEqual(["fb"]);
  });
});
