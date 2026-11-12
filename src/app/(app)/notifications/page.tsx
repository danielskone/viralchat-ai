import Link from "next/link";
import { and, desc, eq, isNull } from "drizzle-orm";
import { Bell } from "lucide-react";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { notifications } from "@/db/schema";
import { requireWorkspace } from "@/lib/auth";
import { Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { cn, timeAgo } from "@/lib/utils";

export const metadata = { title: "Notifications" };

async function markAllRead() {
  "use server";
  const ctx = await requireWorkspace();
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.workspaceId, ctx.workspace.id), eq(notifications.userId, ctx.user.id), isNull(notifications.readAt)));
  revalidatePath("/", "layout");
}

export default async function NotificationsPage() {
  const ctx = await requireWorkspace();
  const rows = await db
    .select()
    .from(notifications)
    .where(and(eq(notifications.workspaceId, ctx.workspace.id), eq(notifications.userId, ctx.user.id)))
    .orderBy(desc(notifications.createdAt))
    .limit(100);
  return (
    <>
      <PageHeader title="Notifications" actions={<form action={markAllRead}><Button variant="outline">Mark all as read</Button></form>} />
      {rows.length === 0 ? (
        <EmptyState icon={<Bell />} title="You're all caught up" description="Automation alerts, human handoffs and limit warnings show up here." />
      ) : (
        <Card className="divide-y">
          {rows.map((n) => (
            <Link key={n.id} href={n.href ?? "#"} className={cn("flex gap-3 p-4 hover:bg-muted/50", !n.readAt && "bg-accent/30")}>
              <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.readAt ? "bg-muted" : "bg-primary")} />
              <div className="flex-1">
                <p className="text-sm font-medium">{n.title}</p>
                {n.body && <p className="text-sm text-muted-foreground">{n.body}</p>}
              </div>
              <span className="text-xs text-muted-foreground">{timeAgo(n.createdAt)}</span>
            </Link>
          ))}
        </Card>
      )}
    </>
  );
}
