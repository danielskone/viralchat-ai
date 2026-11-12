import { describe, expect, it } from "vitest";
import { execute, validateGraph, findTrigger, type ExecDeps, type RunState } from "@/lib/engine/executor";
import { TEMPLATES, linearGraph } from "@/lib/templates";

function fakeDeps(overrides: Partial<ExecDeps> = {}) {
  const sent: string[] = [];
  const state = { tags: [] as string[], fields: {} as Record<string, string>, score: 0, stage: "new_lead", notified: [] as string[], handoff: false };
  const deps: ExecDeps = {
    now: () => new Date("2026-01-01T00:00:00Z"),
    vars: async () => ({ first_name: "Maya", name: "Maya J", ...Object.fromEntries(Object.entries(state.fields).map(([k, v]) => [`field.${k}`, v])) }),
    send: async (t) => (sent.push(t), { ok: true }),
    addTag: async (t) => void state.tags.push(t),
    removeTag: async (t) => void (state.tags = state.tags.filter((x) => x !== t)),
    hasTag: async (t) => state.tags.includes(t),
    setField: async (k, v) => void (state.fields[k] = v),
    getField: async (k) => state.fields[k],
    addScore: async (p) => (state.score += p),
    getScore: async () => state.score,
    setStage: async (s) => void (state.stage = s),
    notify: async (m) => void state.notified.push(m),
    handoff: async () => void (state.handoff = true),
    aiReply: async () => ({ ok: true }),
    webhook: async () => ({ ok: true, status: 200 }),
    ...overrides,
  };
  return { deps, sent, state };
}

const fresh = (): RunState => ({ status: "running", currentNodeId: null, waitingFor: null, resumeAt: null, context: {}, log: [] });

describe("executor", () => {
  it("runs a linear flow to completion with interpolation", async () => {
    const g = linearGraph("t", [
      { type: "send_message", data: { text: "Hi {{first_name}}" } },
      { type: "add_tag", data: { tag: "lead" } },
      { type: "lead_score", data: { points: 40 } },
      { type: "set_stage", data: { stage: "qualified" } },
    ]);
    const { deps, sent, state } = fakeDeps();
    const r = await execute(g, findTrigger(g)!.id, fresh(), deps);
    expect(r.status).toBe("completed");
    expect(sent).toEqual(["Hi Maya"]);
    expect(state).toMatchObject({ tags: ["lead"], score: 40, stage: "qualified" });
  });

  it("waits for a reply on ask_question, then resumes and saves the answer", async () => {
    const g = linearGraph("t", [
      { type: "ask_question", data: { question: "Email?", saveAs: "email" } },
      { type: "send_message", data: { text: "Thanks!" } },
    ]);
    const { deps, sent, state } = fakeDeps();
    const r1 = await execute(g, findTrigger(g)!.id, fresh(), deps);
    expect(r1.status).toBe("waiting");
    expect(r1.waitingFor).toBe("reply");
    expect(sent).toEqual(["Email?"]);
    const r2 = await execute(g, r1.currentNodeId, { ...r1, context: { ...r1.context, lastReply: "maya@example.com" } }, deps);
    expect(r2.status).toBe("completed");
    expect(state.fields.email).toBe("maya@example.com");
    expect(sent).toEqual(["Email?", "Thanks!"]);
  });

  it("branches on conditions", async () => {
    const g = linearGraph("t", [
      { type: "condition", data: { check: "reply_contains", value: "sales, buy" }, branch: { yes: [{ type: "add_tag", data: { tag: "yes" } }], no: [{ type: "add_tag", data: { tag: "no" } }] } },
    ]);
    const a = fakeDeps();
    await execute(g, findTrigger(g)!.id, { ...fresh(), context: { lastReply: "I want to BUY" } }, a.deps);
    expect(a.state.tags).toEqual(["yes"]);
    const b = fakeDeps();
    await execute(g, findTrigger(g)!.id, { ...fresh(), context: { lastReply: "support pls" } }, b.deps);
    expect(b.state.tags).toEqual(["no"]);
  });

  it("schedules delays and continues after the timer", async () => {
    const g = linearGraph("t", [{ type: "delay", data: { minutes: 30 } }, { type: "send_message", data: { text: "Later" } }]);
    const { deps, sent } = fakeDeps();
    const r1 = await execute(g, findTrigger(g)!.id, fresh(), deps);
    expect(r1).toMatchObject({ status: "waiting", waitingFor: "timer" });
    expect(r1.resumeAt?.toISOString()).toBe("2026-01-01T00:30:00.000Z");
    const r2 = await execute(g, r1.currentNodeId, r1, deps);
    expect(r2.status).toBe("completed");
    expect(sent).toEqual(["Later"]);
  });

  it("fails the run when a message can't be delivered", async () => {
    const g = linearGraph("t", [{ type: "send_message", data: { text: "x" } }, { type: "add_tag", data: { tag: "never" } }]);
    const { deps, state } = fakeDeps({ send: async () => ({ ok: false, error: "Outside 24h window" }) });
    const r = await execute(g, findTrigger(g)!.id, fresh(), deps);
    expect(r.status).toBe("failed");
    expect(r.error).toContain("24h");
    expect(state.tags).toEqual([]);
  });

  it("stops infinite loops", async () => {
    const g = { nodes: [{ id: "t", type: "trigger" as const, position: { x: 0, y: 0 }, data: {} }, { id: "a", type: "add_tag" as const, position: { x: 0, y: 0 }, data: { tag: "x" } }], edges: [{ id: "1", source: "t", target: "a" }, { id: "2", source: "a", target: "a" }] };
    const r = await execute(g, "t", fresh(), fakeDeps().deps);
    expect(r.status).toBe("failed");
  });

  it("all built-in templates are valid", () => {
    for (const t of TEMPLATES) expect(validateGraph(t.graph), t.key).toEqual([]);
  });
});
