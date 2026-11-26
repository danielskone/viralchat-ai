import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
import { Plus, CheckCircle2, AlertTriangle, MessageCircleReply } from "lucide-react";
import { db } from "@/db";
import { integrations, youtubeAutomations, youtubeReplies } from "@/db/schema";
import { requireWorkspace, hasRole } from "@/lib/auth";
import { youtubeConfig } from "@/lib/youtube";
import { createYoutubeAutomation } from "@/lib/actions/youtube";
import { Alert, Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState, PageHeader } from "@/components/ui/primitives";
import { Button, buttonVariants } from "@/components/ui/button";
import { YouTubeIcon } from "@/components/brand-icons";
import { timeAgo } from "@/lib/utils";
import { CheckYoutubeButton } from "./check-button";

export const metadata = { title: "YouTube Replies" };

export default async function YoutubePage({ searchParams }: PageProps<"/youtube">) {
  const ctx = await requireWorkspace();
  const sp = await searchParams;
  const [[yt], rules, recent] = await Promise.all([
    db.select().from(integrations).where(and(eq(integrations.workspaceId, ctx.workspace.id), eq(integrations.provider, "youtube"))).limit(1),
    db.select().from(youtubeAutomations).where(eq(youtubeAutomations.workspaceId, ctx.workspace.id)).orderBy(desc(youtubeAutomations.updatedAt)),
    db.select().from(youtubeReplies).where(eq(youtubeReplies.workspaceId, ctx.workspace.id)).orderBy(desc(youtubeReplies.createdAt)).limit(25),
  ]);
  const connected = yt?.status === "connected";
  const cfg = yt?.config ?? {};
  const isAdmin = hasRole(ctx.role, "admin");
  const configured = youtubeConfig().configured;

  return (
    <>
      <PageHeader
        title="YouTube Replies"
        description="When someone comments a keyword on your video, ViralChat replies under their comment with your link."
        actions={
          <form action={createYoutubeAutomation}>
            <Button variant="gradient"><Plus /> New YouTube reply</Button>
          </form>
        }
      />
      {sp.connected && <div className="mb-4"><Alert tone="success" title="YouTube connected">Now create a reply below and turn it on.</Alert></div>}

      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <span className="flex size-9 items-center justify-center rounded-xl bg-red-600 text-white"><YouTubeIcon className="size-5" /></span>
            {connected ? (
              <Badge tone="success"><CheckCircle2 className="size-3" /> Connected</Badge>
            ) : yt?.status === "error" ? (
              <Badge tone="danger"><AlertTriangle className="size-3" /> Needs attention</Badge>
            ) : (
              <Badge>Not connected</Badge>
            )}
          </div>
          <CardTitle className="mt-3">{connected ? cfg.channelTitle : "Connect your YouTube channel"}</CardTitle>
          <CardDescription>
            {connected
              ? `${cfg.channelHandle ? cfg.channelHandle + " · " : ""}New comments are checked every few minutes.${cfg.lastPolledAt ? ` Last checked ${timeAgo(cfg.lastPolledAt)}.` : ""}`
              : "YouTube doesn't have DMs, so ViralChat answers in the comments instead. Sign in with the Google account that owns your channel."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          {yt?.lastError && <Alert tone="danger">{yt.lastError}</Alert>}
          {!configured && (
            <Alert tone="warning" title="Server setup required">
              Set <strong>{youtubeConfig().missing.join(", ")}</strong> in Vercel (from your Google Cloud project) to turn on YouTube.
            </Alert>
          )}
          <div className="flex flex-wrap items-center gap-2">
            {configured && isAdmin && (
              <a href="/api/integrations/youtube/connect" className={buttonVariants({ variant: connected ? "outline" : "gradient" })}>
                {connected ? "Reconnect / change channel" : yt?.status === "error" ? "Reconnect YouTube" : "Connect YouTube"}
              </a>
            )}
            {connected && <CheckYoutubeButton />}
          </div>
        </CardContent>
      </Card>

      {rules.length === 0 ? (
        <EmptyState
          icon={<MessageCircleReply />}
          title="No YouTube replies yet"
          description="Example: someone comments “LINK” on your video, and you reply “Here you go @name 👉 yoursite.com”."
          action={
            <form action={createYoutubeAutomation}>
              <Button variant="gradient"><Plus /> Create your first one</Button>
            </form>
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {rules.map((r) => (
            <Card key={r.id} className="flex flex-col p-5 transition-shadow hover:shadow-md">
              <div className="flex items-start justify-between gap-2">
                <Link href={`/youtube/${r.id}`} className="font-semibold hover:underline">{r.name}</Link>
                <Badge tone={r.status === "active" ? "success" : r.status === "paused" ? "warning" : "default"}>{r.status === "active" ? "live" : r.status}</Badge>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{r.videoIds.length ? `${r.videoIds.length} video${r.videoIds.length === 1 ? "" : "s"}` : "Any video"} · {r.anyWord ? "any comment" : "keyword"}</p>
              {!r.anyWord && r.keywords.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1">{r.keywords.slice(0, 5).map((k) => <Badge key={k} tone="primary">{k}</Badge>)}</div>
              )}
              <div className="mt-auto flex items-center gap-3 pt-4 text-xs text-muted-foreground">
                <YouTubeIcon className="size-3.5" aria-label="YouTube" />
                <span>{r.repliesCount.toLocaleString()} replies</span>
                {r.lastReplyAt && <span>· last {timeAgo(r.lastReplyAt)}</span>}
              </div>
            </Card>
          ))}
        </div>
      )}

      {recent.length > 0 && (
        <>
          <h2 className="mb-3 mt-10 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Recent replies</h2>
          <Card className="divide-y">
            {recent.map((r) => (
              <div key={r.id} className="flex flex-col gap-1 p-4 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium">{r.authorName}</p>
                  <span className="text-xs text-muted-foreground">{timeAgo(r.createdAt)}</span>
                </div>
                <p className="text-muted-foreground">“{r.commentText}”</p>
                <p>
                  <span className={r.status === "sent" ? "text-success" : r.status === "failed" ? "text-destructive" : "text-muted-foreground"}>
                    {r.status === "sent" ? "Replied: " : r.status === "failed" ? "Failed: " : "Sending: "}
                  </span>
                  {r.status === "failed" ? r.error : r.replyText}
                </p>
                {r.videoId && (
                  <a className="text-xs text-primary underline" href={`https://www.youtube.com/watch?v=${r.videoId}&lc=${r.commentId}`} target="_blank" rel="noreferrer">
                    Open on YouTube
                  </a>
                )}
              </div>
            ))}
          </Card>
        </>
      )}
    </>
  );
}
