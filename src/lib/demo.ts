import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { activities, contacts, conversations, messages, workspaces } from "@/db/schema";
import { temperatureFromScore } from "./utils";

const PEOPLE = [
  { name: "Maya Johnson", email: "maya.j@example.com", tags: ["comment-lead", "skincare"], score: 82, stage: "qualified", src: "instagram" },
  { name: "Carlos Rivera", email: "carlos@example.com", tags: ["sales-inquiry"], score: 64, stage: "contacted", src: "messenger" },
  { name: "Priya Patel", email: null, tags: ["story-engaged"], score: 22, stage: "new_lead", src: "instagram" },
  { name: "Jordan Lee", email: "jordan.lee@example.com", tags: ["booking-link-sent"], score: 71, stage: "appointment", src: "instagram" },
  { name: "Aisha Bello", email: "aisha@example.com", tags: ["vip"], score: 90, stage: "won", src: "messenger" },
  { name: "Ethan Brooks", email: null, tags: [], score: 10, stage: "new_lead", src: "instagram" },
  { name: "Sofia Rossi", email: "sofia.r@example.com", tags: ["launch-2026"], score: 45, stage: "proposal", src: "instagram" },
  { name: "Noah Kim", email: null, tags: ["sales-inquiry"], score: 38, stage: "contacted", src: "messenger" },
];

const THREADS: [string, "in" | "out", string][][] = [
  [["", "in", "INFO"], ["", "out", "Hey Maya! Thanks for your comment 🙌 Reply YES and I'll send the link right over."], ["", "in", "YES please!"], ["", "out", "Before I do, what's the best email to send extra resources to?"], ["", "in", "maya.j@example.com"]],
  [["", "in", "Hi, how much is the premium package?"], ["", "out", "Hi Carlos, welcome! 👋 Are you looking for SALES help or SUPPORT?"], ["", "in", "Sales"]],
  [["", "in", "Loved your story!! 😍"], ["", "out", "Thanks for the love on our story, Priya! 💜 Want me to send you our latest offer?"]],
  [["", "in", "Can I book a consultation?"], ["", "out", "You can grab a time that works for you here: https://example.com/book 📅"], ["", "in", "Booked for Thursday, thanks!"]],
  [["", "in", "My order arrived, it's amazing"], ["", "out", "So happy to hear that Aisha! 💜"]],
  [["", "in", "Do you ship to Canada?"]],
];

export async function loadDemoData(workspaceId: string) {
  await clearDemoData(workspaceId);
  const now = Date.now();
  for (let i = 0; i < PEOPLE.length; i++) {
    const p = PEOPLE[i]!;
    const created = new Date(now - (i * 2 + 1) * 86400_000 - i * 3600_000);
    const [c] = await db
      .insert(contacts)
      .values({
        workspaceId,
        name: p.name,
        email: p.email,
        tags: p.tags,
        leadScore: p.score,
        temperature: temperatureFromScore(p.score),
        stage: p.stage,
        source: "demo",
        isDemo: true,
        createdAt: created,
        lastActivityAt: new Date(now - i * 3_600_000),
      })
      .returning();
    await db.insert(activities).values({ workspaceId, contactId: c!.id, type: "created", description: `Demo contact ${p.name} created (sample data)`, createdAt: created });
    const thread = THREADS[i];
    if (!thread) continue;
    const [conv] = await db
      .insert(conversations)
      .values({ workspaceId, contactId: c!.id, channel: "demo", unreadCount: i === 5 ? 1 : 0, humanTakeover: i === 5, priority: i === 5, createdAt: created })
      .returning();
    let t = now - (i + 1) * 3_600_000;
    for (const [, dir, body] of thread) {
      t += 60_000;
      await db.insert(messages).values({
        workspaceId,
        conversationId: conv!.id,
        direction: dir === "in" ? "inbound" : "outbound",
        senderType: dir === "in" ? "contact" : "automation",
        body,
        status: dir === "in" ? "received" : "simulated",
        createdAt: new Date(t),
      });
    }
    const last = thread[thread.length - 1]!;
    await db
      .update(conversations)
      .set({ lastMessageAt: new Date(t), lastInboundAt: new Date(t), lastMessagePreview: last[2] })
      .where(eq(conversations.id, conv!.id));
  }
  await db.update(workspaces).set({ demoMode: true }).where(eq(workspaces.id, workspaceId));
}

export async function clearDemoData(workspaceId: string) {
  await db.delete(contacts).where(and(eq(contacts.workspaceId, workspaceId), eq(contacts.isDemo, true)));
  await db.update(workspaces).set({ demoMode: false }).where(eq(workspaces.id, workspaceId));
}
