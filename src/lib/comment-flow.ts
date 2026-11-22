/**
 * Comment-to-DM quick setup. A simple, form-based automation:
 * comment on a post → (public reply) → opening DM with a button → (follow check) → (email) → link DM → (follow-up if no click).
 * This file is pure (no I/O) so it can be unit-tested; the server wires the side effects.
 */
import { interpolate, matchKeyword } from "./engine/matcher";

export const TEXT_MAX = 640; // Meta's limit for a message with buttons
export const BUTTON_MAX = 20; // Meta's limit for a button label
export const MAX_LINKS = 3;
export const MAX_PUBLIC_REPLIES = 3;

export type FlowLink = { label: string; url: string };
export type PostSnapshot = { id: string; thumb: string | null; caption: string; channel: "instagram" | "messenger" };

export type CommentFlow = {
  kind: "comment_dm";
  postMode: "specific" | "any" | "next";
  postIds: string[];
  posts: PostSnapshot[]; // for the preview only
  nextArmedAt: string | null; // "next" mode: only posts published after this time
  anyWord: boolean;
  publicReplyOn: boolean;
  publicReplies: string[];
  opening: { on: boolean; text: string; button: string };
  follow: { on: boolean; text: string; button: string };
  email: { on: boolean; text: string };
  link: { text: string; links: FlowLink[] };
  followUp: { on: boolean; text: string; delayMinutes: number };
};

export const FOLLOW_UP_DELAYS = [30, 60, 180, 360, 720, 1380];

export function defaultCommentFlow(): CommentFlow {
  return {
    kind: "comment_dm",
    postMode: "any",
    postIds: [],
    posts: [],
    nextArmedAt: null,
    anyWord: false,
    publicReplyOn: true,
    publicReplies: ["Thanks! Check your DMs 📩", "Sent you a message, take a look!", "Just messaged you 🙌"],
    opening: {
      on: true,
      text: "Hey {{first_name}}! Thanks so much for your comment 😊\n\nTap the button below and I'll send it right over.",
      button: "Send it to me",
    },
    follow: {
      on: false,
      text: "Almost there! This one is for my followers ✨\n\nFollow me, then tap the button and I'll send it straight away.",
      button: "I'm following",
    },
    email: { on: false, text: "Where should I email it too? Just type your best email address 👇" },
    link: { text: "Here you go! 👇", links: [] },
    followUp: { on: false, text: "Did you get a chance to check it out? Here's the link again 👇", delayMinutes: 60 },
  };
}

/** Problems that stop the automation from going live. Empty = ready. */
export function validateCommentFlow(f: CommentFlow, keywords: string[]): string[] {
  const p: string[] = [];
  if (f.postMode === "specific" && f.postIds.length === 0) p.push("Pick at least one post, or choose “Any post”.");
  if (!f.anyWord && keywords.filter((k) => k.trim()).length === 0) p.push("Add at least one word, or choose “Any comment”.");
  if (f.publicReplyOn && !f.publicReplies.some((r) => r.trim())) p.push("Write a public reply, or turn public replies off.");
  if (f.opening.on && (!f.opening.text.trim() || !f.opening.button.trim())) p.push("The opening message needs text and a button label.");
  if (f.follow.on && (!f.follow.text.trim() || !f.follow.button.trim())) p.push("The follow message needs text and a button label.");
  if (f.email.on && !f.email.text.trim()) p.push("Write the message that asks for their email.");
  if (!f.link.text.trim()) p.push("Write the message that sends your link.");
  if (f.link.links.length === 0) p.push("Add the link you want to send.");
  for (const l of f.link.links) {
    if (!l.label.trim()) p.push("Every link needs a button label.");
    if (!/^https?:\/\/[^\s/]+\.[^\s]+/i.test(normalizeUrl(l.url))) p.push(`“${l.url || "(empty)"}” doesn't look like a web address.`);
  }
  if (f.followUp.on && !f.followUp.text.trim()) p.push("Write the follow-up message, or turn it off.");
  return [...new Set(p)];
}

/** Makes "example.com" into "https://example.com". */
export function normalizeUrl(url: string) {
  const u = url.trim();
  if (!u) return "";
  return /^https?:\/\//i.test(u) ? u : `https://${u}`;
}

/** Does this comment's text pass the word filter? */
export function commentMatches(f: CommentFlow, keywords: string[], text: string) {
  if (f.anyWord) return text.trim().length > 0;
  return !!matchKeyword(text, keywords, "contains");
}

/** Does this post pass the post filter? ("next" mode needs a timestamp check on the server.) */
export function postMatches(f: CommentFlow, boundPostId: string | null, postId: string | null) {
  if (f.postMode === "any") return true;
  if (f.postMode === "specific") return !!postId && f.postIds.includes(postId);
  return boundPostId ? boundPostId === postId : "check-time";
}

export function pickPublicReply(f: CommentFlow, rand = Math.random) {
  const list = f.publicReplies.map((r) => r.trim()).filter(Boolean);
  if (!f.publicReplyOn || list.length === 0) return null;
  return list[Math.floor(rand() * list.length)] ?? list[0]!;
}

// ───────── Conversation state machine ─────────

export type QStep = "opening" | "follow" | "email" | "link" | "followup_wait";
export type QState = { step: QStep; tries: number; clicked?: boolean };
export type QButton = { kind: "postback"; title: string; step: QStep } | { kind: "link"; title: string; index: number };

export type QDeps = {
  vars(): Promise<Record<string, string>>;
  send(text: string, buttons: QButton[]): Promise<{ ok: boolean; error?: string }>;
  /** true/false for Instagram; null when it can't be checked (Messenger, tests) — treated as following. */
  isFollowing(): Promise<boolean | null>;
  saveEmail(email: string): Promise<void>;
  log(status: "ok" | "error" | "waiting", message: string): void;
};

