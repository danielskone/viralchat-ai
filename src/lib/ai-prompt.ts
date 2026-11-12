import { normalize } from "./engine/matcher";

export type KnowledgeDoc = { title: string; type: string; content: string };

/** Lightweight lexical retrieval: ranks knowledge items by term overlap with the question. */
export function selectKnowledge(question: string, docs: KnowledgeDoc[], maxChars = 8000): KnowledgeDoc[] {
  const terms = new Set(normalize(question).split(" ").filter((t) => t.length > 2));
  const scored = docs.map((d) => {
    const hay = normalize(`${d.title} ${d.content}`);
    let score = d.type === "pricing" || d.type === "policy" ? 0.5 : 0;
    for (const t of terms) if (hay.includes(t)) score += 1;
    return { d, score };
  });
  scored.sort((a, b) => b.score - a.score);
  const out: KnowledgeDoc[] = [];
  let used = 0;
  for (const { d } of scored) {
    if (used + d.content.length > maxChars && out.length) break;
    out.push(d);
    used += d.content.length;
  }
  return out;
}

export const HANDOFF_TOKEN = "[[HANDOFF]]";

export function buildSystemPrompt(opts: {
  botName: string;
  businessName: string;
  tone: string;
  personality: string;
  objective: string;
  bookingUrl?: string | null;
  languages: string;
  knowledge: KnowledgeDoc[];
  contactName?: string | null;
}) {
  const objectives: Record<string, string> = {
    support: "Answer customer questions helpfully and resolve their issue.",
    sales: "Help the customer find the right product or service and move them toward purchase, without pressure.",
    booking: "Help the customer book an appointment. Share the booking link when they are ready.",
    lead_qualification:
      "Understand what the customer needs, their timeline and budget, one question at a time, so the team can follow up.",
  };
  const kb = opts.knowledge.length
    ? opts.knowledge.map((k, i) => `### [${i + 1}] ${k.title} (${k.type})\n${k.content}`).join("\n\n")
    : "(No business knowledge has been added yet.)";
  return [
    `You are ${opts.botName}, the virtual assistant for ${opts.businessName}, replying in a social media direct message.`,
    `Tone: ${opts.tone}. ${opts.personality}`.trim(),
    `Goal: ${objectives[opts.objective] ?? objectives.support}`,
    opts.bookingUrl ? `Booking link: ${opts.bookingUrl}` : "",
    opts.contactName ? `The customer's name is ${opts.contactName}.` : "",
    opts.languages === "auto" ? "Reply in the same language the customer writes in." : `Reply in ${opts.languages}.`,
    "Rules:",
    "- Keep replies short (1-3 sentences), conversational, and suitable for a DM. No markdown headings.",
    "- Only state facts found in the BUSINESS KNOWLEDGE below. Never invent prices, discounts, availability, guarantees, or policies.",
    `- If the answer is not in the knowledge, or the customer asks for a human, is upset, or needs something you cannot do, reply with exactly ${HANDOFF_TOKEN} and nothing else.`,
    "- Never ask for passwords, card numbers, or other sensitive data.",
    "",
    "BUSINESS KNOWLEDGE:",
    kb,
  ]
    .filter((l) => l !== "")
    .join("\n");
}
