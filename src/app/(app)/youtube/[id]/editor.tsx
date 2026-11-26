"use client";
import Link from "next/link";
import { useActionState, useMemo, useState, useTransition } from "react";
import { ArrowLeft, Save, Rocket, Pause, Trash2, Plus, X, Loader2, CheckCircle2, Info } from "lucide-react";
import { Alert, Badge, Input, Label, Textarea } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { YouTubeIcon } from "@/components/brand-icons";
import { cn } from "@/lib/utils";
import { deleteYoutubeAutomation, saveYoutubeAutomation, setYoutubeStatus } from "@/lib/actions/youtube";
import { YT_MAX_REPLIES, buildReply } from "@/lib/youtube-rules";

type Rule = {
  id: string;
  name: string;
  status: "draft" | "active" | "paused";
  anyWord: boolean;
  keywords: string[];
  videoIds: string[];
  replies: string[];
  link: string;
  repliesCount: number;
};

function Choice({ name, value, checked, onChange, children }: { name: string; value: string; checked: boolean; onChange: () => void; children: React.ReactNode }) {
  return (
    <label className={cn("flex cursor-pointer items-center gap-2 rounded-xl border p-3 text-sm", checked && "border-primary bg-accent")}>
      <input type="radio" name={name} value={value} checked={checked} onChange={onChange} className="accent-[var(--primary)]" />
      {children}
    </label>
  );
}

