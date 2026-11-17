import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { Rocket } from "lucide-react";
import { requireWorkspace } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/primitives";
import { buttonVariants } from "@/components/ui/button";

const FEATURES: Record<string, { title: string; phase: string; points: string[] }> = {
  sms: { title: "SMS Marketing", phase: "Phase 2", points: ["Twilio two-way messaging", "STOP keyword processing, consent records and quiet hours", "Reminders, confirmations and follow-up sequences"] },
};

export default async function RoadmapPage({ params }: PageProps<"/roadmap/[feature]">) {
  await requireWorkspace();
  const { feature } = await params;
  if (feature === "booking") redirect("/booking");
  if (feature === "landing-pages") redirect("/pages");
  if (feature === "campaigns") redirect("/broadcasts");
  if (feature === "email") redirect("/email");
  const f = FEATURES[feature];
  if (!f) notFound();
  return (
    <div className="mx-auto max-w-xl py-10">
      <Card>
        <CardContent className="flex flex-col items-center gap-4 pt-8 text-center">
          <span className="brand-gradient flex size-14 items-center justify-center rounded-2xl text-white"><Rocket className="size-6" /></span>
          <div>
            <p className="text-sm font-medium text-primary">{f.phase}</p>
            <h1 className="text-2xl font-semibold">{f.title} is coming soon</h1>
          </div>
          <ul className="flex flex-col gap-1 text-sm text-muted-foreground">{f.points.map((p) => <li key={p}>• {p}</li>)}</ul>
          <p className="text-sm">In the meantime, use the <strong>Webhook</strong> automation step to send leads to your existing tools.</p>
          <Link href="/automations" className={buttonVariants({ variant: "gradient" })}>Go to automations</Link>
        </CardContent>
      </Card>
    </div>
  );
}
