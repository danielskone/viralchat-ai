import * as React from "react";
import { cn, initials } from "@/lib/utils";

export function Card({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("rounded-2xl border bg-card text-card-foreground shadow-sm", className)} {...props} />;
}
export function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex flex-col gap-1 p-5 pb-3", className)} {...props} />;
}
export function CardTitle({ className, ...props }: React.ComponentProps<"h3">) {
  return <h3 className={cn("font-semibold leading-tight", className)} {...props} />;
}
export function CardDescription({ className, ...props }: React.ComponentProps<"p">) {
  return <p className={cn("text-sm text-muted-foreground", className)} {...props} />;
}
export function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("p-5 pt-0", className)} {...props} />;
}

export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "flex h-9 w-full rounded-lg border border-input bg-card px-3 py-1 text-sm shadow-xs placeholder:text-muted-foreground disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn(
        "flex min-h-20 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

export function Select({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      className={cn("flex h-9 w-full rounded-lg border border-input bg-card px-3 text-sm shadow-xs", className)}
      {...props}
    />
  );
}

export function Label({ className, ...props }: React.ComponentProps<"label">) {
  return <label className={cn("text-sm font-medium", className)} {...props} />;
}

export function Field({ label, hint, children, htmlFor }: { label: string; hint?: React.ReactNode; children: React.ReactNode; htmlFor?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

const badgeTones = {
  default: "bg-muted text-muted-foreground",
  primary: "bg-accent text-accent-foreground",
  success: "bg-success/15 text-success",
  warning: "bg-warning/20 text-[oklch(0.5_0.12_70)] dark:text-warning",
  danger: "bg-destructive/15 text-destructive",
  outline: "border text-muted-foreground",
};

export function Badge({ tone = "default", className, ...props }: React.ComponentProps<"span"> & { tone?: keyof typeof badgeTones }) {
  return (
    <span
      className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap", badgeTones[tone], className)}
      {...props}
    />
  );
}

export function Avatar({ name, src, className }: { name: string; src?: string | null; className?: string }) {
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" className={cn("size-9 shrink-0 rounded-full object-cover", className)} />
  ) : (
    <div className={cn("brand-gradient flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white", className)}>
      {initials(name)}
    </div>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({ icon, title, description, action }: { icon?: React.ReactNode; title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed p-10 text-center">
      {icon && <div className="flex size-12 items-center justify-center rounded-full bg-accent text-accent-foreground">{icon}</div>}
      <div>
        <p className="font-medium">{title}</p>
        {description && <p className="mt-1 max-w-md text-sm text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function Alert({ tone = "info", title, children }: { tone?: "info" | "warning" | "danger" | "success"; title?: string; children?: React.ReactNode }) {
  const tones = {
    info: "border-primary/30 bg-accent/60",
    warning: "border-warning/50 bg-warning/10",
    danger: "border-destructive/40 bg-destructive/10",
    success: "border-success/40 bg-success/10",
  };
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={cn("rounded-xl border p-4 text-sm", tones[tone])}>
      {title && <p className="font-medium">{title}</p>}
      {children && <div className={cn(title && "mt-1", "text-muted-foreground")}>{children}</div>}
    </div>
  );
}
