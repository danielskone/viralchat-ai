"use client";
import Link from "next/link";
import { useCallback, useMemo, useRef, useState, useTransition, useEffect } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  MarkerType,
} from "@xyflow/react";
import { ArrowLeft, Save, Play, Pause, Trash2, FlaskConical, ListChecks, Settings2, RotateCcw, Send, AlertTriangle, CheckCircle2, XCircle, Clock } from "lucide-react";
import type { Automation, FlowGraph, FlowNodeType, RunLogEntry } from "@/db/schema";
import { NODE_SPECS, specFor, TRIGGER_LABELS } from "@/lib/node-catalog";
import { Badge, Input, Select, Textarea, Alert } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { cn, timeAgo } from "@/lib/utils";
import {
  saveAutomation,
  setAutomationStatus,
  deleteAutomation,
  testSend,
  testReset,
  testState,
  type TestTranscript,
} from "@/lib/actions/automations";
import { FlowNodeView, ICONS, type RFNode } from "./flow-node";

type SerializedAutomation = Omit<Automation, "createdAt" | "updatedAt"> & { createdAt: string; updatedAt: string };
type RunRow = { id: string; status: string; error: string | null; startedAt: string; log: RunLogEntry[]; contactId: string | null };

const nodeTypes = { flow: FlowNodeView };

function toRF(graph: FlowGraph, a: SerializedAutomation): { nodes: RFNode[]; edges: Edge[] } {
  return {
    nodes: graph.nodes.map((n) => ({
      id: n.id,
      type: "flow",
      position: n.position,
      deletable: n.type !== "trigger",
      data: { nodeType: n.type, data: n.data, triggerType: a.triggerType, keywords: a.keywords },
    })),
    edges: graph.edges.map((e) => edgeStyle({ id: e.id, source: e.source, target: e.target, sourceHandle: e.sourceHandle ?? null })),
  };
}

function edgeStyle(e: Edge): Edge {
  const color = e.sourceHandle === "yes" ? "var(--color-success)" : e.sourceHandle === "no" ? "var(--color-destructive)" : undefined;
  return { ...e, type: "smoothstep", markerEnd: { type: MarkerType.ArrowClosed, color }, style: color ? { stroke: color } : undefined };
}

export function Builder(props: { automation: SerializedAutomation; metaConnected: boolean; aiEnabled: boolean; canDelete: boolean; runs: RunRow[] }) {
  return (
    <ReactFlowProvider>
      <BuilderInner {...props} />
    </ReactFlowProvider>
  );
}

