import Link from "next/link";
import { Bell, LogOut, ChevronsUpDown, Plus } from "lucide-react";
import { ThemeToggle } from "./theme-toggle";
import { Avatar, Badge } from "./ui/primitives";
import { logout } from "@/app/(auth)/actions";
import { switchWorkspace } from "@/lib/actions/workspace";
import type { WorkspaceContext } from "@/lib/auth";
import { getPlan } from "@/lib/plans";

export function Topbar({ ctx, notificationCount }: { ctx: WorkspaceContext; notificationCount: number }) {
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b bg-background/80 px-4 pl-16 backdrop-blur lg:pl-6">
      <details className="relative">
        <summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-muted">
          <span className="max-w-40 truncate text-sm font-medium sm:max-w-60">{ctx.workspace.name}</span>
          <Badge tone="primary">{getPlan(ctx.workspace.plan).name}</Badge>
          <ChevronsUpDown className="size-4 text-muted-foreground" />
        </summary>
        <div className="absolute left-0 top-11 z-50 w-64 rounded-xl border bg-card p-1.5 shadow-lg">
          <p className="px-2 py-1 text-xs text-muted-foreground">Workspaces</p>
          {ctx.workspaces.map((w) => (
            <form key={w.id} action={switchWorkspace}>
              <input type="hidden" name="workspaceId" value={w.id} />
              <button className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-sm hover:bg-muted">
                <span className="truncate">{w.name}</span>
                {w.id === ctx.workspace.id && <span className="text-xs text-primary">Current</span>}
              </button>
            </form>
          ))}
          <Link href="/onboarding?new=1" className="mt-1 flex items-center gap-2 rounded-lg border-t px-2 py-1.5 text-sm hover:bg-muted">
            <Plus className="size-4" /> New workspace
          </Link>
        </div>
      </details>
      <div className="flex-1" />
      <Link href="/notifications" className="relative rounded-lg p-2 hover:bg-muted" aria-label={`Notifications (${notificationCount} unread)`}>
        <Bell className="size-4" />
        {notificationCount > 0 && <span className="absolute right-1 top-1 size-2 rounded-full bg-destructive" />}
      </Link>
      <ThemeToggle />
      <details className="relative">
        <summary className="flex cursor-pointer list-none items-center gap-2 rounded-full">
          <Avatar name={ctx.user.name} className="size-8" />
        </summary>
        <div className="absolute right-0 top-11 z-50 w-56 rounded-xl border bg-card p-1.5 shadow-lg">
          <div className="px-2 py-1.5">
            <p className="truncate text-sm font-medium">{ctx.user.name}</p>
            <p className="truncate text-xs text-muted-foreground">{ctx.user.email}</p>
            <p className="mt-1 text-xs capitalize text-muted-foreground">Role: {ctx.role}</p>
          </div>
          <form action={logout}>
            <button className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-muted">
              <LogOut className="size-4" /> Sign out
            </button>
          </form>
        </div>
      </details>
    </header>
  );
}
