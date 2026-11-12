"use client";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { ArrowLeft, Bot, Flag, Lock, Send, Sparkles, UserRound, AlertTriangle, CheckCheck, FlaskConical } from "lucide-react";
import type { Contact, Conversation, Message } from "@/db/schema";
import { Avatar, Badge, Select, Textarea, Input } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { cn, timeAgo, stageLabel } from "@/lib/utils";
import { markRead, sendReply, simulateDemoInbound, suggestReply, updateConversation } from "@/lib/actions/inbox";
import { messagingWindow } from "@/lib/meta-parse";

type Msg = Message & { author: string | null };

export function Thread({
  conversation: conv,
  contact,
  messages,
  team,
  savedReplies,
  currentUserId,
  backHref,
}: {
  conversation: Conversation;
  contact: Contact;
  messages: Msg[];
  team: { id: string; name: string }[];
  savedReplies: { id: string; title: string; body: string }[];
  currentUserId: string;
  backHref: string;
}) {
  const [text, setText] = useState("");
  const [internal, setInternal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [suggesting, startSuggest] = useTransition();
  const bottom = useRef<HTMLDivElement>(null);
  const isDemo = conv.channel === "demo";

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);
  useEffect(() => {
    if (conv.unreadCount > 0) void markRead(conv.id);
  }, [conv.id, conv.unreadCount]);

  const window = isDemo ? { allowed: true as const, tag: null } : messagingWindow(conv.lastInboundAt ? new Date(conv.lastInboundAt) : null, "agent");

  const submit = () => {
    if (!text.trim()) return;
    setError(null);
    start(async () => {
      const r = await sendReply(conv.id, text, internal);
      if (!r.ok) setError(r.error ?? "Failed to send");
      else setText("");
    });
  };

  return (
    <div className="flex min-w-0 flex-1">
      <section className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b px-4 py-3">
          <Link href={backHref} className="md:hidden" aria-label="Back"><ArrowLeft className="size-5" /></Link>
          <Avatar name={contact.name} src={contact.avatarUrl} />
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{contact.name}</p>
            <p className="text-xs capitalize text-muted-foreground">{conv.channel}{contact.instagramUsername && ` · @${contact.instagramUsername}`}</p>
          </div>
          <Button
            variant={conv.humanTakeover ? "secondary" : "outline"}
            size="sm"
            onClick={() => start(() => updateConversation(conv.id, { humanTakeover: !conv.humanTakeover }))}
            title={conv.humanTakeover ? "Automations and AI are paused for this conversation" : "Automations and AI can reply"}
          >
            {conv.humanTakeover ? <><UserRound /> Human mode</> : <><Bot /> Bot mode</>}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-pressed={conv.priority}
            aria-label="Toggle priority"
            onClick={() => start(() => updateConversation(conv.id, { priority: !conv.priority }))}
          >
            <Flag className={cn(conv.priority && "fill-destructive text-destructive")} />
          </Button>
          <Button variant="outline" size="sm" onClick={() => start(() => updateConversation(conv.id, { status: conv.status === "closed" ? "open" : "closed" }))}>
            <CheckCheck /> {conv.status === "closed" ? "Reopen" : "Close"}
          </Button>
        </header>

        <div className="flex-1 overflow-y-auto p-4">
          <ul className="mx-auto flex max-w-3xl flex-col gap-3">
            {messages.map((m) => {
              const out = m.direction === "outbound";
              return (
                <li key={m.id} className={cn("flex flex-col", out ? "items-end" : "items-start")}>
                  <div
                    className={cn(
                      "max-w-[80%] whitespace-pre-wrap rounded-2xl px-4 py-2 text-sm",
                      m.isInternalNote
                        ? "border border-dashed border-warning bg-warning/10"
                        : out
                          ? m.status === "failed"
                            ? "border border-destructive/50 bg-destructive/10"
                            : m.senderType === "agent"
                              ? "bg-primary text-primary-foreground"
                              : "brand-gradient text-white"
                          : "bg-muted",
                    )}
                  >
                    {m.body}
                  </div>
                  <p className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
                    {m.isInternalNote && <><Lock className="size-3" /> Internal note ·</>}
                    {out && !m.isInternalNote && (m.senderType === "ai" ? "AI assistant" : m.senderType === "automation" ? "Automation" : m.author ?? "Team")}
                    {out && " · "}
                    {timeAgo(m.createdAt)}
                    {m.status === "simulated" && !m.isInternalNote && " · simulated (not sent)"}
                    {m.status === "failed" && <span className="text-destructive"> · not delivered: {m.error}</span>}
                  </p>
                </li>
              );
            })}
          </ul>
          <div ref={bottom} />
        </div>

        <div className="border-t p-3">
          {!window.allowed && !internal && (
            <p className="mb-2 flex items-center gap-2 rounded-lg bg-warning/10 px-3 py-2 text-xs"><AlertTriangle className="size-4 text-warning" /> {window.reason}</p>
          )}
          {window.allowed && window.tag && !internal && (
            <p className="mb-2 text-xs text-muted-foreground">Outside the 24-hour window: this reply will be sent with Meta’s HUMAN_AGENT tag (allowed for 7 days).</p>
          )}
          {error && <p className="mb-2 text-xs text-destructive" role="alert">{error}</p>}
          <div className={cn("rounded-xl border bg-card", internal && "border-warning bg-warning/5")}>
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
              }}
              placeholder={internal ? "Write an internal note (only your team sees this)…" : "Write a reply…  (Ctrl/⌘ + Enter to send)"}
              className="min-h-16 resize-none border-0 shadow-none focus-visible:outline-none"
              aria-label="Message"
            />
            <div className="flex flex-wrap items-center gap-2 border-t px-2 py-1.5">
              <div className="flex rounded-lg bg-muted p-0.5 text-xs">
                <button className={cn("rounded-md px-2 py-1", !internal && "bg-card shadow-sm")} onClick={() => setInternal(false)}>Reply</button>
                <button className={cn("rounded-md px-2 py-1", internal && "bg-card shadow-sm")} onClick={() => setInternal(true)}>Internal note</button>
              </div>
              {savedReplies.length > 0 && (
                <Select className="h-8 w-40 text-xs" value="" onChange={(e) => setText(savedReplies.find((r) => r.id === e.target.value)?.body ?? text)} aria-label="Saved replies">
                  <option value="">Saved replies…</option>
                  {savedReplies.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}
                </Select>
              )}
              <Button
                variant="ghost"
                size="sm"
                disabled={suggesting}
                onClick={() =>
                  startSuggest(async () => {
                    setError(null);
                    const r = await suggestReply(conv.id);
                    if (r.ok && r.text) setText(r.text);
                    else setError(r.error ?? "Could not generate a suggestion");
                  })
                }
              >
                <Sparkles /> {suggesting ? "Thinking…" : "AI suggest"}
              </Button>
              <div className="flex-1" />
              <Button size="sm" variant="gradient" onClick={submit} disabled={pending || !text.trim()}>
                <Send /> {internal ? "Add note" : "Send"}
              </Button>
            </div>
          </div>
          {isDemo && <DemoSimulator conversationId={conv.id} />}
        </div>
      </section>

      <aside className="hidden w-72 shrink-0 flex-col gap-5 overflow-y-auto border-l p-4 xl:flex">
        <div className="flex flex-col items-center text-center">
          <Avatar name={contact.name} src={contact.avatarUrl} className="size-16 text-lg" />
          <p className="mt-2 font-medium">{contact.name}</p>
          <p className="text-xs text-muted-foreground">{contact.email ?? contact.phone ?? "No email yet"}</p>
          <Link href={`/contacts/${contact.id}`} className="mt-2 text-xs text-primary hover:underline">View full profile</Link>
        </div>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div><dt className="text-xs text-muted-foreground">Stage</dt><dd>{stageLabel(contact.stage)}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Lead score</dt><dd>{contact.leadScore} · <span className="capitalize">{contact.temperature}</span></dd></div>
        </dl>
        <div>
          <p className="mb-1 text-xs text-muted-foreground">Tags</p>
          <div className="flex flex-wrap gap-1">{contact.tags.length ? contact.tags.map((t) => <Badge key={t} tone="primary">{t}</Badge>) : <span className="text-sm text-muted-foreground">None</span>}</div>
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted-foreground" htmlFor="assignee">Assigned to</label>
          <Select id="assignee" value={conv.assignedTo ?? ""} onChange={(e) => start(() => updateConversation(conv.id, { assignedTo: e.target.value || null }))}>
            <option value="">Unassigned</option>
            {team.map((t) => <option key={t.id} value={t.id}>{t.id === currentUserId ? `${t.name} (you)` : t.name}</option>)}
          </Select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted-foreground" htmlFor="status">Status</label>
          <Select id="status" value={conv.status} onChange={(e) => start(() => updateConversation(conv.id, { status: e.target.value as "open" }))}>
            <option value="open">Open</option>
            <option value="pending">Pending</option>
            <option value="closed">Closed</option>
          </Select>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const v = new FormData(e.currentTarget).get("labels") as string;
            start(() => updateConversation(conv.id, { labels: v.split(",") }));
          }}
        >
          <label className="mb-1 block text-xs text-muted-foreground" htmlFor="labels">Labels</label>
          <Input id="labels" name="labels" defaultValue={conv.labels.join(", ")} placeholder="billing, urgent" />
        </form>
        {Object.keys(contact.customFields ?? {}).length > 0 && (
          <div>
            <p className="mb-1 text-xs text-muted-foreground">Collected answers</p>
            <dl className="flex flex-col gap-1 text-sm">
              {Object.entries(contact.customFields).map(([k, v]) => (
                <div key={k}><dt className="inline text-muted-foreground">{k}: </dt><dd className="inline">{v}</dd></div>
              ))}
            </dl>
          </div>
        )}
      </aside>
    </div>
  );
}

function DemoSimulator({ conversationId }: { conversationId: string }) {
  const [text, setText] = useState("");
  const [pending, start] = useTransition();
  return (
    <form
      className="mt-2 flex items-center gap-2 rounded-xl border border-dashed border-warning/60 bg-warning/5 p-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!text.trim()) return;
        start(async () => {
          await simulateDemoInbound(conversationId, text);
          setText("");
        });
      }}
    >
      <FlaskConical className="size-4 shrink-0 text-warning" />
      <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Demo: type as the customer to see automations/AI respond" className="h-8 text-xs" aria-label="Simulate customer message" />
      <Button size="sm" variant="outline" disabled={pending}>Send as customer</Button>
    </form>
  );
}
