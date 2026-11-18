import { Check } from "lucide-react";
import { BASE_PLAN, TRIAL_DAYS } from "@/lib/plans";
import { Card } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

/** The single base plan, shown on the homepage, the subscribe screen and the billing page. */
export function PlanCard({ className, children, trial = true }: { className?: string; children?: React.ReactNode; trial?: boolean }) {
  return (
    <Card className={cn("flex flex-col p-6 ring-2 ring-primary", className)}>
      <p className="font-semibold">{BASE_PLAN.name}</p>
      <p className="mt-2 text-4xl font-semibold">
        ${BASE_PLAN.priceMonthly}
        <span className="text-base font-normal text-muted-foreground">/month</span>
      </p>
      {trial && <p className="mt-1 text-sm font-medium text-primary">Free for {TRIAL_DAYS} days, then ${BASE_PLAN.priceMonthly}/month. Cancel anytime.</p>}
      <p className="mt-2 text-sm text-muted-foreground">{BASE_PLAN.tagline}</p>
      <ul className="my-5 flex flex-1 flex-col gap-2 text-sm">
        {BASE_PLAN.features
          .filter((f) => trial || !f.includes("free trial"))
          .map((f) => (
            <li key={f} className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-success" /> {f}</li>
          ))}
      </ul>
      {children}
    </Card>
  );
}
