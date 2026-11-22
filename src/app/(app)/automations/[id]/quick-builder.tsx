"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  ArrowLeft,
  Save,
  Rocket,
  Pause,
  Trash2,
  Plus,
  X,
  Link2,
  ImageIcon,
  Sparkles,
  RotateCcw,
  Send,
  Info,
  CheckCircle2,
  Loader2,
  MessageCircle,
  Heart,
} from "lucide-react";
import type { Automation } from "@/db/schema";
import {
  BUTTON_MAX,
  FOLLOW_UP_DELAYS,
  MAX_LINKS,
  MAX_PUBLIC_REPLIES,
  TEXT_MAX,
  validateCommentFlow,
  type CommentFlow,
  type FlowLink,
  type PostSnapshot,
} from "@/lib/comment-flow";
import type { RecentPost } from "@/lib/meta";
import { Alert, Badge, Input, Textarea } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  deleteAutomation,
  listRecentPosts,
  saveCommentFlow,
  setAutomationStatus,
  testReset,
  testSend,
  testState,
  type TestTranscript,
} from "@/lib/actions/automations";

type SerializedAutomation = Omit<Automation, "createdAt" | "updatedAt"> & { createdAt: string; updatedAt: string };

const delayLabel = (m: number) => (m < 60 ? `${m} minutes` : m === 60 ? "1 hour" : m >= 1380 ? "23 hours" : `${m / 60} hours`);

function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={cn("relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors", on ? "bg-primary" : "bg-muted-foreground/30")}
    >
      <span className={cn("inline-block size-5 rounded-full bg-white shadow transition-transform", on ? "translate-x-5" : "translate-x-0.5")} />
    </button>
  );
}

