import { asc, eq } from "drizzle-orm";
import { Trash2, BookOpen } from "lucide-react";
import { db } from "@/db";
import { chatbots, knowledgeItems } from "@/db/schema";
import { requireWorkspace, hasRole } from "@/lib/auth";
import { getPlan } from "@/lib/plans";
import { Alert, Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, PageHeader, Input, Textarea, EmptyState } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { deleteKnowledge, updateKnowledge } from "@/lib/actions/chatbot";
import { BotForm, KnowledgeForm, PreviewChat } from "./forms";
import { getOpenAI } from "@/lib/ai";

export const metadata = { title: "AI Chatbot" };

export default async function ChatbotPage() {
  const ctx = await requireWorkspace();
  const [[bot], docs, ai] = await Promise.all([
    db.select().from(chatbots).where(eq(chatbots.workspaceId, ctx.workspace.id)).limit(1),
    db.select().from(knowledgeItems).where(eq(knowledgeItems.workspaceId, ctx.workspace.id)).orderBy(asc(knowledgeItems.createdAt)),
    getOpenAI(ctx.workspace.id),
  ]);
  const plan = getPlan(ctx.workspace.plan);
  const isAdmin = hasRole(ctx.role, "admin");
  return (
    <>
      <PageHeader
        title="AI Chatbot"
        description="Your AI assistant answers DMs using only the business knowledge you provide, and hands off to your team when it isn’t sure."
        actions={bot?.enabled ? <Badge tone="success">Live</Badge> : <Badge>Off</Badge>}
      />
      <div className="mb-4 flex flex-col gap-3">
        {!ai && <Alert tone="warning" title="No OpenAI key configured">Add an OpenAI API key on the Integrations page to enable AI replies and the preview below.</Alert>}
        {!plan.limits.aiChatbot && <Alert tone="info" title="Available on Professional and above">You can configure and preview your assistant now; turning it on for live conversations requires the Professional plan.</Alert>}
      </div>
      <div className="grid gap-6 xl:grid-cols-5">
        <div className="flex flex-col gap-6 xl:col-span-3">
          <Card>
            <CardHeader>
              <CardTitle>Assistant settings</CardTitle>
              <CardDescription>Name, voice and goal of your assistant.</CardDescription>
            </CardHeader>
            <CardContent>
              <BotForm bot={bot ?? null} disabled={!isAdmin} />
            </CardContent>
          </Card>
          <Card id="knowledge">
            <CardHeader>
              <CardTitle>Knowledge base</CardTitle>
              <CardDescription>FAQs, services, pricing and policies. The assistant will not state prices, discounts or guarantees that aren’t written here.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {isAdmin && <KnowledgeForm />}
              {docs.length === 0 ? (
                <EmptyState icon={<BookOpen />} title="No knowledge yet" description="Add your FAQs and pricing so the assistant can answer accurately." />
              ) : (
                <ul className="flex flex-col gap-2">
                  {docs.map((d) => (
                    <li key={d.id}>
                      <details className="rounded-xl border">
                        <summary className="flex cursor-pointer items-center gap-2 p-3 text-sm">
                          <Badge tone="primary">{d.type}</Badge>
                          <span className="flex-1 truncate font-medium">{d.title}</span>
                          <span className="text-xs text-muted-foreground">{d.content.length.toLocaleString()} chars</span>
                        </summary>
                        <div className="border-t p-3">
                          {isAdmin ? (
                            <form action={updateKnowledge} className="flex flex-col gap-2">
                              <input type="hidden" name="id" value={d.id} />
                              <Input name="title" defaultValue={d.title} aria-label="Title" />
                              <Textarea name="content" defaultValue={d.content} rows={6} aria-label="Content" />
                              {d.sourceUrl && <p className="text-xs text-muted-foreground">Imported from {d.sourceUrl}</p>}
                              <div className="flex gap-2">
                                <Button size="sm" variant="outline">Save</Button>
                                <Button size="sm" variant="ghost" className="text-destructive" formAction={deleteKnowledge}><Trash2 /> Delete</Button>
                              </div>
                            </form>
                          ) : (
                            <p className="whitespace-pre-wrap text-sm">{d.content}</p>
                          )}
                        </div>
                      </details>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
        <div className="xl:col-span-2">
          <Card className="sticky top-20">
            <CardHeader>
              <CardTitle>Preview</CardTitle>
              <CardDescription>Ask a question the way a customer would. Uses your saved settings.</CardDescription>
            </CardHeader>
            <CardContent>
              <PreviewChat botName={bot?.name ?? "Assistant"} greeting={bot?.greeting ?? "Hi!"} />
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
