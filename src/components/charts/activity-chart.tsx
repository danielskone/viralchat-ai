"use client";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from "recharts";

export function ActivityChart({ data }: { data: { day: string; inbound: number; automated: number; agent: number }[] }) {
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer>
        <AreaChart data={data} margin={{ left: -20, right: 8, top: 8 }}>
          <defs>
            <linearGradient id="gIn" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.35} />
              <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="gAuto" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="oklch(0.6 0.24 305)" stopOpacity={0.35} />
              <stop offset="100%" stopColor="oklch(0.6 0.24 305)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
          <XAxis dataKey="day" tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} tickLine={false} axisLine={false} />
          <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} tickLine={false} axisLine={false} />
          <Tooltip contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 12, fontSize: 12 }} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Area type="monotone" dataKey="inbound" name="Inbound" stroke="var(--color-primary)" fill="url(#gIn)" strokeWidth={2} />
          <Area type="monotone" dataKey="automated" name="Automated + AI" stroke="oklch(0.6 0.24 305)" fill="url(#gAuto)" strokeWidth={2} />
          <Area type="monotone" dataKey="agent" name="Team" stroke="var(--color-success)" fill="transparent" strokeWidth={2} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

const COLORS = ["var(--color-primary)", "oklch(0.6 0.24 305)", "var(--color-success)", "var(--color-warning)", "var(--color-muted-foreground)"];

export function BarList({ data }: { data: { name: string; value: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  if (!data.length) return <p className="text-sm text-muted-foreground">No data yet.</p>;
  return (
    <ul className="flex flex-col gap-3">
      {data
        .sort((a, b) => b.value - a.value)
        .map((d, i) => (
          <li key={d.name} className="text-sm">
            <div className="mb-1 flex justify-between">
              <span className="capitalize">{d.name}</span>
              <span className="tabular-nums text-muted-foreground">{d.value.toLocaleString()}</span>
            </div>
            <div className="h-2 rounded-full bg-muted">
              <div className="h-2 rounded-full" style={{ width: `${(d.value / max) * 100}%`, background: COLORS[i % COLORS.length] }} />
            </div>
          </li>
        ))}
    </ul>
  );
}
