import { Card } from "@/components/ui/primitives";

export function StatCard({ label, value, hint, icon }: { label: string; value: string | number; hint?: string; icon?: React.ReactNode }) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm text-muted-foreground">{label}</p>
        {icon && <span className="rounded-lg bg-accent p-1.5 text-accent-foreground [&_svg]:size-4">{icon}</span>}
      </div>
      <p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight">{typeof value === "number" ? value.toLocaleString() : value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </Card>
  );
}
