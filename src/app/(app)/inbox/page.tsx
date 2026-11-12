import Link from "next/link";
import { and, asc, desc, eq, ilike, isNull, or, type SQL } from "drizzle-orm";
import { Inbox as InboxIcon, Flag, UserRound, FlaskConical } from "lucide-react";
import { InstagramIcon as Instagram, MessengerIcon as MessageCircle } from "@/components/brand-icons";
import { db } from "@/db";
import { contacts, conversations, memberships, messages, savedReplies, users } from "@/db/schema";
import { requireWorkspace } from "@/lib/auth";
import { Avatar, Badge, EmptyState, Input } from "@/components/ui/primitives";
import { cn, timeAgo } from "@/lib/utils";
import { Thread } from "./thread";
import { AutoRefresh } from "./auto-refresh";

export const metadata = { title: "Conversations" };

const FILTERS = [
  { id: "all", label: "All open" },
  { id: "mine", label: "Assigned to me" },
  { id: "unassigned", label: "Unassigned" },
  { id: "human", label: "Needs human" },
  { id: "priority", label: "Priority" },
  { id: "closed", label: "Closed" },
];

function ChannelIcon({ channel, className }: { channel: string; className?: string }) {
  if (channel === "instagram") return <Instagram className={cn("text-pink-500", className)} aria-label="Instagram" />;
  if (channel === "messenger") return <MessageCircle className={cn("text-blue-500", className)} aria-label="Messenger" />;
  return <FlaskConical className={cn("text-warning", className)} aria-label="Demo" />;
}