function Section({ step, title, hint, children, right }: { step?: number; title: string; hint?: string; children?: React.ReactNode; right?: React.ReactNode }) {
  return (
    <section className="rounded-2xl border bg-card p-4 shadow-sm sm:p-5">
      <div className="flex items-start gap-3">
        {step !== undefined && (
          <span className="brand-gradient flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white">{step}</span>
        )}
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold leading-7">{title}</h3>
          {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
        </div>
        {right}
      </div>
      {children && <div className="mt-4 space-y-3">{children}</div>}
    </section>
  );
}

function Choice({ checked, onClick, title, hint }: { checked: boolean; onClick: () => void; title: string; hint?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={checked}
      className={cn(
        "flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-colors",
        checked ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-muted",
      )}
    >
      <span className={cn("mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border-2", checked ? "border-primary" : "border-muted-foreground/40")}>
        {checked && <span className="size-2 rounded-full bg-primary" />}
      </span>
      <span>
        <span className="block text-sm font-medium">{title}</span>
        {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
      </span>
    </button>
  );
}

function Counted({ value, onChange, max, rows = 4, placeholder, label }: { value: string; onChange: (v: string) => void; max: number; rows?: number; placeholder?: string; label: string }) {
  return (
    <div>
      <Textarea aria-label={label} value={value} rows={rows} maxLength={max} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      <p className="mt-1 text-right text-xs text-muted-foreground">{max - value.length} left</p>
    </div>
  );
}

export function QuickBuilder({ automation: a, metaConnected, canDelete }: { automation: SerializedAutomation; metaConnected: boolean; canDelete: boolean }) {
  const [name, setName] = useState(a.name);
  const [channels, setChannels] = useState<string[]>(a.channels);
  const [words, setWords] = useState(a.keywords.join(", "));
  const [flow, setFlow] = useState<CommentFlow>(a.quick!);
  const [status, setStatus] = useState(a.status);
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState<{ tone: "success" | "danger"; text: string; problems?: string[] } | null>(null);
  const [pending, start] = useTransition();
  const [tab, setTab] = useState<"post" | "comments" | "dm" | "test">("dm");
  const [posts, setPosts] = useState<RecentPost[] | null>(null);
  const [postsError, setPostsError] = useState<string | null>(null);
  const [showAllPosts, setShowAllPosts] = useState(false);
  const [newLink, setNewLink] = useState<FlowLink | null>(null);

  const keywords = useMemo(() => words.split(",").map((w) => w.trim()).filter(Boolean), [words]);
  const problems = validateCommentFlow(flow, keywords);
  const update = (patch: Partial<CommentFlow>) => {
    setFlow((f) => ({ ...f, ...patch }));
    setDirty(true);
  };

  useEffect(() => {
    if (flow.postMode !== "specific" || posts) return;
    listRecentPosts().then((r) => {
      setPosts(r.posts);
      setPostsError(r.error ?? null);
    });
  }, [flow.postMode, posts]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const payload = () => ({ name, channels: channels as ("instagram" | "messenger")[], keywords, flow });

  const save = (goLive = false) =>
    start(async () => {
      const r = await saveCommentFlow(a.id, payload(), goLive);
      if (!r.ok) return setMsg({ tone: "danger", text: r.error ?? "Couldn't save.", problems: r.problems });
      setDirty(false);
      if (goLive) {
        setStatus("active");
        setMsg({ tone: "success", text: "You're live! Comments that match will now get your DM." });
      } else setMsg({ tone: "success", text: status === "active" ? "Saved. Your live automation is updated." : "Saved as a draft." });
    });

  const pause = () =>
    start(async () => {
      const r = await setAutomationStatus(a.id, "paused");
      if (r.ok) {
        setStatus("paused");
        setMsg({ tone: "success", text: "Paused. Nobody gets these DMs until you go live again." });
      } else setMsg({ tone: "danger", text: r.error ?? "Couldn't pause." });
    });

  const togglePost = (p: RecentPost) => {
    const has = flow.postIds.includes(p.id);
    const snap: PostSnapshot = { id: p.id, thumb: p.thumb, caption: p.caption, channel: p.channel };
    update({
      postIds: has ? flow.postIds.filter((id) => id !== p.id) : [...flow.postIds, p.id],
      posts: has ? flow.posts.filter((x) => x.id !== p.id) : [...flow.posts, snap],
    });
  };

  const visiblePosts = posts ? (showAllPosts ? posts : posts.slice(0, 8)) : [];
  let step = 0;

  return (
    <div className="-m-4 min-h-[calc(100vh-4rem)] bg-muted/30 sm:-m-6">
      {/* Top bar */}
      <div className="sticky top-0 z-20 flex flex-wrap items-center gap-2 border-b bg-card/95 px-4 py-3 backdrop-blur sm:px-6">
        <Link href="/automations" className="rounded-lg p-1.5 hover:bg-muted" aria-label="Back to automations">
          <ArrowLeft className="size-4" />
        </Link>
        <Input
          aria-label="Automation name"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setDirty(true);
          }}
          className="h-9 max-w-64 border-transparent bg-transparent font-semibold shadow-none hover:border-input"
        />
        <Badge tone={status === "active" ? "success" : status === "paused" ? "warning" : "default"}>{status === "active" ? "Live" : status === "paused" ? "Paused" : "Draft"}</Badge>
        {dirty && <span className="text-xs text-muted-foreground">Unsaved changes</span>}
        <div className="ml-auto flex items-center gap-2">
          {canDelete && (
            <form action={deleteAutomation} onSubmit={(e) => !confirm("Delete this automation?") && e.preventDefault()}>
              <input type="hidden" name="id" value={a.id} />
              <Button variant="ghost" size="icon" aria-label="Delete automation" title="Delete">
                <Trash2 />
              </Button>
            </form>
          )}
          <Button variant="outline" onClick={() => save(false)} disabled={pending}>
            {pending ? <Loader2 className="animate-spin" /> : <Save />} Save
          </Button>
          {status === "active" ? (
            <Button variant="outline" onClick={pause} disabled={pending}>
              <Pause /> Pause
            </Button>
          ) : (
            <Button variant="gradient" onClick={() => save(true)} disabled={pending}>
              <Rocket /> Go live
            </Button>
          )}
        </div>
      </div>

      <div className="mx-auto grid max-w-6xl gap-6 p-4 sm:p-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        {/* Settings */}
        <div className="space-y-4">
          {!metaConnected && (
            <Alert tone="warning" title="Instagram and Facebook aren't connected yet">
              You can set this up now. It starts working once you connect on the <Link href="/integrations" className="underline">Integrations</Link> page.
            </Alert>
          )}
          {msg && (
            <Alert tone={msg.tone} title={msg.text}>
              {msg.problems?.length ? (
                <ul className="list-disc pl-5">
                  {msg.problems.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              ) : null}
            </Alert>
          )}

          <Section step={++step} title="Which post should this work on?">
            <div className="flex flex-wrap gap-2">
              {(["instagram", "messenger"] as const).map((ch) => (
                <label key={ch} className={cn("flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1 text-sm", channels.includes(ch) && "border-primary bg-primary/5")}>
                  <input
                    type="checkbox"
                    className="accent-[var(--primary)]"
                    checked={channels.includes(ch)}
                    onChange={(e) => {
                      setChannels(e.target.checked ? [...channels, ch] : channels.filter((c) => c !== ch));
                      setDirty(true);
                    }}
                  />
                  {ch === "instagram" ? "Instagram" : "Facebook"}
                </label>
              ))}
            </div>
            <Choice checked={flow.postMode === "specific"} onClick={() => update({ postMode: "specific" })} title="A specific post or reel" hint="Pick one or more of your posts." />
            {flow.postMode === "specific" && (
              <div className="rounded-xl bg-muted/50 p-3">
                {!posts && !postsError && (
                  <p className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" /> Loading your posts…
                  </p>
                )}
                {postsError && <p className="text-sm text-destructive">{postsError}</p>}
                {posts && posts.length === 0 && !postsError && <p className="text-sm text-muted-foreground">No posts found yet.</p>}
                {visiblePosts.length > 0 && (
                  <div className="grid grid-cols-4 gap-2">
                    {visiblePosts.map((p) => {
                      const on = flow.postIds.includes(p.id);
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => togglePost(p)}
                          title={p.caption || "Post"}
                          aria-pressed={on}
                          className={cn("relative aspect-[4/5] overflow-hidden rounded-lg border-2 bg-muted", on ? "border-primary" : "border-transparent opacity-80 hover:opacity-100")}
                        >
                          {p.thumb ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={p.thumb} alt={p.caption || "Post"} className="size-full object-cover" />
                          ) : (
                            <span className="flex size-full items-center justify-center p-1 text-[10px] text-muted-foreground">{p.caption.slice(0, 40) || "Video"}</span>
                          )}
                          {on && <CheckCircle2 className="absolute top-1 right-1 size-4 rounded-full bg-white text-primary" />}
                          <span className="absolute bottom-0 left-0 rounded-tr bg-black/60 px-1 text-[9px] text-white">{p.channel === "instagram" ? "IG" : "FB"}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
                {posts && posts.length > 8 && (
                  <button type="button" onClick={() => setShowAllPosts(!showAllPosts)} className="mt-2 text-sm font-medium text-primary">
                    {showAllPosts ? "Show fewer" : `Show all ${posts.length}`}
                  </button>
                )}
              </div>
            )}
            <Choice checked={flow.postMode === "any"} onClick={() => update({ postMode: "any" })} title="Any post or reel" hint="Works on every post, old and new." />
            <Choice
              checked={flow.postMode === "next"}
              onClick={() => update({ postMode: "next" })}
              title="My next post or reel"
              hint="Set it up now, then post. It locks onto the first new post that gets a comment."
            />
          </Section>

          <Section step={++step} title="Which comments should get a DM?">
            <Choice checked={!flow.anyWord} onClick={() => update({ anyWord: false })} title="Comments with certain words" />
            {!flow.anyWord && (
              <div className="pl-7">
                <Input
                  aria-label="Trigger words"
                  value={words}
                  placeholder="e.g. link, info, price"
                  onChange={(e) => {
                    setWords(e.target.value);
                    setDirty(true);
                  }}
                />
                <p className="mt-1 text-xs text-muted-foreground">Separate words with commas. Add common typos too (for example: link, lnk, links).</p>
                <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                  Try:
                  {["LINK", "INFO", "PRICE", "GUIDE"].map((w) => (
                    <button
                      key={w}
                      type="button"
                      onClick={() => {
                        if (!keywords.map((k) => k.toLowerCase()).includes(w.toLowerCase())) setWords(keywords.length ? `${words.replace(/,\s*$/, "")}, ${w}` : w);
                        setDirty(true);
                      }}
                      className="rounded-full border bg-card px-2 py-0.5 font-medium text-foreground hover:bg-muted"
                    >
                      + {w}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <Choice checked={flow.anyWord} onClick={() => update({ anyWord: true })} title="Any comment" hint="Everyone who comments gets the DM." />
          </Section>

          <Section
            step={++step}
            title="Reply to the comment publicly"
            hint="Shows others it works, which brings in more comments. One reply is picked at random each time so it looks natural."
            right={<Switch label="Reply publicly" on={flow.publicReplyOn} onChange={(v) => update({ publicReplyOn: v })} />}
          >
            {flow.publicReplyOn && (
              <>
                {flow.publicReplies.map((r, i) => (
                  <div key={i} className="flex gap-2">
                    <Input
                      aria-label={`Public reply ${i + 1}`}
                      value={r}
                      maxLength={300}
                      onChange={(e) => update({ publicReplies: flow.publicReplies.map((x, j) => (j === i ? e.target.value : x)) })}
                    />
                    {flow.publicReplies.length > 1 && (
                      <Button variant="ghost" size="icon" aria-label="Remove reply" onClick={() => update({ publicReplies: flow.publicReplies.filter((_, j) => j !== i) })}>
                        <X />
                      </Button>
                    )}
                  </div>
                ))}
                {flow.publicReplies.length < MAX_PUBLIC_REPLIES && (
                  <Button variant="outline" size="sm" onClick={() => update({ publicReplies: [...flow.publicReplies, ""] })}>
                    <Plus /> Add another reply
                  </Button>
                )}
              </>
            )}
          </Section>

          <Section
            step={++step}
            title="Opening DM with a button"
            hint="Recommended. Instagram only lets you send one message to someone who commented until they reply. Tapping your button counts as a reply, so the rest of your messages can go through."
            right={<Switch label="Opening DM" on={flow.opening.on} onChange={(v) => update({ opening: { ...flow.opening, on: v } })} />}
          >
            {flow.opening.on && (
              <>
                <Counted label="Opening message" value={flow.opening.text} max={TEXT_MAX} onChange={(v) => update({ opening: { ...flow.opening, text: v } })} />
                <Input aria-label="Opening button label" value={flow.opening.button} maxLength={BUTTON_MAX} placeholder="Button label" onChange={(e) => update({ opening: { ...flow.opening, button: e.target.value } })} />
              </>
            )}
          </Section>

          <Section
            step={++step}
            title="Ask them to follow you first"
            hint="Instagram only. When they tap the button, we check they follow you before sending the link."
            right={<Switch label="Ask to follow" on={flow.follow.on} onChange={(v) => update({ follow: { ...flow.follow, on: v } })} />}
          >
            {flow.follow.on && (
              <>
                <Counted label="Follow message" value={flow.follow.text} max={TEXT_MAX} onChange={(v) => update({ follow: { ...flow.follow, text: v } })} />
                <Input aria-label="Follow button label" value={flow.follow.button} maxLength={BUTTON_MAX} placeholder="Button label" onChange={(e) => update({ follow: { ...flow.follow, button: e.target.value } })} />
              </>
            )}
          </Section>

          <Section
            step={++step}
            title="Ask for their email"
            hint="Their email is saved to their contact, so you can follow up by email later."
            right={<Switch label="Ask for email" on={flow.email.on} onChange={(v) => update({ email: { ...flow.email, on: v } })} />}
          >
            {flow.email.on && <Counted label="Email question" rows={3} value={flow.email.text} max={TEXT_MAX} onChange={(v) => update({ email: { ...flow.email, text: v } })} />}
          </Section>

          <Section step={++step} title="Send your link" hint="The message with the button that opens your link.">
            <Counted label="Link message" rows={3} value={flow.link.text} max={TEXT_MAX} onChange={(v) => update({ link: { ...flow.link, text: v } })} />
            {flow.link.links.map((l, i) => (
              <div key={i} className="flex items-center gap-2 rounded-xl border bg-muted/40 px-3 py-2">
                <Link2 className="size-4 shrink-0 text-primary" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{l.label}</p>
                  <p className="truncate text-xs text-muted-foreground">{l.url}</p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setNewLink({ ...l, index: i } as FlowLink & { index: number })}>
                  Edit
                </Button>
                <Button variant="ghost" size="icon" aria-label="Remove link" onClick={() => update({ link: { ...flow.link, links: flow.link.links.filter((_, j) => j !== i) } })}>
                  <X />
                </Button>
              </div>
            ))}
            {newLink ? (
              <div className="space-y-2 rounded-xl border border-primary/40 bg-primary/5 p-3">
                <Input aria-label="Button label" autoFocus value={newLink.label} maxLength={BUTTON_MAX} placeholder="Button label, e.g. Get the guide" onChange={(e) => setNewLink({ ...newLink, label: e.target.value })} />
                <Input aria-label="Link" value={newLink.url} placeholder="Link, e.g. yoursite.com/guide" onChange={(e) => setNewLink({ ...newLink, url: e.target.value })} />
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setNewLink(null)}>
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    disabled={!newLink.label.trim() || !newLink.url.trim()}
                    onClick={() => {
                      const idx = (newLink as FlowLink & { index?: number }).index;
                      const item = { label: newLink.label.trim(), url: newLink.url.trim() };
                      const links = idx === undefined ? [...flow.link.links, item] : flow.link.links.map((x, j) => (j === idx ? item : x));
                      update({ link: { ...flow.link, links } });
                      setNewLink(null);
                    }}
                  >
                    Save link
                  </Button>
                </div>
              </div>
            ) : (
              flow.link.links.length < MAX_LINKS && (
                <Button variant="outline" className="w-full" onClick={() => setNewLink({ label: "", url: "" })}>
                  <Plus /> Add a link
                </Button>
              )
            )}
          </Section>

          <Section
            step={++step}
            title="Follow up if they don't tap the link"
            hint="We track taps on your link. If they haven't tapped it after the wait, they get one reminder."
            right={<Switch label="Follow-up" on={flow.followUp.on} onChange={(v) => update({ followUp: { ...flow.followUp, on: v } })} />}
          >
            {flow.followUp.on && (
              <>
                <Counted label="Follow-up message" rows={3} value={flow.followUp.text} max={TEXT_MAX} onChange={(v) => update({ followUp: { ...flow.followUp, text: v } })} />
                <label className="flex items-center gap-2 text-sm">
                  Send it after
                  <select
                    className="h-9 rounded-lg border border-input bg-card px-2 text-sm"
                    value={flow.followUp.delayMinutes}
                    onChange={(e) => update({ followUp: { ...flow.followUp, delayMinutes: Number(e.target.value) } })}
                  >
                    {FOLLOW_UP_DELAYS.map((m) => (
                      <option key={m} value={m}>
                        {delayLabel(m)}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            )}
          </Section>

          {problems.length > 0 && (
            <div className="flex gap-2 rounded-xl border border-dashed p-3 text-sm text-muted-foreground">
              <Info className="mt-0.5 size-4 shrink-0" />
              <div>
                <p className="font-medium text-foreground">Before you go live</p>
                <ul className="mt-1 list-disc pl-5">
                  {problems.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>

        {/* Preview */}
        <div className="lg:sticky lg:top-20 lg:self-start">
          <PhonePreview flow={flow} keywords={keywords} tab={tab} automationId={a.id} name={name} />
          <div className="mx-auto mt-3 flex w-fit rounded-full border bg-card p-1 text-sm shadow-sm" role="tablist">
            {(["post", "comments", "dm", "test"] as const).map((t) => (
              <button
                key={t}
                role="tab"
                aria-selected={tab === t}
                onClick={() => setTab(t)}
                className={cn("rounded-full px-3 py-1 font-medium capitalize", tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
              >
                {t === "dm" ? "DM" : t === "test" ? "Try it" : t}
              </button>
            ))}
          </div>
          {tab === "test" && dirty && <p className="mt-2 text-center text-xs text-muted-foreground">Try it uses your saved version. Press Save first to test your changes.</p>}
        </div>
      </div>
    </div>
  );
}

// ───────── Phone preview ─────────

function Bubble({ me, children, buttons }: { me?: boolean; children: React.ReactNode; buttons?: string[] }) {
  return (
    <div className={cn("flex", me ? "justify-end" : "justify-start")}>
      <div className={cn("max-w-[82%] rounded-2xl px-3 py-2 text-[13px] leading-snug whitespace-pre-wrap", me ? "brand-gradient rounded-br-md text-white" : "rounded-bl-md bg-white/10 text-white")}>
        {children}
        {buttons?.map((b, i) => (
          <div key={i} className="mt-2 rounded-lg bg-white/15 px-2 py-1.5 text-center text-[12px] font-semibold">
            {b || "Button"}
          </div>
        ))}
      </div>
    </div>
  );
}

const sample = (t: string) => t.replace(/\{\{\s*first_name\s*\}\}/g, "Sam").replace(/\{\{\s*name\s*\}\}/g, "Sam Lee").replace(/\{\{\s*[\w.]+\s*\}\}/g, "…");

function PhonePreview({ flow, keywords, tab, automationId, name }: { flow: CommentFlow; keywords: string[]; tab: string; automationId: string; name: string }) {
  const first = flow.posts[0];
  const comment = flow.anyWord ? "Love this! 🔥" : keywords[0] ?? "link";
  const reply = flow.publicReplies.find((r) => r.trim());
  return (
    <div className="mx-auto w-[300px] rounded-[2.6rem] bg-zinc-900 p-2.5 shadow-2xl ring-1 ring-black/20">
      <div className="relative h-[560px] overflow-hidden rounded-[2.1rem] bg-zinc-950 text-white">
        <div className="flex items-center justify-between px-6 pt-3 text-[11px] font-semibold">
          <span>9:41</span>
          <span className="h-5 w-20 rounded-full bg-black" />
          <span>●●●</span>
        </div>
        <div className="flex items-center gap-2 border-b border-white/10 px-4 py-2.5">
          <span className="brand-gradient size-7 rounded-full" />
          <span className="text-sm font-semibold">{tab === "dm" || tab === "test" ? "Your business" : "Posts"}</span>
        </div>

        {tab === "post" && (
          <div>
            <div className="flex aspect-[4/5] items-center justify-center bg-zinc-800">
              {flow.postMode === "specific" && first?.thumb ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={first.thumb} alt="" className="size-full object-cover" />
              ) : (
                <div className="px-8 text-center text-sm text-white/70">
                  <ImageIcon className="mx-auto mb-2 size-8 opacity-60" />
                  {flow.postMode === "next" ? "Works on your next post or reel" : flow.postMode === "any" ? "Works on all your posts and reels" : "Pick a post on the left"}
                </div>
              )}
            </div>
            <div className="flex gap-4 px-4 py-3">
              <Heart className="size-5" />
              <MessageCircle className="size-5" />
              <Send className="size-5" />
            </div>
            {flow.postMode === "specific" && flow.postIds.length > 1 && <p className="px-4 text-xs text-white/60">+ {flow.postIds.length - 1} more selected</p>}
          </div>
        )}

        {tab === "comments" && (
          <div className="space-y-4 p-4 text-[13px]">
            <div className="flex gap-2">
              <span className="size-7 shrink-0 rounded-full bg-zinc-700" />
              <div>
                <p>
                  <span className="font-semibold">sam.lee</span> {comment}
                </p>
                <p className="text-[11px] text-white/50">now · Reply</p>
              </div>
            </div>
            {flow.publicReplyOn && reply && (
              <div className="ml-9 flex gap-2">
                <span className="brand-gradient size-6 shrink-0 rounded-full" />
                <div>
                  <p>
                    <span className="font-semibold">you</span> {sample(reply)}
                  </p>
                  <p className="text-[11px] text-white/50">now · Reply</p>
                </div>
              </div>
            )}
            {!flow.publicReplyOn && <p className="text-center text-xs text-white/50">No public reply. They just get the DM.</p>}
          </div>
        )}

        {tab === "dm" && (
          <div className="space-y-2.5 overflow-y-auto p-3" style={{ maxHeight: 470 }}>
            {flow.opening.on && (
              <>
                <Bubble buttons={[flow.opening.button]}>{sample(flow.opening.text)}</Bubble>
                <Bubble me>{flow.opening.button || "Button"}</Bubble>
              </>
            )}
            {flow.follow.on && (
              <>
                <Bubble buttons={[flow.follow.button]}>{sample(flow.follow.text)}</Bubble>
                <Bubble me>{flow.follow.button || "Button"}</Bubble>
              </>
            )}
            {flow.email.on && (
              <>
                <Bubble>{sample(flow.email.text)}</Bubble>
                <Bubble me>sam@example.com</Bubble>
              </>
            )}
            <Bubble buttons={flow.link.links.length ? flow.link.links.map((l) => l.label) : ["Add a link"]}>{sample(flow.link.text) || "Your link message"}</Bubble>
            {flow.followUp.on && (
              <>
                <p className="py-1 text-center text-[11px] text-white/50">If no tap after {delayLabel(flow.followUp.delayMinutes)}</p>
                <Bubble buttons={flow.link.links.map((l) => l.label)}>{sample(flow.followUp.text)}</Bubble>
              </>
            )}
          </div>
        )}

        {tab === "test" && <TryIt automationId={automationId} name={name} keywords={keywords} anyWord={flow.anyWord} />}
      </div>
    </div>
  );
}

function TryIt({ automationId, keywords, anyWord }: { automationId: string; name: string; keywords: string[]; anyWord: boolean }) {
  const [t, setT] = useState<TestTranscript | null>(null);
  const [text, setText] = useState("");
  const [pending, start] = useTransition();
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    testState(automationId).then(setT);
  }, [automationId]);
  useEffect(() => {
    const box = end.current?.parentElement;
    if (box) box.scrollTop = box.scrollHeight;
  }, [t, pending]);
  const started = (t?.messages.length ?? 0) > 0;
  const send = () => {
    const body = text.trim();
    if (!body) return;
    setText("");
    start(async () => setT(await testSend(automationId, body, !started)));
  };
  const tapButton = (label: string) => start(async () => setT(await testSend(automationId, label, false)));
  return (
    <div className="flex h-[490px] flex-col">
      <div className="flex-1 space-y-2.5 overflow-y-auto p-3">
        {!started && (
          <div className="mt-10 px-4 text-center text-sm text-white/70">
            <Sparkles className="mx-auto mb-2 size-6" />
            Type a comment like <b>{anyWord ? "Love this!" : keywords[0] ?? "link"}</b> to see exactly what people get. Nothing is sent to anyone.
          </div>
        )}
        {t?.messages.map((m) => {
          const lines = m.body.split("\n");
          const buttons = lines.filter((l) => l.startsWith("🔘 ") || l.startsWith("🔗 "));
          const textPart = lines.filter((l) => !buttons.includes(l)).join("\n").trim();
          const inbound = m.direction === "inbound";
          return (
            <div key={m.id} className={cn("flex", inbound ? "justify-end" : "justify-start")}>
              <div className={cn("max-w-[85%] rounded-2xl px-3 py-2 text-[13px] leading-snug whitespace-pre-wrap", inbound ? "brand-gradient rounded-br-md text-white" : "rounded-bl-md bg-white/10")}>
                {textPart}
                {buttons.map((b, i) => {
                  const isLink = b.startsWith("🔗 ");
                  const label = isLink ? b.slice(3).split(" → ")[0] : b.slice(3);
                  const url = isLink ? b.split(" → ")[1] : undefined;
                  return isLink ? (
                    <a key={i} href={url} target="_blank" rel="noreferrer" className="mt-2 block rounded-lg bg-white/15 px-2 py-1.5 text-center text-[12px] font-semibold">
                      {label} ↗
                    </a>
                  ) : (
                    <button key={i} type="button" disabled={pending} onClick={() => tapButton(label!)} className="mt-2 block w-full rounded-lg bg-white/15 px-2 py-1.5 text-center text-[12px] font-semibold hover:bg-white/25">
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
        {pending && <Loader2 className="mx-auto size-4 animate-spin text-white/60" />}
        <div ref={end} />
      </div>
      <div className="flex gap-2 border-t border-white/10 p-2">
        <button type="button" aria-label="Start over" title="Start over" onClick={() => start(async () => setT(await testReset(automationId)))} className="rounded-full p-2 text-white/70 hover:bg-white/10">
          <RotateCcw className="size-4" />
        </button>
        <input
          aria-label={started ? "Reply" : "Comment"}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder={started ? "Reply…" : "Write a comment…"}
          className="min-w-0 flex-1 rounded-full bg-white/10 px-3 text-[13px] text-white placeholder:text-white/40 focus:outline-none"
        />
        <button type="button" aria-label="Send" onClick={send} disabled={pending} className="brand-gradient rounded-full p-2 text-white">
          <Send className="size-4" />
        </button>
      </div>
    </div>
  );
}
