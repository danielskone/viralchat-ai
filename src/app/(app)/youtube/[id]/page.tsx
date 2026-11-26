import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { integrations, youtubeAutomations } from "@/db/schema";
import { requireWorkspace, hasRole } from "@/lib/auth";
import { YoutubeEditor } from "./editor";

export const metadata = { title: "YouTube reply" };

export default async function YoutubeAutomationPage({ params }: PageProps<"/youtube/[id]">) {
  const ctx = await requireWorkspace();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [[r], [yt]] = await Promise.all([
    db.select().from(youtubeAutomations).where(and(eq(youtubeAutomations.id, id), eq(youtubeAutomations.workspaceId, ctx.workspace.id))).limit(1),
    db.select().from(integrations).where(and(eq(integrations.workspaceId, ctx.workspace.id), eq(integrations.provider, "youtube"))).limit(1),
  ]);
  if (!r) notFound();
  return (
    <YoutubeEditor
      rule={{ id: r.id, name: r.name, status: r.status, anyWord: r.anyWord, keywords: r.keywords, videoIds: r.videoIds, replies: r.replies, link: r.link, repliesCount: r.repliesCount }}
      channel={yt?.status === "connected" ? (yt.config?.channelTitle ?? "Your channel") : null}
      canDelete={hasRole(ctx.role, "admin")}
    />
  );
}
