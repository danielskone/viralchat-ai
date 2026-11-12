import type { FlowGraph, FlowNode, RunLogEntry } from "@/db/schema";
import { interpolate, matchKeyword } from "./matcher";

/** Side effects the executor needs. The server wires these to the DB/Meta; tests pass fakes. */
export type ExecDeps = {
  vars(): Promise<Record<string, string>>;
  send(text: string): Promise<{ ok: boolean; error?: string }>;
  addTag(tag: string): Promise<void>;
  removeTag(tag: string): Promise<void>;
  hasTag(tag: string): Promise<boolean>;
  setField(field: string, value: string): Promise<void>;
  getField(field: string): Promise<string | undefined>;
  addScore(points: number): Promise<number>;
  getScore(): Promise<number>;
  setStage(stage: string): Promise<void>;
  notify(message: string): Promise<void>;
  handoff(reason: string): Promise<void>;
  aiReply(): Promise<{ ok: boolean; error?: string; handoff?: boolean }>;
  webhook(url: string): Promise<{ ok: boolean; status?: number; error?: string }>;
  now(): Date;
};

export type RunState = {
  status: "running" | "waiting" | "completed" | "failed";
  currentNodeId: string | null;
  waitingFor: "reply" | "timer" | null;
  resumeAt: Date | null;
  context: Record<string, unknown>;
  log: RunLogEntry[];
  error?: string;
};

const MAX_STEPS = 60;

export function nextNodeId(graph: FlowGraph, fromId: string, handle?: string): string | null {
  const edges = graph.edges.filter((e) => e.source === fromId);
  if (handle) return edges.find((e) => e.sourceHandle === handle)?.target ?? null;
  return (edges.find((e) => !e.sourceHandle || e.sourceHandle === "out") ?? edges[0])?.target ?? null;
}

export function findTrigger(graph: FlowGraph): FlowNode | undefined {
  return graph.nodes.find((n) => n.type === "trigger");
}

const s = (v: unknown, fallback = "") => (typeof v === "string" ? v : v == null ? fallback : String(v));