function BuilderInner({ automation: a, metaConnected, canDelete, runs }: { automation: SerializedAutomation; metaConnected: boolean; aiEnabled: boolean; canDelete: boolean; runs: RunRow[] }) {
  const initial = useMemo(() => toRF(a.graph, a), [a]);
  const [nodes, setNodes, onNodesChange] = useNodesState<RFNode>(initial.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(initial.edges);
  const [name, setName] = useState(a.name);
  const [triggerType, setTriggerType] = useState(a.triggerType);
  const [keywords, setKeywords] = useState(a.keywords.join(", "));
  const [matchType, setMatchType] = useState(a.matchType);
  const [channels, setChannels] = useState<string[]>(a.channels);
  const [postId, setPostId] = useState(a.postId ?? "");
  const [publicReply, setPublicReply] = useState(a.publicReply ?? "");
  const [status, setStatus] = useState(a.status);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<"edit" | "test" | "runs">("edit");
  const [dirty, setDirty] = useState(false);
  const [notice, setNotice] = useState<{ tone: "success" | "danger" | "warning"; text: string; problems?: string[] } | null>(null);
  const [pending, start] = useTransition();
  const rf = useReactFlow();
  const idCounter = useRef(0);

  const kwList = keywords.split(",").map((k) => k.trim()).filter(Boolean);

  // keep trigger node label in sync
  useEffect(() => {
    setNodes((ns) => ns.map((n) => (n.data.nodeType === "trigger" ? { ...n, data: { ...n.data, triggerType, keywords: kwList } } : n)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [triggerType, keywords]);

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  const onConnect = useCallback(
    (c: Connection) => {
      setDirty(true);
      setEdges((es) => {
        // one outgoing edge per source handle
        const filtered = es.filter((e) => !(e.source === c.source && (e.sourceHandle ?? null) === (c.sourceHandle ?? null)));
        return addEdge(edgeStyle({ ...c, id: `e-${c.source}-${c.sourceHandle ?? "out"}-${c.target}` } as Edge), filtered);
      });
    },
    [setEdges],
  );

  const addNode = (type: FlowNodeType) => {
    const spec = specFor(type)!;
    let id = "";
    do id = `s${nodes.length + ++idCounter.current}`;
    while (nodes.some((n) => n.id === id));
    const sel = nodes.find((n) => n.id === selectedId);
    const anchor = sel ?? nodes.reduce<RFNode | undefined>((lowest, n) => (!lowest || n.position.y > lowest.position.y ? n : lowest), undefined);
    const position = anchor ? { x: anchor.position.x, y: anchor.position.y + 150 } : rf.screenToFlowPosition({ x: 400, y: 200 });
    setNodes((ns) => [...ns.map((n) => ({ ...n, selected: false })), { id, type: "flow", position, selected: true, data: { nodeType: type, data: structuredClone(spec.defaults) } }]);
    if (anchor && anchor.data.nodeType !== "condition" && anchor.data.nodeType !== "end" && !edges.some((e) => e.source === anchor.id)) {
      setEdges((es) => [...es, edgeStyle({ id: `e-${anchor.id}-${id}`, source: anchor.id, target: id, sourceHandle: null })]);
    }
    setSelectedId(id);
    setTab("edit");
    setDirty(true);
  };

  const updateNodeData = (id: string, key: string, value: unknown) => {
    setDirty(true);
    setNodes((ns) => ns.map((n) => (n.id === id ? { ...n, data: { ...n.data, data: { ...n.data.data, [key]: value } } } : n)));
  };

  const payload = () => ({
    name,
    triggerType,
    channels: channels as ("instagram" | "messenger")[],
    keywords: kwList,
    matchType: matchType as "contains",
    postId: postId || null,
    publicReply: publicReply || null,
    graph: {
      nodes: nodes.map((n) => ({ id: n.id, type: n.data.nodeType as FlowNodeType, position: { x: Math.round(n.position.x), y: Math.round(n.position.y) }, data: n.data.data })),
      edges: edges.map((e) => ({ id: e.id, source: e.source, target: e.target, sourceHandle: e.sourceHandle ?? null })),
    },
  });

  const save = (then?: () => Promise<void>) =>
    start(async () => {
      const r = await saveAutomation(a.id, payload());
      if (!r.ok) {
        setNotice({ tone: "danger", text: r.error ?? "Save failed", problems: r.problems });
        return;
      }
      setDirty(false);
      setNotice(r.problems?.length ? { tone: "warning", text: "Saved as draft. Fix these before activating:", problems: r.problems } : { tone: "success", text: "Saved" });
      if (then) await then();
    });

  const toggleActive = () =>
    save(async () => {
      const next = status === "active" ? "paused" : "active";
      const r = await setAutomationStatus(a.id, next);
      if (!r.ok) setNotice({ tone: "danger", text: r.error ?? "Could not change status", problems: r.problems });
      else {
        setStatus(next);
        setNotice({
          tone: next === "active" && !metaConnected ? "warning" : "success",
          text: next === "active" ? (metaConnected ? "Automation is live 🎉" : "Activated, but it won't receive messages until you connect Meta on the Integrations page.") : "Automation paused",
        });
      }
    });

  const selected = nodes.find((n) => n.id === selectedId);

  return (
    <div className="-m-4 flex h-[calc(100vh-4rem)] flex-col sm:-m-6">
      <header className="flex flex-wrap items-center gap-2 border-b bg-card px-4 py-2">
        <Link href="/automations" aria-label="Back to automations" className="rounded-lg p-1.5 hover:bg-muted"><ArrowLeft className="size-4" /></Link>
        <Input value={name} onChange={(e) => { setName(e.target.value); setDirty(true); }} className="h-8 max-w-72 font-medium" aria-label="Automation name" />
        <Badge tone={status === "active" ? "success" : status === "paused" ? "warning" : "default"}>{status}</Badge>
        {dirty && <span className="text-xs text-muted-foreground">Unsaved changes</span>}
        <div className="flex-1" />
        {canDelete && (
          <form action={deleteAutomation} onSubmit={(e) => { if (!confirm("Delete this automation and its run history?")) e.preventDefault(); }}>
            <input type="hidden" name="id" value={a.id} />
            <Button variant="ghost" size="icon" aria-label="Delete automation"><Trash2 /></Button>
          </form>
        )}
        <Button variant="outline" size="sm" onClick={() => save()} disabled={pending}><Save /> Save</Button>
        <Button variant={status === "active" ? "secondary" : "gradient"} size="sm" onClick={toggleActive} disabled={pending}>
          {status === "active" ? <><Pause /> Pause</> : <><Play /> Activate</>}
        </Button>
      </header>
      {notice && (
        <div className="border-b px-4 py-2">
          <Alert tone={notice.tone} title={notice.text}>
            {notice.problems?.length ? <ul className="list-disc pl-5">{notice.problems.map((p) => <li key={p}>{p}</li>)}</ul> : null}
          </Alert>
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        {/* Left: trigger + palette */}
        <aside className="hidden w-64 shrink-0 flex-col gap-4 overflow-y-auto border-r bg-card p-3 md:flex">
          <section aria-labelledby="trigger-h" className="flex flex-col gap-2">
            <h2 id="trigger-h" className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground"><Settings2 className="size-3.5" /> Trigger</h2>
            <Select value={triggerType} onChange={(e) => { setTriggerType(e.target.value as typeof triggerType); setDirty(true); }} aria-label="Trigger type">
              {Object.entries(TRIGGER_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </Select>
            {(triggerType === "dm_keyword" || triggerType === "comment_keyword") && (
              <>
                <label className="text-xs text-muted-foreground" htmlFor="kw">Keywords (comma separated)</label>
                <Input id="kw" value={keywords} onChange={(e) => { setKeywords(e.target.value); setDirty(true); }} placeholder="INFO, PRICE" />
                <Select value={matchType} onChange={(e) => { setMatchType(e.target.value); setDirty(true); }} aria-label="Match type">
                  <option value="contains">Message contains keyword</option>
                  <option value="exact">Message is exactly the keyword</option>
                  <option value="starts_with">Message starts with keyword</option>
                </Select>
                <p className="text-[11px] text-muted-foreground">Case and punctuation are ignored. Use * to match any message.</p>
              </>
            )}
            {triggerType === "comment_keyword" && (
              <>
                <label className="text-xs text-muted-foreground" htmlFor="pid">Only on post/Reel ID (optional)</label>
                <Input id="pid" value={postId} onChange={(e) => { setPostId(e.target.value); setDirty(true); }} placeholder="Any post" />
                <label className="text-xs text-muted-foreground" htmlFor="pr">Public reply under the comment (optional)</label>
                <Input id="pr" value={publicReply} onChange={(e) => { setPublicReply(e.target.value); setDirty(true); }} placeholder="Sent you a DM!" />
                <p className="text-[11px] text-muted-foreground">The first message is sent as a private reply to the comment. Meta allows one private reply per comment; later steps send after the person replies.</p>
              </>
            )}
            {triggerType === "story_reply" && <p className="text-[11px] text-muted-foreground">Runs when someone replies to or mentions your Instagram Story.</p>}
            {triggerType === "new_conversation" && <p className="text-[11px] text-muted-foreground">Runs on the first message from a new contact (if no keyword automation matched).</p>}
            <fieldset className="flex gap-3 text-sm">
              <legend className="sr-only">Channels</legend>
              {(["instagram", "messenger"] as const).map((c) => (
                <label key={c} className="flex items-center gap-1.5 capitalize">
                  <input
                    type="checkbox"
                    checked={channels.includes(c)}
                    onChange={(e) => { setChannels(e.target.checked ? [...channels, c] : channels.filter((x) => x !== c)); setDirty(true); }}
                  />
                  {c}
                </label>
              ))}
            </fieldset>
          </section>
          <section aria-labelledby="steps-h">
            <h2 id="steps-h" className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Add a step</h2>
            {(["Messages", "Logic", "CRM", "AI", "Team", "Advanced"] as const).map((g) => (
              <div key={g} className="mb-3">
                <p className="mb-1 text-[11px] text-muted-foreground">{g}</p>
                <div className="grid grid-cols-1 gap-1">
                  {NODE_SPECS.filter((n) => n.group === g).map((n) => {
                    const Icon = ICONS[n.type]!;
                    return (
                      <button key={n.type} onClick={() => addNode(n.type)} className="flex items-center gap-2 rounded-lg border px-2 py-1.5 text-left text-sm hover:border-primary hover:bg-accent/50">
                        <span className={cn("flex size-6 items-center justify-center rounded-md", n.color)}><Icon className="size-3.5" /></span>
                        <span className="flex-1">{n.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </section>
        </aside>

        {/* Canvas */}
        <div className="relative min-w-0 flex-1 bg-muted/30">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={(c) => { onNodesChange(c); if (c.some((x) => x.type !== "select" && x.type !== "dimensions")) setDirty(true); }}
            onEdgesChange={(c) => { onEdgesChange(c); if (c.some((x) => x.type === "remove")) setDirty(true); }}
            onConnect={onConnect}
            onSelectionChange={({ nodes: sel }) => { if (sel[0]) { setSelectedId(sel[0].id); setTab("edit"); } }}
            onPaneClick={() => setSelectedId(null)}
            fitView
            fitViewOptions={{ padding: 0.3, maxZoom: 1 }}
            deleteKeyCode={["Backspace", "Delete"]}
            proOptions={{ hideAttribution: true }}
          >
            <Background gap={20} />
            <Controls />
            <MiniMap pannable zoomable className="!hidden lg:!block" />
          </ReactFlow>
          <p className="pointer-events-none absolute bottom-3 left-1/2 hidden -translate-x-1/2 rounded-full bg-card/90 px-3 py-1 text-xs text-muted-foreground shadow sm:block">
            Drag from a dot to connect steps · Select and press Delete to remove
          </p>
        </div>

        {/* Right panel */}
        <aside className="hidden w-80 shrink-0 flex-col border-l bg-card lg:flex">
          <div className="flex border-b text-sm" role="tablist">
            {([
              ["edit", "Step", Settings2],
              ["test", "Test", FlaskConical],
              ["runs", "Runs", ListChecks],
            ] as const).map(([id, label, Icon]) => (
              <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={cn("flex flex-1 items-center justify-center gap-1.5 py-2.5", tab === id ? "border-b-2 border-primary font-medium" : "text-muted-foreground")}>
                <Icon className="size-4" /> {label}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            {tab === "edit" && <StepEditor node={selected} onChange={updateNodeData} onDelete={(id) => { setNodes((ns) => ns.filter((n) => n.id !== id)); setEdges((es) => es.filter((e) => e.source !== id && e.target !== id)); setSelectedId(null); setDirty(true); }} />}
            {tab === "test" && <TestPanel key={triggerType} automationId={a.id} triggerType={triggerType} dirty={dirty} onSaveFirst={() => save()} />}
            {tab === "runs" && <RunsPanel runs={runs} />}
          </div>
        </aside>
      </div>
    </div>
  );
}

function StepEditor({ node, onChange, onDelete }: { node?: RFNode; onChange: (id: string, key: string, value: unknown) => void; onDelete: (id: string) => void }) {
  if (!node) return <p className="text-sm text-muted-foreground">Select a step on the canvas to edit it, or add one from the left.</p>;
  if (node.data.nodeType === "trigger") return <p className="text-sm text-muted-foreground">Configure the trigger in the left panel: when it fires, the flow runs from top to bottom.</p>;
  const spec = specFor(node.data.nodeType);
  if (!spec) return null;
  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="font-semibold">{spec.label}</p>
        <p className="text-xs text-muted-foreground">{spec.description}</p>
      </div>
      {spec.fields.length === 0 && (
        <p className="text-sm text-muted-foreground">
          {node.data.nodeType === "ai_reply" ? "Uses your AI Chatbot settings and knowledge base to answer the contact's last message. If the AI isn't confident, the conversation is handed to a human." : "No settings."}
        </p>
      )}
      {spec.fields.map((f) => {
        const v = node.data.data[f.key];
        const id = `f-${node.id}-${f.key}`;
        return (
          <div key={f.key} className="flex flex-col gap-1.5">
            <label htmlFor={id} className="text-sm font-medium">{f.label}</label>
            {f.kind === "textarea" ? (
              <Textarea id={id} value={String(v ?? "")} onChange={(e) => onChange(node.id, f.key, e.target.value)} rows={4} />
            ) : f.kind === "select" ? (
              <Select id={id} value={String(v ?? "")} onChange={(e) => onChange(node.id, f.key, e.target.value)}>
                {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </Select>
            ) : (
              <Input id={id} type={f.kind === "number" ? "number" : "text"} value={String(v ?? "")} onChange={(e) => onChange(node.id, f.key, f.kind === "number" ? Number(e.target.value) : e.target.value)} />
            )}
            {f.hint && <p className="text-xs text-muted-foreground">{f.hint}</p>}
          </div>
        );
      })}
      <Button variant="ghost" className="self-start text-destructive" onClick={() => onDelete(node.id)}><Trash2 /> Remove step</Button>
    </div>
  );
}

function TestPanel({ automationId, triggerType, dirty, onSaveFirst }: { automationId: string; triggerType: string; dirty: boolean; onSaveFirst: () => void }) {
  const [t, setT] = useState<TestTranscript | null>(null);
  const [text, setText] = useState("");
  const [asComment, setAsComment] = useState(triggerType === "comment_keyword");
  const [pending, start] = useTransition();
  useEffect(() => {
    start(async () => setT(await testState(automationId)));
  }, [automationId]);

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="rounded-xl border border-dashed border-warning/60 bg-warning/5 p-3 text-xs">
        <p className="font-medium">Test mode</p>
        <p className="text-muted-foreground">Chat as a test contact. Messages are simulated and never sent to Instagram or Messenger. Test runs don’t count toward your plan.</p>
      </div>
      {dirty && (
        <button onClick={onSaveFirst} className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-left text-xs">
          <AlertTriangle className="size-4 text-warning" /> You have unsaved changes. Click to save so the test uses them.
        </button>
      )}
      <div className="flex min-h-48 flex-1 flex-col gap-2 overflow-y-auto rounded-xl bg-muted/50 p-3">
        {!t?.messages.length && <p className="m-auto text-center text-xs text-muted-foreground">Send a message that matches your trigger, e.g. one of your keywords.</p>}
        {t?.messages.map((m) => (
          <div key={m.id} className={cn("max-w-[85%] rounded-2xl px-3 py-1.5 text-sm", m.direction === "inbound" ? "self-start bg-card" : "brand-gradient self-end text-white")}>
            {m.body}
          </div>
        ))}
      </div>
      <form
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!text.trim()) return;
          const msg = text;
          setText("");
          start(async () => setT(await testSend(automationId, msg, asComment)));
        }}
      >
        <div className="flex gap-2">
          <Input value={text} onChange={(e) => setText(e.target.value)} placeholder={asComment ? "Write a test comment…" : "Write a test DM…"} aria-label="Test message" />
          <Button size="icon" variant="gradient" disabled={pending} aria-label="Send test message"><Send /></Button>
        </div>
        <div className="flex items-center justify-between text-xs">
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={asComment} onChange={(e) => setAsComment(e.target.checked)} /> Send as a post comment
          </label>
          <button type="button" className="flex items-center gap-1 text-muted-foreground hover:text-foreground" onClick={() => start(async () => setT(await testReset(automationId)))}>
            <RotateCcw className="size-3" /> Reset
          </button>
        </div>
      </form>
      {t && (
        <div className="rounded-xl border p-3 text-xs">
          <p className="mb-1 font-medium">Test contact</p>
          <p className="text-muted-foreground">
            Score {t.contact.leadScore} · {t.contact.stage} {t.contact.email && `· ${t.contact.email}`}
          </p>
          {t.contact.tags.length > 0 && <div className="mt-1 flex flex-wrap gap-1">{t.contact.tags.map((x) => <Badge key={x} tone="primary">{x}</Badge>)}</div>}
          {Object.keys(t.contact.fields).length > 0 && (
            <p className="mt-1 text-muted-foreground">{Object.entries(t.contact.fields).map(([k, v]) => `${k}: ${v}`).join(" · ")}</p>
          )}
          {t.status && <p className="mt-2 font-medium">Run: {t.status}</p>}
          <ol className="mt-1 flex flex-col gap-1">
            {t.log.map((l, i) => (
              <li key={i} className="flex gap-1.5">
                <LogIcon status={l.status} />
                <span>{l.message}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

function LogIcon({ status }: { status: string }) {
  if (status === "ok") return <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-success" />;
  if (status === "error") return <XCircle className="mt-0.5 size-3.5 shrink-0 text-destructive" />;
  if (status === "waiting") return <Clock className="mt-0.5 size-3.5 shrink-0 text-warning" />;
  return <span className="mt-1 size-2 shrink-0 rounded-full bg-muted-foreground" />;
}

function RunsPanel({ runs }: { runs: RunRow[] }) {
  const [open, setOpen] = useState<string | null>(null);
  if (!runs.length) return <p className="text-sm text-muted-foreground">No live runs in the last 30 days. Runs appear here with a step-by-step log once real contacts trigger this automation.</p>;
  return (
    <ul className="flex flex-col gap-2">
      {runs.map((r) => (
        <li key={r.id} className="rounded-xl border">
          <button className="flex w-full items-center gap-2 p-3 text-left text-sm" onClick={() => setOpen(open === r.id ? null : r.id)} aria-expanded={open === r.id}>
            <Badge tone={r.status === "completed" ? "success" : r.status === "failed" ? "danger" : "warning"}>{r.status}</Badge>
            <span className="flex-1 text-muted-foreground">{timeAgo(r.startedAt)}</span>
            {r.contactId && <Link href={`/contacts/${r.contactId}`} className="text-xs text-primary hover:underline" onClick={(e) => e.stopPropagation()}>Contact</Link>}
          </button>
          {open === r.id && (
            <ol className="flex flex-col gap-1 border-t p-3 text-xs">
              {r.error && <li className="text-destructive">{r.error}</li>}
              {r.log.map((l, i) => (
                <li key={i} className="flex gap-1.5"><LogIcon status={l.status} /><span>{l.message}</span></li>
              ))}
            </ol>
          )}
        </li>
      ))}
    </ul>
  );
}
