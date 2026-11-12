import "server-only";
import OpenAI from "openai";
import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { chatbots, contacts, conversations, integrations, knowledgeItems, messages, workspaces } from "@/db/schema";
import { decrypt } from "./crypto";
import { buildSystemPrompt, HANDOFF_TOKEN, selectKnowledge } from "./ai-prompt";

export async function getOpenAI(workspaceId: string): Promise<{ client: OpenAI; source: "workspace" | "platform" } | null> {
  const [row] = await db
    .select()
    .from(integrations)
    .where(and(eq(integrations.workspaceId, workspaceId), eq(integrations.provider, "openai"), eq(integrations.status, "connected")))
    .limit(1);
  if (row?.secretEnc) return { client: new OpenAI({ apiKey: decrypt(row.secretEnc) }), source: "workspace" };
  if (process.env.OPENAI_API_KEY) return { client: new OpenAI({ apiKey: process.env.OPENAI_API_KEY }), source: "platform" };
  return null;
}

export const aiModel = () => process.env.OPENAI_MODEL || "gpt-4.1-mini";

export type AiReplyResult = { ok: true; text: string; handoff: boolean } | { ok: false; error: string };

/** Generates the chatbot's next reply for a conversation using the workspace's knowledge base. */
export async function generateConversationReply(workspaceId: string, conversationId: string): Promise<AiReplyResult> {
  const ai = await getOpenAI(workspaceId);
  if (!ai) return { ok: false, error: "No OpenAI API key configured. Add one on the Integrations page." };

  const [conv] = await db
    .select({ conv: conversations, contact: contacts, ws: workspaces })
    .from(conversations)
    .innerJoin(contacts, eq(contacts.id, conversations.contactId))
    .innerJoin(workspaces, eq(workspaces.id, conversations.workspaceId))
    .where(and(eq(conversations.id, conversationId), eq(conversations.workspaceId, workspaceId)))
    .limit(1);
  if (!conv) return { ok: false, error: "Conversation not found" };

  const [bot] = await db.select().from(chatbots).where(eq(chatbots.workspaceId, workspaceId)).limit(1);
  const history = (
    await db
      .select()
      .from(messages)
      .where(and(eq(messages.conversationId, conversationId), eq(messages.isInternalNote, false)))
      .orderBy(desc(messages.createdAt))
      .limit(16)
  ).reverse();
  const lastInbound = [...history].reverse().find((m) => m.direction === "inbound");
  const docs = await db
    .select({ title: knowledgeItems.title, type: knowledgeItems.type, content: knowledgeItems.content })
    .from(knowledgeItems)
    .where(eq(knowledgeItems.workspaceId, workspaceId))
    .orderBy(asc(knowledgeItems.createdAt));

  const system = buildSystemPrompt({
    botName: bot?.name ?? "Assistant",
    businessName: conv.ws.name,
    tone: bot?.tone ?? "friendly",
    personality: bot?.personality ?? "",
    objective: bot?.objective ?? "support",
    bookingUrl: bot?.bookingUrl,
    languages: bot?.languages ?? "auto",
    knowledge: selectKnowledge(lastInbound?.body ?? "", docs),
    contactName: conv.contact.name !== "Unknown" ? conv.contact.name : null,
  });

  try {
    const completion = await ai.client.chat.completions.create({
      model: aiModel(),
      temperature: 0.3,
      max_tokens: 300,
      messages: [
        { role: "system", content: system },
        ...history.map((m) => ({
          role: m.direction === "inbound" ? ("user" as const) : ("assistant" as const),
          content: m.body,
        })),
      ],
    });
    const text = completion.choices[0]?.message?.content?.trim() ?? "";
    if (!text || text.includes(HANDOFF_TOKEN)) {
      return { ok: true, text: bot?.fallbackMessage ?? "Let me get a teammate to help you with that.", handoff: true };
    }
    return { ok: true, text, handoff: false };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "OpenAI request failed" };
  }
}

/** One-off generation used by the chatbot preview (no conversation stored). */
export async function previewReply(workspaceId: string, question: string): Promise<AiReplyResult> {
  const ai = await getOpenAI(workspaceId);
  if (!ai) return { ok: false, error: "No OpenAI API key configured. Add one on the Integrations page." };
  const [bot] = await db.select().from(chatbots).where(eq(chatbots.workspaceId, workspaceId)).limit(1);
  const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
  const docs = await db
    .select({ title: knowledgeItems.title, type: knowledgeItems.type, content: knowledgeItems.content })
    .from(knowledgeItems)
    .where(eq(knowledgeItems.workspaceId, workspaceId));
  const system = buildSystemPrompt({
    botName: bot?.name ?? "Assistant",
    businessName: ws?.name ?? "the business",
    tone: bot?.tone ?? "friendly",
    personality: bot?.personality ?? "",
    objective: bot?.objective ?? "support",
    bookingUrl: bot?.bookingUrl,
    languages: bot?.languages ?? "auto",
    knowledge: selectKnowledge(question, docs),
  });
  try {
    const completion = await ai.client.chat.completions.create({
      model: aiModel(),
      temperature: 0.3,
      max_tokens: 300,
      messages: [
        { role: "system", content: system },
        { role: "user", content: question },
      ],
    });
    const text = completion.choices[0]?.message?.content?.trim() ?? "";
    if (!text || text.includes(HANDOFF_TOKEN)) {
      return { ok: true, text: bot?.fallbackMessage ?? "Let me get a teammate to help.", handoff: true };
    }
    return { ok: true, text, handoff: false };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "OpenAI request failed" };
  }
}
