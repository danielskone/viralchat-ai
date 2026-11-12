"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { chatbots, knowledgeItems, workspaces } from "@/db/schema";
import { requireWorkspace } from "@/lib/auth";
import { previewReply } from "@/lib/ai";
import { getPlan } from "@/lib/plans";
import { audit } from "@/lib/audit";

export type FormState = { error?: string; ok?: string } | undefined;

const botSchema = z.object({
  name: z.string().trim().min(1).max(40),
  avatarUrl: z.union([z.literal(""), z.url()]).optional(),
  greeting: z.string().trim().max(500),
  tone: z.string().trim().max(40),
  personality: z.string().trim().max(2000),
  objective: z.enum(["support", "sales", "booking", "lead_qualification"]),
  bookingUrl: z.union([z.literal(""), z.url()]).optional(),
  fallbackMessage: z.string().trim().min(1).max(500),
  handoffKeywords: z.string().max(500),
  languages: z.string().trim().max(60),
});

export async function saveChatbot(_: FormState, form: FormData): Promise<FormState> {
  const ctx = await requireWorkspace("admin");
  const parsed = botSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: `${parsed.error.issues[0]?.path.join(".")}: ${parsed.error.issues[0]?.message}` };
  const enabled = form.get("enabled") === "on";
  if (enabled) {
    const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, ctx.workspace.id)).limit(1);
    if (!getPlan(ws?.plan).limits.aiChatbot) return { error: "The AI chatbot is available on the Professional plan and above. Upgrade on the Billing page." };
  }
  const channels = form.getAll("channels").map(String).filter((c) => c === "instagram" || c === "messenger");
  const d = parsed.data;
  const values = {
    ...d,
    avatarUrl: d.avatarUrl || null,
    bookingUrl: d.bookingUrl || null,
    handoffKeywords: d.handoffKeywords.split(",").map((k) => k.trim().toLowerCase()).filter(Boolean),
    channels,
    enabled,
    updatedAt: new Date(),
  };
  await db.insert(chatbots).values({ workspaceId: ctx.workspace.id, ...values }).onConflictDoUpdate({ target: chatbots.workspaceId, set: values });
  await audit(ctx.workspace.id, ctx.user.id, "chatbot.update", undefined, { enabled });
  revalidatePath("/chatbot");
  return { ok: enabled ? "Saved. Your AI assistant will answer DMs that no automation handles." : "Saved. The assistant is off: it will only reply where an automation uses the AI step." };
}

const kbSchema = z.object({
  type: z.enum(["faq", "text", "pricing", "policy", "url"]),
  title: z.string().trim().min(1, "Title is required").max(200),
  content: z.string().trim().max(50_000),
  sourceUrl: z.union([z.literal(""), z.url()]).optional(),
});

function htmlToText(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<(br|p|div|li|h[1-6]|tr)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n\n")
    .trim();
}

export async function addKnowledge(_: FormState, form: FormData): Promise<FormState> {
  const ctx = await requireWorkspace("admin");
  const file = form.get("file");
  let content = String(form.get("content") ?? "");
  if (file instanceof File && file.size > 0) {
    if (file.size > 2 * 1024 * 1024) return { error: "Files must be under 2 MB" };
    if (!/\.(txt|md|csv)$/i.test(file.name) && !file.type.startsWith("text/")) return { error: "Upload a .txt, .md or .csv file (PDF import is coming soon, paste the text for now)." };
    content = (await file.text()).slice(0, 50_000);
  }
  const parsed = kbSchema.safeParse({ ...Object.fromEntries(form), content });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  let { content: text } = parsed.data;
  if (parsed.data.type === "url") {
    if (!parsed.data.sourceUrl) return { error: "Enter the page URL to import" };
    try {
      const u = new URL(parsed.data.sourceUrl);
      if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error("Only http(s) URLs");
      if (/^(localhost|127\.|10\.|192\.168\.|169\.254\.)/.test(u.hostname)) throw new Error("Private addresses are not allowed");
      const res = await fetch(u, { headers: { "User-Agent": "ViralChatAI-KnowledgeBot/1.0" }, signal: AbortSignal.timeout(10_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      text = htmlToText((await res.text()).slice(0, 2_000_000)).slice(0, 50_000);
    } catch (e) {
      return { error: `Couldn't import that page: ${e instanceof Error ? e.message : String(e)}` };
    }
  }
  if (!text.trim()) return { error: "Content is empty" };
  await db.insert(knowledgeItems).values({ workspaceId: ctx.workspace.id, type: parsed.data.type, title: parsed.data.title, content: text, sourceUrl: parsed.data.sourceUrl || null });
  revalidatePath("/chatbot");
  return { ok: "Added to knowledge base" };
}

export async function updateKnowledge(form: FormData) {
  const ctx = await requireWorkspace("admin");
  const id = String(form.get("id"));
  const title = String(form.get("title") ?? "").trim().slice(0, 200);
  const content = String(form.get("content") ?? "").trim().slice(0, 50_000);
  if (!title || !content) return;
  await db.update(knowledgeItems).set({ title, content, updatedAt: new Date() }).where(and(eq(knowledgeItems.id, id), eq(knowledgeItems.workspaceId, ctx.workspace.id)));
  revalidatePath("/chatbot");
}

export async function deleteKnowledge(form: FormData) {
  const ctx = await requireWorkspace("admin");
  await db.delete(knowledgeItems).where(and(eq(knowledgeItems.id, String(form.get("id"))), eq(knowledgeItems.workspaceId, ctx.workspace.id)));
  revalidatePath("/chatbot");
}

export async function askPreview(question: string) {
  const ctx = await requireWorkspace();
  return previewReply(ctx.workspace.id, question.slice(0, 1000));
}
