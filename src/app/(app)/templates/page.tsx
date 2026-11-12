import { requireWorkspace } from "@/lib/auth";
import { TEMPLATES } from "@/lib/templates";
import { Badge, Card, PageHeader } from "@/components/ui/primitives";
import { SubmitButton } from "@/components/ui/submit-button";
import { createAutomation } from "@/lib/actions/automations";
import { TRIGGER_LABELS, specFor } from "@/lib/node-catalog";
import { InstagramIcon, MessengerIcon } from "@/components/brand-icons";

export const metadata = { title: "Templates" };

export default async function TemplatesPage() {
  await requireWorkspace();
  const categories = Array.from(new Set(TEMPLATES.map((t) => t.category)));
  return (
    <>
      <PageHeader title="Automation templates" description="Install a template, customize the messages, test it, then activate. Templates are installed as drafts." />
      {categories.map((cat) => (
        <section key={cat} className="mb-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">{cat}</h2>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {TEMPLATES.filter((t) => t.category === cat).map((t) => (
              <Card key={t.key} className="flex flex-col p-5">
                <div className="flex items-center gap-2">
                  {t.channels.includes("instagram") && <InstagramIcon className="size-4 text-pink-500" aria-label="Instagram" />}
                  {t.channels.includes("messenger") && <MessengerIcon className="size-4 text-blue-500" aria-label="Messenger" />}
                  <Badge>{TRIGGER_LABELS[t.triggerType]}</Badge>
                </div>
                <h3 className="mt-3 font-semibold">{t.name}</h3>
                <p className="mt-1 flex-1 text-sm text-muted-foreground">{t.description}</p>
                <p className="mt-3 text-xs text-muted-foreground">
                  {t.graph.nodes.filter((n) => n.type !== "trigger").map((n) => specFor(n.type)?.label).filter((v, i, arr) => arr.indexOf(v) === i).join(" · ")}
                </p>
                <form action={createAutomation} className="mt-4">
                  <input type="hidden" name="template" value={t.key} />
                  <SubmitButton variant="outline" className="w-full" pendingText="Installing…">Use template</SubmitButton>
                </form>
              </Card>
            ))}
          </div>
        </section>
      ))}
    </>
  );
}
