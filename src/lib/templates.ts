import type { FlowEdge, FlowGraph, FlowNode, FlowNodeType } from "@/db/schema";

type Step = { type: FlowNodeType; data?: Record<string, unknown>; branch?: { yes: Step[]; no: Step[] } };

/** Builds a top-to-bottom graph from a list of steps (supports one level of yes/no branching). */
export function linearGraph(triggerLabel: string, steps: Step[]): FlowGraph {
  const nodes: FlowNode[] = [];
  const edges: FlowEdge[] = [];
  let i = 0;
  const mk = (type: FlowNodeType, data: Record<string, unknown>, x: number, y: number) => {
    const id = `n${++i}`;
    nodes.push({ id, type, data, position: { x, y } });
    return id;
  };
  const link = (source: string, target: string, sourceHandle?: string) =>
    edges.push({ id: `e-${source}-${target}`, source, target, sourceHandle: sourceHandle ?? null });

  const trigger = mk("trigger", { label: triggerLabel }, 250, 0);
  const place = (list: Step[], from: string, handle: string | undefined, x: number, y: number): void => {
    let prev = from;
    let h = handle;
    let cy = y;
    for (const step of list) {
      const id = mk(step.type, step.data ?? {}, x, cy);
      link(prev, id, h);
      h = undefined;
      prev = id;
      cy += 130;
      if (step.branch) {
        place(step.branch.yes, id, "yes", x - 180, cy);
        place(step.branch.no, id, "no", x + 180, cy);
        return;
      }
    }
  };
  place(steps, trigger, undefined, 250, 130);
  return { nodes, edges };
}

export type AutomationTemplate = {
  key: string;
  name: string;
  description: string;
  category: string;
  channels: ("instagram" | "messenger")[];
  triggerType: "dm_keyword" | "comment_keyword" | "story_reply" | "new_conversation";
  keywords: string[];
  publicReply?: string;
  graph: FlowGraph;
};