export type QResult = {
  state: QState | null;
  status: "waiting" | "completed" | "failed";
  wait: { for: "reply"; hours: number } | { for: "timer"; minutes: number } | null;
  error?: string;
};

const ORDER: QStep[] = ["opening", "follow", "email", "link"];

function enabled(f: CommentFlow, step: QStep) {
  if (step === "opening") return f.opening.on;
  if (step === "follow") return f.follow.on;
  if (step === "email") return f.email.on;
  return step === "link";
}

function nextStep(f: CommentFlow, after: QStep | null): QStep {
  const from = after ? ORDER.indexOf(after) + 1 : 0;
  return ORDER.slice(from).find((s) => enabled(f, s)) ?? "link";
}

const linkButtons = (f: CommentFlow): QButton[] => f.link.links.map((l, index) => ({ kind: "link", title: l.label, index }));

async function say(f: CommentFlow, deps: QDeps, text: string, buttons: QButton[], what: string): Promise<QResult | null> {
  const body = interpolate(text, await deps.vars()).trim();
  const r = await deps.send(body, buttons);
  if (!r.ok) {
    deps.log("error", `${what} not sent: ${r.error}`);
    return { state: null, status: "failed", wait: null, error: r.error };
  }
  deps.log("ok", `Sent ${what}`);
  return null;
}

/** Sends the message for `step` and says what to wait for next. */
async function enter(f: CommentFlow, step: QStep, deps: QDeps): Promise<QResult> {
  const waitReply = (s: QStep): QResult => {
    deps.log("waiting", "Waiting for them to reply or tap the button");
    return { state: { step: s, tries: 0 }, status: "waiting", wait: { for: "reply", hours: 23 } };
  };
  if (step === "opening") {
    return (await say(f, deps, f.opening.text, [{ kind: "postback", title: f.opening.button, step: "opening" }], "opening message")) ?? waitReply("opening");
  }
  if (step === "follow") {
    return (await say(f, deps, f.follow.text, [{ kind: "postback", title: f.follow.button, step: "follow" }], "follow request")) ?? waitReply("follow");
  }
  if (step === "email") {
    return (await say(f, deps, f.email.text, [], "email request")) ?? waitReply("email");
  }
  const failed = await say(f, deps, f.link.text, linkButtons(f), "link");
  if (failed) return failed;
  if (f.followUp.on) {
    const minutes = Math.min(1380, Math.max(5, Math.round(f.followUp.delayMinutes)));
    deps.log("waiting", `Will follow up in ${minutes} min if they don't tap the link`);
    return { state: { step: "followup_wait", tries: 0 }, status: "waiting", wait: { for: "timer", minutes } };
  }
  return { state: null, status: "completed", wait: null };
}

export function startCommentFlow(f: CommentFlow, deps: QDeps) {
  return enter(f, nextStep(f, null), deps);
}

const EMAIL_RE = /[^\s@<>()"',;:]+@[^\s@<>()"',;:]+\.[a-z]{2,}/i;

/** Continues after a reply/button tap (`input` = text), or after the follow-up timer (`input` = null). */
export async function continueCommentFlow(f: CommentFlow, state: QState, input: string | null, deps: QDeps): Promise<QResult> {
  if (state.step === "followup_wait") {
    if (input !== null) return { state, status: "waiting", wait: null }; // a reply doesn't cancel the timer
    if (state.clicked) {
      deps.log("ok", "They tapped the link, so no follow-up was needed");
      return { state: null, status: "completed", wait: null };
    }
    const failed = await say(f, deps, f.followUp.text, linkButtons(f), "follow-up");
    return failed ?? { state: null, status: "completed", wait: null };
  }
  if (input === null) {
    deps.log("ok", "No reply in time, stopped");
    return { state: null, status: "completed", wait: null };
  }
  if (state.step === "follow") {
    const following = await deps.isFollowing();
    if (following === false) {
      const tries = state.tries + 1;
      if (tries >= 4) {
        deps.log("ok", "Still not following after several tries, stopped");
        return { state: null, status: "completed", wait: null };
      }
      deps.log("ok", "Not following yet, asked again");
      const failed = await say(
        f,
        deps,
        "Hmm, it looks like you're not following yet. Follow me, then tap the button again 🙏",
        [{ kind: "postback", title: f.follow.button, step: "follow" }],
        "follow reminder",
      );
      return failed ?? { state: { step: "follow", tries }, status: "waiting", wait: { for: "reply", hours: 23 } };
    }
    deps.log("ok", following === null ? "Couldn't check follow status, continued" : "They're following");
  }
  if (state.step === "email") {
    const m = input.match(EMAIL_RE);
    if (m) {
      await deps.saveEmail(m[0].toLowerCase());
      deps.log("ok", `Saved email ${m[0].toLowerCase()}`);
    } else if (state.tries < 1) {
      const failed = await say(f, deps, "That doesn't look like an email address. Could you type it again?", [], "email retry");
      return failed ?? { state: { step: "email", tries: state.tries + 1 }, status: "waiting", wait: { for: "reply", hours: 23 } };
    } else deps.log("ok", "No email given, continued");
  }
  return enter(f, nextStep(f, state.step), deps);
}

/** Text stored in the inbox for a message with buttons. */
export function describeButtons(text: string, buttons: { title: string; url?: string }[]) {
  if (!buttons.length) return text;
  return `${text}\n\n${buttons.map((b) => (b.url ? `🔗 ${b.title} → ${b.url}` : `🔘 ${b.title}`)).join("\n")}`;
}
