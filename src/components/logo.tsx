import { cn } from "@/lib/utils";

export function Logo({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <span className={cn("flex items-center gap-2 font-semibold tracking-tight", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo-mark.png" alt="" width={32} height={32} className="size-8 drop-shadow-sm" />
      {!compact && (
        <span>
          ViralChat <span className="brand-text">AI</span>
        </span>
      )}
    </span>
  );
}