export const TEMPLATES: AutomationTemplate[] = [
  {
    key: "ig-comment-to-dm",
    name: "Instagram Comment-to-DM",
    description: "When someone comments a keyword on your post or Reel, reply publicly and send them a DM with your link, then capture their email.",
    category: "Lead generation",
    channels: ["instagram"],
    triggerType: "comment_keyword",
    keywords: ["INFO", "LINK"],
    publicReply: "Just sent you a DM 📩",
    graph: linearGraph("Comment contains INFO or LINK", [
      { type: "send_message", data: { text: "Hey {{first_name}}! Thanks for your comment 🙌 Reply YES and I'll send the link right over." } },
      { type: "ask_question", data: { question: "Before I do, what's the best email to send extra resources to?", saveAs: "email" } },
      { type: "add_tag", data: { tag: "comment-lead" } },
      { type: "lead_score", data: { points: 20 } },
      { type: "send_message", data: { text: "Here you go: https://example.com/your-offer — let me know if you have any questions!" } },
    ]),
  },
  {
    key: "messenger-welcome",
    name: "Messenger Welcome Bot",
    description: "Greets every new conversation, asks what they need, and routes sales questions to your team.",
    category: "Customer support",
    channels: ["messenger", "instagram"],
    triggerType: "new_conversation",
    keywords: [],
    graph: linearGraph("New conversation started", [
      { type: "ask_question", data: { question: "Hi {{first_name}}, welcome! 👋 Are you looking for SALES help or SUPPORT?", saveAs: "intent" } },
      {
        type: "condition",
        data: { check: "reply_contains", value: "sales, price, buy, quote" },
        branch: {
          yes: [
            { type: "add_tag", data: { tag: "sales-inquiry" } },
            { type: "lead_score", data: { points: 25 } },
            { type: "notify", data: { message: "New sales inquiry from {{name}}" } },
            { type: "send_message", data: { text: "Great! A member of our team will be with you shortly." } },
          ],
          no: [{ type: "ai_reply", data: {} }],
        },
      },
    ]),
  },
  {
    key: "ai-support",
    name: "AI Customer Support Bot",
    description: "Answers any DM with your AI assistant using your knowledge base, and hands off to a human when it isn't sure.",
    category: "Customer support",
    channels: ["instagram", "messenger"],
    triggerType: "dm_keyword",
    keywords: ["help", "support", "question"],
    graph: linearGraph("DM contains help, support or question", [{ type: "ai_reply", data: {} }]),
  },
  {
    key: "lead-qualification",
    name: "Lead Qualification",
    description: "Collects name, email, and budget, scores the lead, and moves hot leads to Qualified.",
    category: "Lead generation",
    channels: ["instagram", "messenger"],
    triggerType: "dm_keyword",
    keywords: ["quote", "pricing", "price"],
    graph: linearGraph("DM contains quote, pricing or price", [
      { type: "ask_question", data: { question: "Happy to help with a quote! What's your name?", saveAs: "name" } },
      { type: "ask_question", data: { question: "Thanks {{first_name}}! What's the best email to reach you?", saveAs: "email" } },
      { type: "ask_question", data: { question: "Roughly what budget do you have in mind? (under $500, $500–2k, $2k+)", saveAs: "budget" } },
      {
        type: "condition",
        data: { check: "reply_contains", value: "2k, 2000, 5000, 10k, $2k+" },
        branch: {
          yes: [
            { type: "lead_score", data: { points: 50 } },
            { type: "set_stage", data: { stage: "qualified" } },
            { type: "notify", data: { message: "🔥 Hot lead: {{name}} ({{email}}) budget {{field.budget}}" } },
            { type: "send_message", data: { text: "Perfect — someone from our team will reach out within one business day." } },
          ],
          no: [
            { type: "lead_score", data: { points: 20 } },
            { type: "set_stage", data: { stage: "contacted" } },
            { type: "send_message", data: { text: "Thanks! We'll email you our packages shortly." } },
          ],
        },
      },
    ]),
  },
  {
    key: "booking-funnel",
    name: "Appointment Booking Funnel",
    description: "Sends your booking link when someone asks to book, tags them, and follows up after a day if needed.",
    category: "Appointments",
    channels: ["instagram", "messenger"],
    triggerType: "dm_keyword",
    keywords: ["book", "appointment", "schedule"],
    graph: linearGraph("DM contains book, appointment or schedule", [
      { type: "send_message", data: { text: "You can grab a time that works for you here: https://example.com/book 📅" } },
      { type: "add_tag", data: { tag: "booking-link-sent" } },
      { type: "set_stage", data: { stage: "contacted" } },
      { type: "lead_score", data: { points: 30 } },
    ]),
  },
  {
    key: "story-reply",
    name: "Story Reply Thank-You",
    description: "Thanks people who reply to or mention your Instagram Story and invites them to learn more.",
    category: "Engagement",
    channels: ["instagram"],
    triggerType: "story_reply",
    keywords: [],
    graph: linearGraph("Someone replies to or mentions your Story", [
      { type: "send_message", data: { text: "Thanks for the love on our story, {{first_name}}! 💜 Want me to send you our latest offer?" } },
      { type: "add_tag", data: { tag: "story-engaged" } },
      { type: "lead_score", data: { points: 10 } },
    ]),
  },
  {
    key: "real-estate",
    name: "Real Estate Lead Capture",
    description: "Qualifies buyers and sellers from Instagram and Messenger and alerts your agents.",
    category: "Industry",
    channels: ["instagram", "messenger"],
    triggerType: "dm_keyword",
    keywords: ["house", "home", "listing", "sell", "buy"],
    graph: linearGraph("DM mentions a home, listing, buying or selling", [
      { type: "ask_question", data: { question: "Are you looking to BUY or SELL?", saveAs: "intent" } },
      { type: "ask_question", data: { question: "Which area or neighborhood?", saveAs: "area" } },
      { type: "ask_question", data: { question: "What's the best phone number for an agent to reach you?", saveAs: "phone" } },
      { type: "lead_score", data: { points: 40 } },
      { type: "set_stage", data: { stage: "qualified" } },
      { type: "notify", data: { message: "New real estate lead: {{name}} wants to {{field.intent}} in {{field.area}} — {{phone}}" } },
      { type: "send_message", data: { text: "Thanks! An agent will call you shortly." } },
    ]),
  },
  {
    key: "church-visitor",
    name: "Church Visitor Follow-Up",
    description: "Welcomes first-time visitors who message your page and connects them with your team.",
    category: "Industry",
    channels: ["instagram", "messenger"],
    triggerType: "dm_keyword",
    keywords: ["visit", "visitor", "service times", "new here"],
    graph: linearGraph("DM mentions visiting", [
      { type: "send_message", data: { text: "We'd love to see you, {{first_name}}! 🙏 Our service times are listed at https://example.com/visit" } },
      { type: "ask_question", data: { question: "Would you like someone from our welcome team to reach out? If so, share your email.", saveAs: "email" } },
      { type: "add_tag", data: { tag: "first-time-visitor" } },
      { type: "notify", data: { message: "New visitor: {{name}} ({{email}})" } },
    ]),
  },
  {
    key: "restaurant",
    name: "Restaurant Customer Engagement",
    description: "Answers menu, hours, and reservation questions and shares your reservation link.",
    category: "Industry",
    channels: ["instagram", "messenger"],
    triggerType: "dm_keyword",
    keywords: ["menu", "reservation", "hours", "table"],
    graph: linearGraph("DM mentions menu, hours or reservations", [
      { type: "send_message", data: { text: "Hi {{first_name}}! 🍽️ Our menu: https://example.com/menu — reserve a table: https://example.com/reserve" } },
      { type: "add_tag", data: { tag: "diner" } },
    ]),
  },
  {
    key: "product-launch",
    name: "Product Launch Giveaway",
    description: "Comment-to-DM for launch posts: sends the launch link and tags everyone who engaged.",
    category: "Sales",
    channels: ["instagram", "messenger"],
    triggerType: "comment_keyword",
    keywords: ["LAUNCH", "WANT"],
    publicReply: "Check your DMs! 🎁",
    graph: linearGraph("Comment contains LAUNCH or WANT", [
      { type: "send_message", data: { text: "You're in, {{first_name}}! 🎉 Here's early access: https://example.com/launch" } },
      { type: "add_tag", data: { tag: "launch-2026" } },
      { type: "lead_score", data: { points: 15 } },
    ]),
  },
];

export const BLANK_GRAPH: FlowGraph = linearGraph("When this happens…", [
  { type: "send_message", data: { text: "Hi {{first_name}}! Thanks for reaching out." } },
]);