/** Validates a graph before activation. Returns human-readable problems. */
export function validateGraph(graph: FlowGraph): string[] {
  const problems: string[] = [];
  const trigger = findTrigger(graph);
  if (!trigger) problems.push("Add a trigger node.");
  else if (!nextNodeId(graph, trigger.id)) problems.push("Connect the trigger to at least one step.");
  for (const n of graph.nodes) {
    const d = n.data;
    if (n.type === "send_message" && !s(d.text).trim()) problems.push(`"Send message" step is empty.`);
    if (n.type === "ask_question" && !s(d.question).trim()) problems.push(`"Ask question" step has no question.`);
    if ((n.type === "add_tag" || n.type === "remove_tag") && !s(d.tag).trim()) problems.push(`A tag step has no tag.`);
    if (n.type === "webhook" && !/^https:\/\//.test(s(d.url))) problems.push(`Webhook URL must start with https://`);
    if (n.type === "delay" && !(Number(d.minutes) > 0)) problems.push(`Delay must be at least 1 minute.`);
    if (n.type === "condition") {
      if (!nextNodeId(graph, n.id, "yes") && !nextNodeId(graph, n.id, "no")) problems.push(`Connect the Yes/No outputs of the condition.`);
    }
  }
  return problems;
}

/**
 * Executes the graph starting at `startId` until it completes, fails, or must wait
 * (for the contact's reply or a delay timer).
 */
export async function execute(graph: FlowGraph, startId: string | null, state: RunState, deps: ExecDeps): Promise<RunState> {
  const st: RunState = { ...state, context: { ...state.context }, log: [...state.log], status: "running", waitingFor: null, resumeAt: null };
  const log = (node: FlowNode, status: RunLogEntry["status"], message: string) =>
    st.log.push({ at: deps.now().toISOString(), nodeId: node.id, nodeType: node.type, status, message });

  let currentId = startId;
  let steps = 0;
  while (currentId) {
    if (++steps > MAX_STEPS) {
      st.status = "failed";
      st.error = "Stopped after too many steps (possible loop).";
      return st;
    }
    const node = graph.nodes.find((n) => n.id === currentId);
    if (!node) {
      st.status = "failed";
      st.error = `Step ${currentId} no longer exists.`;
      return st;
    }
    st.currentNodeId = node.id;
    const d = node.data;
    let handle: string | undefined;

    try {
      switch (node.type) {
        case "trigger":
          break;
        case "send_message": {
          const text = interpolate(s(d.text), await deps.vars());
          const r = await deps.send(text);
          if (!r.ok) {
            log(node, "error", `Message not sent: ${r.error}`);
            if (d.stopOnError !== false) {
              st.status = "failed";
              st.error = r.error;
              return st;
            }
          } else log(node, "ok", `Sent: "${truncate(text)}"`);
          break;
        }
        case "ask_question": {
          const answers = (st.context.answers ?? {}) as Record<string, string>;
          const key = s(d.saveAs, "answer");
          if (st.context.pendingReplyFor === node.id && typeof st.context.lastReply === "string") {
            const reply = st.context.lastReply;
            answers[key] = reply;
            st.context.answers = answers;
            delete st.context.pendingReplyFor;
            await deps.setField(key, reply);
            log(node, "ok", `Saved reply to "${key}": "${truncate(reply)}"`);
            break;
          }
          const text = interpolate(s(d.question), await deps.vars());
          const r = await deps.send(text);
          if (!r.ok) {
            log(node, "error", `Question not sent: ${r.error}`);
            st.status = "failed";
            st.error = r.error;
            return st;
          }
          log(node, "waiting", `Asked: "${truncate(text)}" — waiting for reply`);
          st.context.pendingReplyFor = node.id;
          st.status = "waiting";
          st.waitingFor = "reply";
          const timeoutHours = Number(d.timeoutHours ?? 23);
          st.resumeAt = new Date(deps.now().getTime() + timeoutHours * 3600_000);
          return st;
        }
        case "condition": {
          const check = s(d.check, "reply_contains");
          const value = s(d.value);
          let result = false;
          if (check === "reply_contains") {
            const reply = s(st.context.lastReply ?? st.context.triggerText);
            result = !!matchKeyword(reply, value.split(",").map((v) => v.trim()).filter(Boolean), "contains");
          } else if (check === "has_tag") result = await deps.hasTag(value);
          else if (check === "field_equals") {
            const [field, expected] = value.split("=").map((v) => v.trim());
            result = !!field && (await deps.getField(field))?.toLowerCase() === (expected ?? "").toLowerCase();
          } else if (check === "field_set") result = !!(await deps.getField(value));
          else if (check === "score_gte") result = (await deps.getScore()) >= Number(value);
          handle = result ? "yes" : "no";
          log(node, "ok", `Condition ${check} "${value}" → ${result ? "Yes" : "No"}`);
          break;
        }
        case "add_tag":
          await deps.addTag(s(d.tag).trim());
          log(node, "ok", `Added tag "${s(d.tag)}"`);
          break;
        case "remove_tag":
          await deps.removeTag(s(d.tag).trim());
          log(node, "ok", `Removed tag "${s(d.tag)}"`);
          break;
        case "set_field": {
          const value = interpolate(s(d.value), await deps.vars());
          await deps.setField(s(d.field), value);
          log(node, "ok", `Set ${s(d.field)} = "${truncate(value)}"`);
          break;
        }
        case "lead_score": {
          const total = await deps.addScore(Number(d.points ?? 0));
          log(node, "ok", `Lead score ${Number(d.points) >= 0 ? "+" : ""}${Number(d.points ?? 0)} → ${total}`);
          break;
        }
        case "set_stage":
          await deps.setStage(s(d.stage, "new_lead"));
          log(node, "ok", `Moved to stage "${s(d.stage)}"`);
          break;
        case "ai_reply": {
          const r = await deps.aiReply();
          if (!r.ok) {
            log(node, "error", `AI reply failed: ${r.error}`);
            if (d.stopOnError !== false) {
              st.status = "failed";
              st.error = r.error;
              return st;
            }
          } else log(node, "ok", r.handoff ? "AI could not answer confidently — handed to a human" : "AI replied");
          break;
        }
        case "delay": {
          const minutes = Math.max(1, Number(d.minutes ?? 60));
          if (st.context.delayDoneFor === node.id) {
            delete st.context.delayDoneFor;
            log(node, "ok", `Waited ${minutes} min`);
            break;
          }
          st.context.delayDoneFor = node.id;
          st.status = "waiting";
          st.waitingFor = "timer";
          st.resumeAt = new Date(deps.now().getTime() + minutes * 60_000);
          log(node, "waiting", `Waiting ${minutes} min`);
          return st;
        }
        case "notify": {
          const msg = interpolate(s(d.message, "New lead needs attention"), await deps.vars());
          await deps.notify(msg);
          log(node, "ok", `Notified team: "${truncate(msg)}"`);
          break;
        }
        case "handoff":
          await deps.handoff(s(d.reason, "Automation requested a human"));
          log(node, "ok", "Handed conversation to a human (automations paused)");
          break;
        case "webhook": {
          const r = await deps.webhook(s(d.url));
          log(node, r.ok ? "ok" : "error", r.ok ? `Webhook responded ${r.status}` : `Webhook failed: ${r.error}`);
          break;
        }
        case "end":
          log(node, "ok", "End of flow");
          st.status = "completed";
          st.currentNodeId = null;
          return st;
        default:
          log(node, "skipped", `Unknown step type ${node.type}`);
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      log(node, "error", message);
      st.status = "failed";
      st.error = message;
      return st;
    }

    currentId = nextNodeId(graph, node.id, handle);
  }
  st.status = "completed";
  st.currentNodeId = null;
  return st;
}

function truncate(t: string, n = 80) {
  return t.length > n ? t.slice(0, n - 1) + "…" : t;
}
