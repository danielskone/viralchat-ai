"use client";
import { useActionState, useState, useTransition } from "react";
import { Send, UserRound } from "lucide-react";
import type { Chatbot } from "@/db/schema";
import { Alert, Field, Input, Select, Textarea, Avatar } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { addKnowledge, askPreview, saveChatbot, type FormState } from "@/lib/actions/chatbot";
import { cn } from "@/lib/utils";

export function BotForm({ bot, disabled }: { bot: Chatbot | null; disabled: boolean }) {
  const [state, action] = useActionState<FormState, FormData>(saveChatbot, undefined);
  return (
    <form action={action} className="flex flex-col gap-4">
      <fieldset disabled={disabled} className="contents">
        {state?.error && <Alert tone="danger">{state.error}</Alert>}
        {state?.ok && <Alert tone="success">{state.ok}</Alert>}
        <label className="flex items-center justify-between rounded-xl border p-3">
          <span>
            <span className="block text-sm font-medium">Answer DMs automatically</span>
            <span className="text-xs text-muted-foreground">When no automation matches, the assistant replies.</span>
          </span>
          <input type="checkbox" name="enabled" defaultChecked={bot?.enabled} className="size-5 accent-[var(--color-primary)]" />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Assistant name" htmlFor="name"><Input id="name" name="name" defaultValue={bot?.name ?? "Ava"} required /></Field>
          <Field label="Profile picture URL" htmlFor="avatarUrl"><Input id="avatarUrl" name="avatarUrl" defaultValue={bot?.avatarUrl ?? ""} placeholder="https://" /></Field>
          <Field label="Tone" htmlFor="tone">
            <Select id="tone" name="tone" defaultValue={bot?.tone ?? "friendly"}>
              {["friendly", "professional", "playful", "warm and caring", "concise", "enthusiastic"].map((t) => <option key={t} value={t}>{t}</option>)}
            </Select>
          </Field>
          <Field label="Main objective" htmlFor="objective">
            <Select id="objective" name="objective" defaultValue={bot?.objective ?? "support"}>
              <option value="support">Customer support</option>
              <option value="sales">Sales assistant</option>
              <option value="booking">Book appointments</option>
              <option value="lead_qualification">Qualify leads</option>
            </Select>
          </Field>
          <Field label="Booking link (optional)" htmlFor="bookingUrl"><Input id="bookingUrl" name="bookingUrl" defaultValue={bot?.bookingUrl ?? ""} placeholder="https://cal.com/you" /></Field>
          <Field label="Language" htmlFor="languages" hint="“auto” replies in the customer’s language">
            <Input id="languages" name="languages" defaultValue={bot?.languages ?? "auto"} />
          </Field>
        </div>
        <Field label="Greeting" htmlFor="greeting"><Input id="greeting" name="greeting" defaultValue={bot?.greeting ?? "Hi! How can I help you today?"} /></Field>
        <Field label="Personality & brand voice" htmlFor="personality" hint="e.g. “Use emojis sparingly. Call customers ‘friend’. Never use slang.”">
          <Textarea id="personality" name="personality" defaultValue={bot?.personality ?? ""} rows={3} />
        </Field>
        <Field label="Handoff message" htmlFor="fallbackMessage" hint="Sent when the assistant can’t answer from your knowledge, then a human is alerted.">
          <Input id="fallbackMessage" name="fallbackMessage" defaultValue={bot?.fallbackMessage ?? "Great question — let me get a teammate to help you with that."} required />
        </Field>
        <Field label="Handoff keywords" htmlFor="handoffKeywords" hint="Comma separated. If a message contains one, a human takes over.">
          <Input id="handoffKeywords" name="handoffKeywords" defaultValue={(bot?.handoffKeywords ?? ["human", "agent", "person", "representative"]).join(", ")} />
        </Field>
        <fieldset className="flex gap-4 text-sm">
          <legend className="mb-1 text-sm font-medium">Channels</legend>
          {(["instagram", "messenger"] as const).map((c) => (
            <label key={c} className="flex items-center gap-1.5 capitalize">
              <input type="checkbox" name="channels" value={c} defaultChecked={bot ? bot.channels.includes(c) : true} /> {c}
            </label>
          ))}
        </fieldset>
        <SubmitButton variant="gradient" className="self-start">Save assistant</SubmitButton>
      </fieldset>
    </form>
  );
}

export function KnowledgeForm() {
  const [state, action] = useActionState<FormState, FormData>(addKnowledge, undefined);
  const [type, setType] = useState("faq");
  return (
    <form action={action} className="flex flex-col gap-3 rounded-xl bg-muted/50 p-3">
      {state?.error && <Alert tone="danger">{state.error}</Alert>}
      {state?.ok && <Alert tone="success">{state.ok}</Alert>}
      <div className="grid gap-2 sm:grid-cols-3">
        <Select name="type" value={type} onChange={(e) => setType(e.target.value)} aria-label="Type">
          <option value="faq">FAQ</option>
          <option value="text">Services / general info</option>
          <option value="pricing">Pricing</option>
          <option value="policy">Policy</option>
          <option value="url">Import web page</option>
        </Select>
        <Input name="title" placeholder="Title, e.g. Shipping & returns" className="sm:col-span-2" aria-label="Title" required />
      </div>
      {type === "url" ? (
        <Input name="sourceUrl" placeholder="https://yourwebsite.com/faq" aria-label="Page URL" required />
      ) : (
        <>
          <Textarea name="content" rows={4} placeholder={type === "faq" ? "Q: Do you ship internationally?\nA: Yes, to 40+ countries…" : "Paste the details here…"} aria-label="Content" />
          <Input type="file" name="file" accept=".txt,.md,.csv,text/plain" aria-label="Or upload a text file" />
        </>
      )}
      <SubmitButton size="sm" variant="secondary" className="self-start" pendingText="Adding…">Add knowledge</SubmitButton>
    </form>
  );
}

export function PreviewChat({ botName, greeting }: { botName: string; greeting: string }) {
  const [msgs, setMsgs] = useState<{ role: "user" | "bot" | "error"; text: string; handoff?: boolean }[]>([{ role: "bot", text: greeting }]);
  const [text, setText] = useState("");
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col gap-3">
      <div className="flex h-80 flex-col gap-2 overflow-y-auto rounded-xl bg-muted/50 p-3">
        {msgs.map((m, i) => (
          <div key={i} className={cn("flex items-end gap-2", m.role === "user" && "flex-row-reverse")}>
            {m.role !== "user" ? <Avatar name={botName} className="size-6 text-[10px]" /> : <UserRound className="size-5 text-muted-foreground" />}
            <div className={cn("max-w-[80%] rounded-2xl px-3 py-1.5 text-sm", m.role === "user" ? "bg-primary text-primary-foreground" : m.role === "error" ? "bg-destructive/10 text-destructive" : "bg-card")}>
              {m.text}
              {m.handoff && <p className="mt-1 text-[11px] opacity-70">→ would hand off to a human</p>}
            </div>
          </div>
        ))}
        {pending && <p className="text-xs text-muted-foreground">{botName} is typing…</p>}
      </div>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const q = text.trim();
          if (!q) return;
          setText("");
          setMsgs((m) => [...m, { role: "user", text: q }]);
          start(async () => {
            const r = await askPreview(q);
            setMsgs((m) => [...m, r.ok ? { role: "bot", text: r.text, handoff: r.handoff } : { role: "error", text: r.error }]);
          });
        }}
      >
        <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Ask something…" aria-label="Preview question" />
        <Button size="icon" variant="gradient" disabled={pending} aria-label="Send"><Send /></Button>
      </form>
    </div>
  );
}
