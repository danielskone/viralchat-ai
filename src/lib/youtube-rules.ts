/**
 * YouTube comment auto-replies. Pure (no I/O) so it can be unit-tested.
 * YouTube has no DMs, so the "DM" is a public reply under the viewer's comment that contains the link.
 */
import { interpolate, matchKeyword } from "./engine/matcher";
import { normalizeUrl } from "./comment-flow";

export const YT_REPLY_MAX = 9000; // YouTube allows 10,000 characters; leave room for the name and link
export const YT_MAX_REPLIES = 3;

export type YtRule = {
  id: string;
  status: "draft" | "active" | "paused";
  anyWord: boolean;
  keywords: string[];
  videoIds: string[];
  replies: string[];
  link: string;
  createdAt: Date;
};

export type YtComment = {
  threadId: string;
  videoId: string | null;
  authorName: string;
  authorChannelId: string | null;
  text: string;
  publishedAt: Date;
};

export const DEFAULT_YT_REPLIES = [
  "Thanks {{name}}! Here's the link 👉 {{link}}",
  "Here you go {{name}} 🙌 {{link}}",
  "Got you! Tap here: {{link}}",
];

/** Pulls the video id out of a YouTube link (watch, youtu.be, shorts, live) or returns the id itself. */
export function parseVideoId(input: string): string | null {
  const s = input.trim();
  if (/^[\w-]{11}$/.test(s)) return s;
  try {
    const u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
    const host = u.hostname.replace(/^(www\.|m\.|music\.)/, "");
    let id: string | null = null;
    if (host === "youtu.be") id = u.pathname.slice(1).split("/")[0] ?? null;
    else if (host === "youtube.com") {
      id = u.searchParams.get("v");
      const m = u.pathname.match(/^\/(shorts|live|embed)\/([\w-]{11})/);
      if (!id && m) id = m[2]!;
    }
    return id && /^[\w-]{11}$/.test(id) ? id : null;
  } catch {
    return null;
  }
}

/** Problems that stop the rule from going live. Empty = ready. */
export function validateYtRule(r: Pick<YtRule, "anyWord" | "keywords" | "replies" | "link">): string[] {
  const p: string[] = [];
  if (!r.anyWord && r.keywords.filter((k) => k.trim()).length === 0) p.push("Add at least one word, or choose “Any comment”.");
  const replies = r.replies.map((x) => x.trim()).filter(Boolean);
  if (replies.length === 0) p.push("Write at least one reply.");
  if (replies.some((x) => x.length > YT_REPLY_MAX)) p.push("A reply is too long.");
  const link = normalizeUrl(r.link);
  if (!link) p.push("Add the link you want to send.");
  else if (!/^https?:\/\/[^\s/]+\.[^\s]+$/i.test(link)) p.push(`“${r.link}” doesn't look like a web address.`);
  if (link && !replies.some((x) => x.includes("{{link}}"))) p.push("Put {{link}} in your reply so viewers get the link.");
  return p;
}

/**
 * Picks the rule that answers this comment, or null.
 * Comments by the channel itself, and comments older than the rule, are ignored.
 * Rules for specific videos win over "any video" rules; older rules win ties.
 */
export function pickRule<R extends YtRule>(rules: R[], c: YtComment, ownChannelId: string): R | null {
  if (c.authorChannelId && c.authorChannelId === ownChannelId) return null;
  const candidates = rules
    .filter((r) => r.status === "active")
    .filter((r) => c.publishedAt >= r.createdAt)
    .filter((r) => r.videoIds.length === 0 || (!!c.videoId && r.videoIds.includes(c.videoId)))
    .filter((r) => (r.anyWord ? c.text.trim().length > 0 : !!matchKeyword(c.text, r.keywords, "contains")));
  candidates.sort((a, b) => (b.videoIds.length > 0 ? 1 : 0) - (a.videoIds.length > 0 ? 1 : 0) || a.createdAt.getTime() - b.createdAt.getTime());
  return candidates[0] ?? null;
}

export function buildReply(r: Pick<YtRule, "replies" | "link">, authorName: string, rand = Math.random): string {
  const list = r.replies.map((x) => x.trim()).filter(Boolean);
  const tpl = list[Math.floor(rand() * list.length)] ?? list[0] ?? "{{link}}";
  const name = authorName.replace(/^@/, "").trim();
  const text = interpolate(tpl, { name: name ? `@${name}` : "", first_name: name, link: normalizeUrl(r.link) });
  return text.replace(/\s+([!,.])/g, "$1").replace(/ {2,}/g, " ").trim();
}
