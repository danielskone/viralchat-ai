"use client";
import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import {
  MessageSquare, HelpCircle, GitBranch, Clock, Tag, TagsIcon, PencilLine, Gauge, KanbanSquare, Sparkles, BellRing, UserRound, Webhook, CircleStop, Zap,
} from "lucide-react";
import { specFor, TRIGGER_LABELS } from "@/lib/node-catalog";
import { cn } from "@/lib/utils";

export const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  trigger: Zap,
  send_message: MessageSquare,
  ask_question: HelpCircle,
  condition: GitBranch,
  delay: Clock,
  add_tag: Tag,
  remove_tag: TagsIcon,
  set_field: PencilLine,
  lead_score: Gauge,
  set_stage: KanbanSquare,
  ai_reply: Sparkles,
  notify: BellRing,
  handoff: UserRound,
  webhook: Webhook,
  end: CircleStop,
};

export type FlowNodeData = { data: Record<string, unknown>; nodeType: string; triggerType?: string; keywords?: string[]; error?: boolean };
export type RFNode = Node<FlowNodeData, "flow">;

export function FlowNodeView({ data, selected }: NodeProps<RFNode>) {
  const isTrigger = data.nodeType === "trigger";
  const spec = specFor(data.nodeType);
  const Icon = ICONS[data.nodeType] ?? MessageSquare;
  const summary = isTrigger
    ? `${TRIGGER_LABELS[data.triggerType ?? "dm_keyword"]}${data.keywords?.length ? `: ${data.keywords.join(", ")}` : ""}`
    : spec?.summary(data.data) ?? "";
  return (
    <div
      className={cn(
        "w-60 rounded-2xl border bg-card text-card-foreground shadow-sm transition-shadow",
        selected && "ring-2 ring-primary",
        isTrigger && "border-primary/50",
        data.error && "border-destructive",
      )}
    >
      {!isTrigger && <Handle type="target" position={Position.Top} className="!size-3" />}
      <div className="flex items-center gap-2 px-3 pt-3">
        <span className={cn("flex size-7 items-center justify-center rounded-lg", isTrigger ? "brand-gradient text-white" : spec?.color)}>
          <Icon className="size-4" />
        </span>
        <span className="text-sm font-semibold">{isTrigger ? "Trigger" : spec?.label}</span>
      </div>
      <p className="line-clamp-3 px-3 pb-3 pt-1.5 text-xs text-muted-foreground">{summary}</p>
      {data.nodeType === "condition" ? (
        <>
          <Handle id="yes" type="source" position={Position.Bottom} style={{ left: "28%" }} className="!size-3 !bg-success" />
          <Handle id="no" type="source" position={Position.Bottom} style={{ left: "72%" }} className="!size-3 !bg-destructive" />
          <div className="flex justify-between px-8 pb-1 text-[10px] font-medium">
            <span className="text-success">Yes</span>
            <span className="text-destructive">No</span>
          </div>
        </>
      ) : data.nodeType !== "end" ? (
        <Handle type="source" position={Position.Bottom} className="!size-3" />
      ) : null}
    </div>
  );
}
