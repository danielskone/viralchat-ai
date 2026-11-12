"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { Button } from "./button";

export function Modal({
  trigger,
  title,
  children,
  triggerVariant = "outline",
  triggerSize = "default",
}: {
  trigger: ReactNode;
  title: string;
  children: ReactNode;
  triggerVariant?: "outline" | "gradient" | "default" | "ghost" | "secondary" | "destructive";
  triggerSize?: "default" | "sm";
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <>
      <Button type="button" variant={triggerVariant} size={triggerSize} onClick={() => setOpen(true)}>{trigger}</Button>
      <dialog
        ref={ref}
        onClose={() => setOpen(false)}
        onClick={(e) => e.target === ref.current && setOpen(false)}
        className="m-auto w-[calc(100%-2rem)] max-w-lg rounded-2xl border bg-card p-0 text-card-foreground shadow-2xl backdrop:bg-black/50"
      >
        <div className="flex items-center justify-between border-b px-5 py-4">
          <h2 className="font-semibold">{title}</h2>
          <button onClick={() => setOpen(false)} aria-label="Close" className="rounded-lg p-1 hover:bg-muted"><X className="size-4" /></button>
        </div>
        <div className="p-5">{children}</div>
      </dialog>
    </>
  );
}
