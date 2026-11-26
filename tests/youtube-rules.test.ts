import { describe, expect, it } from "vitest";
import { buildReply, parseVideoId, pickRule, validateYtRule, type YtComment, type YtRule } from "@/lib/youtube-rules";

const t0 = new Date("2026-11-01T00:00:00Z");
const rule = (o: Partial<YtRule> = {}): YtRule => ({
  id: "r1",
  status: "active",
  anyWord: false,
  keywords: ["link"],
  videoIds: [],
  replies: ["Here you go {{name}} 👉 {{link}}"],
  link: "ncnorthpole.com",
  createdAt: t0,
  ...o,
});
const comment = (o: Partial<YtComment> = {}): YtComment => ({
  threadId: "th1",
  videoId: "abcdefghijk",
  authorName: "@tina",
  authorChannelId: "UCviewer",
  text: "LINK please!",
  publishedAt: new Date("2026-11-02T00:00:00Z"),
  ...o,
});

describe("parseVideoId", () => {
  it("reads every common YouTube link shape", () => {
    expect(parseVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=3")).toBe("dQw4w9WgXcQ");
    expect(parseVideoId("youtu.be/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(parseVideoId("https://youtube.com/shorts/dQw4w9WgXcQ?si=x")).toBe("dQw4w9WgXcQ");
    expect(parseVideoId("https://m.youtube.com/live/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(parseVideoId("dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  });
  it("rejects other links", () => {
    expect(parseVideoId("https://vimeo.com/123")).toBeNull();
    expect(parseVideoId("hello")).toBeNull();
  });
});

describe("pickRule", () => {
  it("matches a keyword regardless of case and punctuation", () => {
    expect(pickRule([rule()], comment(), "UCme")?.id).toBe("r1");
    expect(pickRule([rule()], comment({ text: "nice video" }), "UCme")).toBeNull();
  });
  it("skips the channel's own comments, inactive rules and comments older than the rule", () => {
    expect(pickRule([rule()], comment({ authorChannelId: "UCme" }), "UCme")).toBeNull();
    expect(pickRule([rule({ status: "paused" })], comment(), "UCme")).toBeNull();
    expect(pickRule([rule()], comment({ publishedAt: new Date("2026-10-01") }), "UCme")).toBeNull();
  });
  it("respects the video filter and prefers video-specific rules", () => {
    const any = rule({ id: "any", anyWord: true });
    const one = rule({ id: "one", videoIds: ["abcdefghijk"], createdAt: new Date("2026-11-01T12:00:00Z") });
    expect(pickRule([any, one], comment(), "UCme")?.id).toBe("one");
    expect(pickRule([one], comment({ videoId: "zzzzzzzzzzz" }), "UCme")).toBeNull();
  });
});

describe("buildReply", () => {
  it("fills in the name and link", () => {
    expect(buildReply(rule(), "@tina")).toBe("Here you go @tina 👉 https://ncnorthpole.com");
  });
  it("tidies up when the name is missing", () => {
    expect(buildReply(rule({ replies: ["Thanks {{name}}! {{link}}"] }), "")).toBe("Thanks! https://ncnorthpole.com");
  });
});

describe("validateYtRule", () => {
  it("needs words, a reply with the link and a real address", () => {
    expect(validateYtRule(rule())).toEqual([]);
    expect(validateYtRule(rule({ keywords: [] }))).toHaveLength(1);
    expect(validateYtRule(rule({ replies: ["no link here"] }))).toContain("Put {{link}} in your reply so viewers get the link.");
    expect(validateYtRule(rule({ link: "not a link" })).length).toBeGreaterThan(0);
  });
});
