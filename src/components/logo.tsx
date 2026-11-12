import { cn } from "@/lib/utils";

export function Logo({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <span className={cn("flex items-center gap-2 font-semibold tracking-tight", className)}>
      <span className="brand-gradient flex size-8 items-center justify-center rounded-xl text-white shadow-sm">
        <svg viewBox="0 0 24 24" className="size-4.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-4.5 4v-4A2.5 2.5 0 0 1 4 13.5z" />
          <path d="M13 6.5 10 10.5h4l-3 4" />
        </svg>
      </span>
      {!compact && (
        <span>
          ViralChat <span className="brand-text">AI</span>
        </span>
      )}
    </span>
  );
}