export default async function InboxPage({ searchParams }: PageProps<"/inbox">) {
  const ctx = await requireWorkspace();
  const sp = await searchParams;
  const filter = typeof sp.f === "string" ? sp.f : "all";
  const channel = typeof sp.ch === "string" ? sp.ch : "";
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const selectedId = typeof sp.c === "string" ? sp.c : null;

  const where: SQL[] = [eq(conversations.workspaceId, ctx.workspace.id)];
  if (filter === "closed") where.push(eq(conversations.status, "closed"));
  else where.push(or(eq(conversations.status, "open"), eq(conversations.status, "pending"))!);
  if (filter === "mine") where.push(eq(conversations.assignedTo, ctx.user.id));
  if (filter === "human") where.push(eq(conversations.humanTakeover, true));
  if (filter === "priority") where.push(eq(conversations.priority, true));
  if (filter === "unassigned") where.push(isNull(conversations.assignedTo));
  if (channel === "instagram" || channel === "messenger" || channel === "demo") where.push(eq(conversations.channel, channel));
  if (q) where.push(or(ilike(contacts.name, `%${q}%`), ilike(conversations.lastMessagePreview, `%${q}%`))!);

  let list = await db
    .select({ conv: conversations, contact: contacts })
    .from(conversations)
    .innerJoin(contacts, eq(contacts.id, conversations.contactId))
    .where(and(...where))
    .orderBy(desc(conversations.lastMessageAt))
    .limit(100);
  list = list.filter((r) => r.conv.channel !== "test");

  const selected = selectedId
    ? (
        await db
          .select({ conv: conversations, contact: contacts })
          .from(conversations)
          .innerJoin(contacts, eq(contacts.id, conversations.contactId))
          .where(and(eq(conversations.id, selectedId), eq(conversations.workspaceId, ctx.workspace.id)))
          .limit(1)
      )[0]
    : undefined;

  const [thread, team, replies] = selected
    ? await Promise.all([
        db
          .select({ m: messages, author: users.name })
          .from(messages)
          .leftJoin(users, eq(users.id, messages.senderUserId))
          .where(eq(messages.conversationId, selected.conv.id))
          .orderBy(asc(messages.createdAt))
          .limit(300),
        db.select({ id: users.id, name: users.name }).from(memberships).innerJoin(users, eq(users.id, memberships.userId)).where(eq(memberships.workspaceId, ctx.workspace.id)),
        db.select().from(savedReplies).where(eq(savedReplies.workspaceId, ctx.workspace.id)),
      ])
    : [[], [], []];

  const link = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams();
    const merged = { f: filter, ch: channel, q, c: selectedId, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    return `/inbox?${p}`;
  };

  return (
    <div className="-m-4 flex h-[calc(100vh-4rem)] sm:-m-6">
      <AutoRefresh seconds={6} />
      <aside className={cn("flex w-full flex-col border-r md:w-80 lg:w-96", selected && "hidden md:flex")}>
        <div className="border-b p-3">
          <form className="mb-2">
            <input type="hidden" name="f" value={filter} />
            {channel && <input type="hidden" name="ch" value={channel} />}
            <Input name="q" defaultValue={q} placeholder="Search conversations" aria-label="Search conversations" />
          </form>
          <div className="flex flex-wrap gap-1">
            {FILTERS.map((f) => (
              <Link key={f.id} href={link({ f: f.id, c: null })} className={cn("rounded-full px-2.5 py-1 text-xs", filter === f.id ? "bg-accent font-medium text-accent-foreground" : "text-muted-foreground hover:bg-muted")}>
                {f.label}
              </Link>
            ))}
          </div>
          <div className="mt-2 flex gap-1">
            {[["", "All channels"], ["instagram", "Instagram"], ["messenger", "Messenger"], ...(ctx.workspace.demoMode ? [["demo", "Demo"]] : [])].map(([id, label]) => (
              <Link key={id} href={link({ ch: id || null, c: null })} className={cn("rounded-md px-2 py-0.5 text-xs", channel === id ? "bg-muted font-medium" : "text-muted-foreground hover:bg-muted")}>
                {label}
              </Link>
            ))}
          </div>
        </div>
        <ul className="flex-1 overflow-y-auto">
          {list.length === 0 && (
            <li className="p-6">
              <EmptyState icon={<InboxIcon />} title="No conversations" description="When people DM your connected Instagram or Facebook Page, conversations show up here." />
            </li>
          )}
          {list.map(({ conv, contact }) => (
            <li key={conv.id}>
              <Link
                href={link({ c: conv.id })}
                className={cn("flex gap-3 border-b px-3 py-3 hover:bg-muted/60", selectedId === conv.id && "bg-accent/60")}
              >
                <div className="relative">
                  <Avatar name={contact.name} src={contact.avatarUrl} />
                  <span className="absolute -bottom-0.5 -right-0.5 rounded-full bg-card p-0.5"><ChannelIcon channel={conv.channel} className="size-3" /></span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className={cn("flex-1 truncate text-sm", conv.unreadCount > 0 && "font-semibold")}>{contact.name}</p>
                    <span className="shrink-0 text-[11px] text-muted-foreground">{timeAgo(conv.lastMessageAt)}</span>
                  </div>
                  <p className="truncate text-xs text-muted-foreground">{conv.lastMessagePreview ?? "No messages yet"}</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {conv.unreadCount > 0 && <Badge tone="primary">{conv.unreadCount} new</Badge>}
                    {conv.humanTakeover && <Badge tone="warning"><UserRound className="size-3" /> Human</Badge>}
                    {conv.priority && <Badge tone="danger"><Flag className="size-3" /> Priority</Badge>}
                    {conv.labels.slice(0, 2).map((l) => <Badge key={l}>{l}</Badge>)}
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </aside>
      {selected ? (
        <Thread
          key={selected.conv.id}
          conversation={selected.conv}
          contact={selected.contact}
          messages={thread.map((t) => ({ ...t.m, author: t.author }))}
          team={team}
          savedReplies={replies}
          currentUserId={ctx.user.id}
          backHref={link({ c: null })}
        />
      ) : (
        <div className="hidden flex-1 items-center justify-center md:flex">
          <p className="text-sm text-muted-foreground">Select a conversation</p>
        </div>
      )}
    </div>
  );
}
