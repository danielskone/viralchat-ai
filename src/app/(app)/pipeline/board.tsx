"use client";
import Link from "next/link";
import { useOptimistic, useTransition } from "react";
import { STAGES } from "@/lib/utils";
import { Avatar, Badge } from "@/components/ui/primitives";
import { setContactStage } from "@/lib/actions/contacts";
import { cn } from "@/lib/utils";

type Row = { id: string; name: string; stage: string; score: number; temperature: string; tags: string[]; avatarUrl: string | null; isDemo: boolean };

export function Board({ initial }: { initial: Row[] }) {
  const [rows, move] = useOptimistic(initial, (state, { id, stage }: { id: string; stage: string }) =>
    state.map((r) => (r.id === id ? { ...r, stage } : r)),
  );
  const [, start] = useTransition();
  const onDrop = (stage: string) => (e: React.DragEvent) => {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/plain");
    if (!id) return;
    start(async () => {
      move({ id, stage });
      await setContactStage(id, stage);
    });
  };
  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {STAGES.map((s) => {
        const items = rows.filter((r) => r.stage === s.id);
        return (
          <section
            key={s.id}
            onDragOver={(e) => e.preventDefault()}
            onDrop={onDrop(s.id)}
            className="flex w-72 shrink-0 flex-col rounded-2xl border bg-muted/40"
            aria-label={s.label}
          >
            <header className="flex items-center justify-between px-4 py-3">
              <h2 className="text-sm font-semibold">{s.label}</h2>
              <span className="rounded-full bg-card px-2 text-xs tabular-nums text-muted-foreground">{items.length}</span>
            </header>
            <ul className="flex min-h-24 flex-col gap-2 px-3 pb-3">
              {items.map((c) => (
                <li
                  key={c.id}
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData("text/plain", c.id)}
                  className="cursor-grab rounded-xl border bg-card p-3 shadow-sm active:cursor-grabbing"
                >
                  <Link href={`/contacts/${c.id}`} className="flex items-center gap-2">
                    <Avatar name={c.name} src={c.avatarUrl} className="size-7 text-[10px]" />
                    <span className="flex-1 truncate text-sm font-medium">{c.name}</span>
                  </Link>
                  <div className="mt-2 flex flex-wrap items-center gap-1">
                    <Badge tone={c.temperature === "hot" ? "danger" : c.temperature === "warm" ? "warning" : "default"}>{c.score}</Badge>
                    {c.isDemo && <Badge tone="warning">Demo</Badge>}
                    {c.tags.slice(0, 2).map((t) => <Badge key={t} tone="primary">{t}</Badge>)}
                  </div>
                  <label className="sr-only" htmlFor={`stage-${c.id}`}>Move {c.name}</label>
                  <select
                    id={`stage-${c.id}`}
                    className={cn("mt-2 w-full rounded-md border bg-card px-2 py-1 text-xs lg:hidden")}
                    value={c.stage}
                    onChange={(e) => {
                      const stage = e.target.value;
                      start(async () => {
                        move({ id: c.id, stage });
                        await setContactStage(c.id, stage);
                      });
                    }}
                  >
                    {STAGES.map((st) => <option key={st.id} value={st.id}>{st.label}</option>)}
                  </select>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
