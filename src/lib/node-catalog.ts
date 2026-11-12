import type { FlowNodeType } from "@/db/schema";
import { STAGES } from "./utils";

export type FieldSpec =
  | { key: string; label: string; kind: "text" | "textarea" | "number" | "url"; placeholder?: string; hint?: string }
  | { key: string; label: string; kind: "select"; options: { value: string; label: string }[]; hint?: string };

export type NodeSpec = {
  type: FlowNodeType;
  label: string;
  description: string;
  group: "Messages" | "Logic" | "CRM" | "AI" | "Team" | "Advanced";
  color: string; // tailwind text color class for the icon chip
  defaults: Record<string, unknown>;
  fields: FieldSpec[];
  summary: (d: Record<string, unknown>) => string;
};

const s = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));
const VARS_HINT = "Variables: {{first_name}}, {{name}}, {{email}}, {{field.your_field}}";

export const NODE_SPECS: NodeSpec[] = [
  {
    type: "send_message",
    label: "Send message",
    description: "Send a DM to the contact",
    group: "Messages",
    color: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
    defaults: { text: "Hi {{first_name}}! 👋" },
    fields: [{ key: "text", label: "Message", kind: "textarea", hint: VARS_HINT }],
    summary: (d) => s(d.text) || "Empty message",
  },
  {
    type: "ask_question",
    label: "Ask question",
    description: "Ask and wait for their reply",
    group: "Messages",
    color: "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400",
    defaults: { question: "What's the best email to reach you?", saveAs: "email", timeoutHours: 23 },
    fields: [
      { key: "question", label: "Question", kind: "textarea", hint: VARS_HINT },
      { key: "saveAs", label: "Save reply to field", kind: "text", placeholder: "email", hint: "Use email, phone or name to fill those profile fields; anything else becomes a custom field." },
      { key: "timeoutHours", label: "Stop waiting after (hours)", kind: "number", hint: "Meta only allows automated replies within 24h." },
    ],
    summary: (d) => `${s(d.question) || "No question"} → ${s(d.saveAs) || "answer"}`,
  },
  {
    type: "condition",
    label: "Condition",
    description: "Branch Yes / No",
    group: "Logic",
    color: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
    defaults: { check: "reply_contains", value: "yes" },
    fields: [
      {
        key: "check",
        label: "Check",
        kind: "select",
        options: [
          { value: "reply_contains", label: "Last reply contains any of" },
          { value: "has_tag", label: "Contact has tag" },
          { value: "field_set", label: "Field has a value" },
          { value: "field_equals", label: "Field equals (field=value)" },
          { value: "score_gte", label: "Lead score is at least" },
        ],
      },
      { key: "value", label: "Value", kind: "text", hint: "For “contains”, separate options with commas." },
    ],
    summary: (d) => `${s(d.check).replace(/_/g, " ")}: ${s(d.value)}`,
  },
  {
    type: "delay",
    label: "Delay",
    description: "Wait before continuing",
    group: "Logic",
    color: "bg-slate-500/15 text-slate-600 dark:text-slate-300",
    defaults: { minutes: 60 },
    fields: [{ key: "minutes", label: "Minutes", kind: "number", hint: "Messages after a delay only send if still within Meta's 24h window." }],
    summary: (d) => `Wait ${s(d.minutes)} min`,
  },
  {
    type: "add_tag",
    label: "Add tag",
    description: "Tag the contact",
    group: "CRM",
    color: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
    defaults: { tag: "lead" },
    fields: [{ key: "tag", label: "Tag", kind: "text" }],
    summary: (d) => `+ ${s(d.tag)}`,
  },
  {
    type: "remove_tag",
    label: "Remove tag",
    description: "Remove a tag",
    group: "CRM",
    color: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
    defaults: { tag: "" },
    fields: [{ key: "tag", label: "Tag", kind: "text" }],
    summary: (d) => `− ${s(d.tag)}`,
  },
  {
    type: "set_field",
    label: "Set field",
    description: "Save a value on the contact",
    group: "CRM",
    color: "bg-teal-500/15 text-teal-600 dark:text-teal-400",
    defaults: { field: "interest", value: "" },
    fields: [
      { key: "field", label: "Field", kind: "text" },
      { key: "value", label: "Value", kind: "text", hint: VARS_HINT },
    ],
    summary: (d) => `${s(d.field)} = ${s(d.value)}`,
  },
  {
    type: "lead_score",
    label: "Lead score",
    description: "Add or subtract points",
    group: "CRM",
    color: "bg-rose-500/15 text-rose-600 dark:text-rose-400",
    defaults: { points: 10 },
    fields: [{ key: "points", label: "Points (negative to subtract)", kind: "number", hint: "70+ = Hot, 35+ = Warm" }],
    summary: (d) => `${Number(d.points) >= 0 ? "+" : ""}${s(d.points)} points`,
  },
  {
    type: "set_stage",
    label: "Set pipeline stage",
    description: "Move in the CRM pipeline",
    group: "CRM",
    color: "bg-violet-500/15 text-violet-600 dark:text-violet-400",
    defaults: { stage: "qualified" },
    fields: [{ key: "stage", label: "Stage", kind: "select", options: STAGES.map((st) => ({ value: st.id, label: st.label })) }],
    summary: (d) => STAGES.find((st) => st.id === d.stage)?.label ?? s(d.stage),
  },
  {
    type: "ai_reply",
    label: "AI reply",
    description: "Let your AI assistant answer",
    group: "AI",
    color: "bg-fuchsia-500/15 text-fuchsia-600 dark:text-fuchsia-400",
    defaults: {},
    fields: [],
    summary: () => "Answer using your knowledge base",
  },
  {
    type: "notify",
    label: "Notify team",
    description: "In-app alert for your team",
    group: "Team",
    color: "bg-orange-500/15 text-orange-600 dark:text-orange-400",
    defaults: { message: "New lead: {{name}}" },
    fields: [{ key: "message", label: "Notification", kind: "text", hint: VARS_HINT }],
    summary: (d) => s(d.message),
  },
  {
    type: "handoff",
    label: "Human handoff",
    description: "Pause bots, alert a human",
    group: "Team",
    color: "bg-orange-500/15 text-orange-600 dark:text-orange-400",
    defaults: { reason: "Customer needs help" },
    fields: [{ key: "reason", label: "Reason", kind: "text" }],
    summary: (d) => s(d.reason),
  },
  {
    type: "webhook",
    label: "Webhook",
    description: "POST contact data to a URL",
    group: "Advanced",
    color: "bg-cyan-500/15 text-cyan-600 dark:text-cyan-400",
    defaults: { url: "https://" },
    fields: [{ key: "url", label: "HTTPS URL", kind: "url", hint: "Receives JSON with the contact, tags, score and collected answers." }],
    summary: (d) => s(d.url),
  },
  {
    type: "end",
    label: "End",
    description: "Stop the flow",
    group: "Advanced",
    color: "bg-slate-500/15 text-slate-600 dark:text-slate-300",
    defaults: {},
    fields: [],
    summary: () => "End of flow",
  },
];

export const specFor = (type: string) => NODE_SPECS.find((n) => n.type === type);

export const TRIGGER_LABELS: Record<string, string> = {
  dm_keyword: "DM contains keyword",
  comment_keyword: "Comment contains keyword",
  story_reply: "Story reply or mention",
  new_conversation: "New conversation",
};