export function YoutubeEditor({ rule, channel, canDelete }: { rule: Rule; channel: string | null; canDelete: boolean }) {
  const [state, save, saving] = useActionState(saveYoutubeAutomation, null);
  const [status, setStatus] = useState(rule.status);
  const [statusMsg, setStatusMsg] = useState<{ error?: string; problems?: string[] } | null>(null);
  const [toggling, startToggle] = useTransition();
  const [anyWord, setAnyWord] = useState(rule.anyWord);
  const [videoMode, setVideoMode] = useState<"any" | "specific">(rule.videoIds.length ? "specific" : "any");
  const [replies, setReplies] = useState(rule.replies.length ? rule.replies : [""]);
  const [link, setLink] = useState(rule.link);
  const [keywords, setKeywords] = useState(rule.keywords.join(", "));
  const [previewIdx, setPreviewIdx] = useState(0);

  const preview = useMemo(() => {
    const r = replies[Math.min(previewIdx, replies.length - 1)] ?? "";
    return r.trim() ? buildReply({ replies: [r], link: link || "yoursite.com" }, "viewer") : "";
  }, [replies, previewIdx, link]);
  const sampleWord = anyWord ? "This is awesome!" : (keywords.split(",")[0]?.trim() || "LINK");

  const toggle = (next: "active" | "paused") =>
    startToggle(async () => {
      const form = document.getElementById("yt-form") as HTMLFormElement;
      await saveYoutubeAutomation(null, new FormData(form));
      const r = await setYoutubeStatus(rule.id, next);
      if (r.ok) {
        setStatus(next);
        setStatusMsg(null);
      } else setStatusMsg(r);
    });

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Link href="/youtube" className="rounded-lg p-2 hover:bg-muted" aria-label="Back"><ArrowLeft className="size-4" /></Link>
        <span className="flex size-8 items-center justify-center rounded-lg bg-red-600 text-white"><YouTubeIcon className="size-4" /></span>
        <h1 className="text-xl font-semibold">{rule.name}</h1>
        <Badge tone={status === "active" ? "success" : status === "paused" ? "warning" : "default"}>{status === "active" ? "live" : status}</Badge>
        <div className="ml-auto flex gap-2">
          <Button type="submit" form="yt-form" variant="outline" disabled={saving}>
            {saving ? <Loader2 className="animate-spin" /> : <Save />} Save
          </Button>
          {status === "active" ? (
            <Button variant="outline" onClick={() => toggle("paused")} disabled={toggling}><Pause /> Pause</Button>
          ) : (
            <Button variant="gradient" onClick={() => toggle("active")} disabled={toggling}>
              {toggling ? <Loader2 className="animate-spin" /> : <Rocket />} Go Live
            </Button>
          )}
        </div>
      </div>

      {!channel && (
        <div className="mb-4"><Alert tone="warning" title="YouTube isn't connected">Connect your channel on the <Link className="underline" href="/youtube">YouTube Replies</Link> page before going live.</Alert></div>
      )}
      {statusMsg?.error && (
        <div className="mb-4">
          <Alert tone="danger" title={statusMsg.error}>{statusMsg.problems?.length ? <ul className="list-disc pl-5">{statusMsg.problems.map((p) => <li key={p}>{p}</li>)}</ul> : null}</Alert>
        </div>
      )}
      {state?.error && (
        <div className="mb-4">
          <Alert tone="warning" title={state.error}>{state.problems?.length ? <ul className="list-disc pl-5">{state.problems.map((p) => <li key={p}>{p}</li>)}</ul> : null}</Alert>
        </div>
      )}
      {state?.ok && <p className="mb-4 flex items-center gap-1.5 text-sm text-success"><CheckCircle2 className="size-4" /> Saved</p>}

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <form id="yt-form" action={save} className="flex flex-col gap-6">
          <input type="hidden" name="id" value={rule.id} />
          <section className="flex flex-col gap-2">
            <Label htmlFor="name">Name</Label>
            <Input id="name" name="name" defaultValue={rule.name} maxLength={80} />
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="font-semibold">When someone comments on</h2>
            <div className="grid gap-2 sm:grid-cols-2">
              <Choice name="videoMode" value="any" checked={videoMode === "any"} onChange={() => setVideoMode("any")}>Any video or Short</Choice>
              <Choice name="videoMode" value="specific" checked={videoMode === "specific"} onChange={() => setVideoMode("specific")}>Specific videos</Choice>
            </div>
            {videoMode === "specific" && (
              <Textarea
                name="videos"
                rows={3}
                defaultValue={rule.videoIds.map((v) => `https://youtu.be/${v}`).join("\n")}
                placeholder={"Paste video links, one per line\nhttps://youtube.com/shorts/…"}
              />
            )}
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="font-semibold">And the comment has</h2>
            <div className="grid gap-2 sm:grid-cols-2">
              <Choice name="anyWord" value="words" checked={!anyWord} onChange={() => setAnyWord(false)}>A specific word</Choice>
              <Choice name="anyWord" value="any" checked={anyWord} onChange={() => setAnyWord(true)}>Any comment</Choice>
            </div>
            {!anyWord && (
              <>
                <Input name="keywords" value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder="LINK, info, price" />
                <p className="text-xs text-muted-foreground">Separate words with commas. Capital letters don’t matter.</p>
              </>
            )}
            {anyWord && <input type="hidden" name="keywords" value={keywords} />}
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="font-semibold">Your link</h2>
            <Input name="link" value={link} onChange={(e) => setLink(e.target.value)} placeholder="ncnorthpole.com/fairy-lights" />
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="font-semibold">They will get this reply under their comment</h2>
            <p className="text-xs text-muted-foreground">
              Use <code>{"{{name}}"}</code> for their @name and <code>{"{{link}}"}</code> for your link. Add up to {YT_MAX_REPLIES} versions and one is picked at random, so replies don’t all look the same.
            </p>
            {replies.map((r, i) => (
              <div key={i} className="flex items-start gap-2">
                <Textarea
                  name="reply"
                  rows={2}
                  value={r}
                  onFocus={() => setPreviewIdx(i)}
                  onChange={(e) => setReplies(replies.map((x, j) => (j === i ? e.target.value : x)))}
                />
                {replies.length > 1 && (
                  <button type="button" className="mt-2 rounded p-1 hover:bg-muted" aria-label="Remove reply" onClick={() => setReplies(replies.filter((_, j) => j !== i))}>
                    <X className="size-4" />
                  </button>
                )}
              </div>
            ))}
            {replies.length < YT_MAX_REPLIES && (
              <Button type="button" variant="ghost" size="sm" className="self-start" onClick={() => setReplies([...replies, ""])}><Plus /> Add another version</Button>
            )}
          </section>

          <Alert tone="info" title="Good to know">
            <ul className="list-disc pl-5">
              <li>YouTube has no private messages, so the link is posted as a public reply from your channel.</li>
              <li>New comments are checked every few minutes, so replies can take up to about 5 minutes.</li>
              <li>Comments YouTube holds for review, and your own comments, are skipped.</li>
            </ul>
          </Alert>

          {canDelete && (
            <div className="border-t pt-4">
              <Button formAction={deleteYoutubeAutomation} variant="ghost" className="text-destructive"><Trash2 /> Delete this reply</Button>
            </div>
          )}
        </form>

        <aside className="lg:sticky lg:top-6 lg:self-start">
          <div className="rounded-2xl border bg-card p-4 shadow-sm">
            <p className="mb-3 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground"><Info className="size-3.5" /> Preview</p>
            <div className="flex gap-3">
              <div className="size-8 shrink-0 rounded-full bg-muted" />
              <div className="text-sm">
                <p className="text-xs font-medium">@viewer</p>
                <p>{sampleWord}</p>
              </div>
            </div>
            <div className="ml-11 mt-3 flex gap-3">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-red-600 text-white"><YouTubeIcon className="size-3.5" /></span>
              <div className="min-w-0 text-sm">
                <p className="text-xs font-medium">{channel ?? "Your channel"}</p>
                <p className="whitespace-pre-wrap break-words">{preview || <span className="text-muted-foreground">Write a reply…</span>}</p>
              </div>
            </div>
            <p className="mt-4 text-xs text-muted-foreground">{rule.repliesCount.toLocaleString()} replies sent so far</p>
          </div>
        </aside>
      </div>
    </div>
  );
}
