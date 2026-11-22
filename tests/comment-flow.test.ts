import { describe, expect, it } from "vitest";
import {
  commentMatches,
  continueCommentFlow,
  defaultCommentFlow,
  pickPublicReply,
  postMatches,
  startCommentFlow,
  validateCommentFlow,
  type CommentFlow,
  type QButton,
  type QDeps,
} from "@/lib/comment-flow";

function fakeDeps(following: boolean | null = true) {
  const sent: { text: string; buttons: QButton[] }[] = [];
  const emails: string[] = [];
  const deps: QDeps = {
    vars: async () => ({ first_name: "Sam" }),
    send: async (text, buttons) => (sent.push({ text, buttons }), { ok: true }),
    isFollowing: async () => following,
    saveEmail: async (e) => void emails.push(e),
    log: () => {},
  };
  return { deps, sent, emails };
}

const flow = (patch: Partial<CommentFlow> = {}): CommentFlow => ({
  ...defaultCommentFlow(),
  link: { text: "Here {{first_name}}", links: [{ label: "Open", url: "https://example.com" }] },
  ...patch,
});

describe("comment flow rules", () => {
  it("matches words or any comment", () => {
    expect(commentMatches(flow(), ["send", "link"], "Send please")).toBe(true);
    expect(commentMatches(flow(), ["send"], "nice post")).toBe(false);
    expect(commentMatches(flow({ anyWord: true }), [], "nice post")).toBe(true);
  });
  it("filters posts", () => {
    expect(postMatches(flow({ postMode: "any" }), null, "p1")).toBe(true);
    expect(postMatches(flow({ postMode: "specific", postIds: ["p1"] }), null, "p2")).toBe(false);
    expect(postMatches(flow({ postMode: "next" }), null, "p2")).toBe("check-time");
    expect(postMatches(flow({ postMode: "next" }), "p1", "p1")).toBe(true);
  });
  it("picks a public reply only when on", () => {
    expect(pickPublicReply(flow({ publicReplies: ["a", "b"] }), () => 0.9)).toBe("b");
    expect(pickPublicReply(flow({ publicReplyOn: false }))).toBeNull();
  });
  it("validates", () => {
    expect(validateCommentFlow(flow(), ["link"])).toEqual([]);
    expect(validateCommentFlow(flow({ link: { text: "x", links: [] } }), ["link"])).toContain("Add the link you want to send.");
    expect(validateCommentFlow(flow(), []).length).toBe(1);
  });
});

describe("comment flow conversation", () => {
  it("runs opening → follow → email → link → follow-up", async () => {
    const f = flow({ follow: { ...flow().follow, on: true }, email: { ...flow().email, on: true }, followUp: { on: true, text: "Reminder", delayMinutes: 60 } });
    const { deps, sent, emails } = fakeDeps(true);
    let r = await startCommentFlow(f, deps);
    expect(r.state?.step).toBe("opening");
    expect(sent[0]!.buttons[0]).toMatchObject({ kind: "postback", step: "opening" });
    r = await continueCommentFlow(f, r.state!, "opening", deps);
    expect(r.state?.step).toBe("follow");
    r = await continueCommentFlow(f, r.state!, "follow", deps);
    expect(r.state?.step).toBe("email");
    r = await continueCommentFlow(f, r.state!, "it's Sam@Example.com thanks", deps);
    expect(emails).toEqual(["sam@example.com"]);
    expect(r.state?.step).toBe("followup_wait");
    expect(r.wait).toEqual({ for: "timer", minutes: 60 });
    expect(sent.at(-1)!.text).toBe("Here Sam");
    expect(sent.at(-1)!.buttons[0]).toMatchObject({ kind: "link", index: 0 });
    r = await continueCommentFlow(f, r.state!, null, deps);
    expect(r.status).toBe("completed");
    expect(sent.at(-1)!.text).toBe("Reminder");
  });
  it("skips the follow-up after a click", async () => {
    const f = flow({ followUp: { on: true, text: "Reminder", delayMinutes: 60 } });
    const { deps, sent } = fakeDeps();
    const r = await continueCommentFlow(f, { step: "followup_wait", tries: 0, clicked: true }, null, deps);
    expect(r.status).toBe("completed");
    expect(sent).toHaveLength(0);
  });
  it("asks again when not following", async () => {
    const f = flow({ opening: { ...flow().opening, on: false }, follow: { ...flow().follow, on: true } });
    const { deps, sent } = fakeDeps(false);
    let r = await startCommentFlow(f, deps);
    expect(r.state?.step).toBe("follow");
    r = await continueCommentFlow(f, r.state!, "follow", deps);
    expect(r.state).toEqual({ step: "follow", tries: 1 });
    expect(sent).toHaveLength(2);
  });
  it("sends just the link when everything else is off", async () => {
    const f = flow({ opening: { ...flow().opening, on: false } });
    const { deps, sent } = fakeDeps();
    const r = await startCommentFlow(f, deps);
    expect(r.status).toBe("completed");
    expect(sent).toHaveLength(1);
  });
  it("re-asks once for a bad email, then moves on", async () => {
    const f = flow({ opening: { ...flow().opening, on: false }, email: { on: true, text: "Email?" } });
    const { deps, emails } = fakeDeps();
    let r = await startCommentFlow(f, deps);
    r = await continueCommentFlow(f, r.state!, "nope", deps);
    expect(r.state).toEqual({ step: "email", tries: 1 });
    r = await continueCommentFlow(f, r.state!, "still no", deps);
    expect(r.status).toBe("completed");
    expect(emails).toEqual([]);
  });
});
