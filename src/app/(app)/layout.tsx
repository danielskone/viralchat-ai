import Link from "next/link";
import { redirect } from "next/navigation";
import { and, eq, isNull, sum, count } from "drizzle-orm";
import { db } from "@/db";
import { conversations, notifications } from "@/db/schema";
import { requireWorkspace } from "@/lib/auth";
import { hasAccess } from "@/lib/plans";
import { Sidebar } from "@/components/sidebar";
import { Topbar } from "@/components/topbar";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const ctx = await requireWorkspace();
  // The app is for paying (or trialing) workspaces; everyone else starts their trial first.
  if (!hasAccess(ctx.workspace)) redirect("/subscribe");
  const [[unread], [notif]] = await Promise.all([
    db.select({ n: sum(conversations.unreadCount) }).from(conversations).where(eq(conversations.workspaceId, ctx.workspace.id)),
    db
      .select({ n: count() })
      .from(notifications)
      .where(and(eq(notifications.workspaceId, ctx.workspace.id), eq(notifications.userId, ctx.user.id), isNull(notifications.readAt))),
  ]);
  return (
    <div className="min-h-screen">
      <Sidebar unread={Number(unread?.n ?? 0)} />
      <div className="lg:pl-64">
        <Topbar ctx={ctx} notificationCount={notif?.n ?? 0} />
        {ctx.workspace.demoMode && (
          <div className="border-b border-warning/40 bg-warning/15 px-6 py-2 text-center text-sm">
            <strong>Demo mode:</strong> sample contacts and conversations are shown and labelled “Demo”. Nothing is sent to real accounts.{" "}
            <Link href="/settings#demo" className="font-medium underline">Manage demo data</Link>
          </div>
        )}
        <main className="mx-auto w-full max-w-7xl p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
