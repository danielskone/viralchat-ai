"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  LayoutDashboard, MessagesSquare, Users, KanbanSquare, Bot, Workflow, Megaphone, Mail, MessageSquareText,
  CalendarDays, PanelsTopLeft, BarChart3, Plug, LayoutTemplate, UsersRound, CreditCard, Settings, Menu, X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Logo } from "./logo";

type Item = { href: string; label: string; icon: React.ComponentType<{ className?: string }>; soon?: boolean; badge?: number };

export function Sidebar({ unread }: { unread: number }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const groups: { title?: string; items: Item[] }[] = [
    {
      items: [
        { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
        { href: "/inbox", label: "Conversations", icon: MessagesSquare, badge: unread },
        { href: "/contacts", label: "Contacts", icon: Users },
        { href: "/pipeline", label: "CRM Pipeline", icon: KanbanSquare },
        { href: "/chatbot", label: "AI Chatbot", icon: Bot },
        { href: "/automations", label: "Automations", icon: Workflow },
        { href: "/booking", label: "Booking", icon: CalendarDays },
        { href: "/pages", label: "Landing Pages", icon: PanelsTopLeft },
        { href: "/broadcasts", label: "Broadcasts", icon: Megaphone },
        { href: "/templates", label: "Templates", icon: LayoutTemplate },
        { href: "/analytics", label: "Analytics", icon: BarChart3 },
        { href: "/integrations", label: "Integrations", icon: Plug },
      ],
    },
    {
      title: "Coming soon",
      items: [
        { href: "/roadmap/email", label: "Email Marketing", icon: Mail, soon: true },
        { href: "/roadmap/sms", label: "SMS Marketing", icon: MessageSquareText, soon: true },
      ],
    },
    {
      title: "Workspace",
      items: [
        { href: "/team", label: "Team", icon: UsersRound },
        { href: "/billing", label: "Billing", icon: CreditCard },
        { href: "/settings", label: "Settings", icon: Settings },
      ],
    },
  ];

  const nav = (
    <nav className="flex flex-col gap-5 overflow-y-auto px-3 pb-6" aria-label="Main">
      {groups.map((g, i) => (
        <div key={i} className="flex flex-col gap-0.5">
          {g.title && <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{g.title}</p>}
          {g.items.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                  active ? "bg-accent font-medium text-accent-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  item.soon && "opacity-70",
                )}
              >
                <item.icon className="size-4 shrink-0" />
                <span className="flex-1 truncate">{item.label}</span>
                {item.badge ? (
                  <span className="brand-gradient rounded-full px-1.5 text-[11px] font-semibold text-white">{item.badge > 99 ? "99+" : item.badge}</span>
                ) : null}
                {item.soon && <span className="rounded bg-muted px-1.5 text-[10px] font-medium">Soon</span>}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );

  return (
    <>
      <button className="fixed left-3 top-3 z-40 rounded-lg border bg-card p-2 lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu">
        <Menu className="size-5" />
      </button>
      {open && <div className="fixed inset-0 z-40 bg-black/40 lg:hidden" onClick={() => setOpen(false)} />}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r bg-sidebar transition-transform lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-16 items-center justify-between px-5">
          <Link href="/dashboard"><Logo /></Link>
          <button className="lg:hidden" onClick={() => setOpen(false)} aria-label="Close menu"><X className="size-5" /></button>
        </div>
        {nav}
      </aside>
    </>
  );
}
