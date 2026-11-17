import {
  pgTable,
  pgEnum,
  uuid,
  text,
  timestamp,
  boolean,
  integer,
  jsonb,
  primaryKey,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

export const roleEnum = pgEnum("role", ["owner", "admin", "staff"]);
export const planEnum = pgEnum("plan", ["free", "starter", "professional", "business", "agency"]);
export const channelEnum = pgEnum("channel", ["instagram", "messenger", "demo", "test"]);
export const providerEnum = pgEnum("provider", ["meta", "openai"]);
export const integrationStatusEnum = pgEnum("integration_status", ["disconnected", "connected", "error"]);
export const leadTempEnum = pgEnum("lead_temperature", ["hot", "warm", "cold"]);
export const conversationStatusEnum = pgEnum("conversation_status", ["open", "pending", "closed"]);
export const directionEnum = pgEnum("direction", ["inbound", "outbound"]);
export const senderEnum = pgEnum("sender_type", ["contact", "agent", "automation", "ai", "system"]);
export const messageStatusEnum = pgEnum("message_status", ["received", "queued", "sent", "failed", "simulated"]);
export const automationStatusEnum = pgEnum("automation_status", ["draft", "active", "paused"]);
export const triggerTypeEnum = pgEnum("trigger_type", [
  "dm_keyword",
  "comment_keyword",
  "story_reply",
  "new_conversation",
]);
export const runStatusEnum = pgEnum("run_status", ["running", "waiting", "completed", "failed"]);

// ───────────────────────── Identity ─────────────────────────

export const users = pgTable("users", {
  id: id(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  createdAt: createdAt(),
});

export const sessions = pgTable(
  "sessions",
  {
    // sha256 of the opaque token stored in the cookie
    id: text("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const workspaces = pgTable("workspaces", {
  id: id(),
  name: text("name").notNull(),
  businessType: text("business_type"),
  website: text("website"),
  timezone: text("timezone").notNull().default("UTC"),
  plan: planEnum("plan").notNull().default("free"),
  stripeCustomerId: text("stripe_customer_id").unique(),
  stripeSubscriptionId: text("stripe_subscription_id").unique(),
  subscriptionStatus: text("subscription_status"),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
  onboardingCompleted: boolean("onboarding_completed").notNull().default(false),
  demoMode: boolean("demo_mode").notNull().default(false),
  createdAt: createdAt(),
});

export const memberships = pgTable(
  "memberships",
  {
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: roleEnum("role").notNull().default("staff"),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.workspaceId, t.userId] })],
);

export const invitations = pgTable("invitations", {
  id: id(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  role: roleEnum("role").notNull().default("staff"),
  tokenHash: text("token_hash").notNull().unique(),
  invitedBy: uuid("invited_by").references(() => users.id, { onDelete: "set null" }),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: createdAt(),
});

// ───────────────────────── Integrations ─────────────────────────

export const integrations = pgTable(
  "integrations",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    provider: providerEnum("provider").notNull(),
    status: integrationStatusEnum("status").notNull().default("disconnected"),
    // Facebook Page id (messenger) — also the routing key for webhooks
    pageId: text("page_id"),
    pageName: text("page_name"),
    // Instagram professional account id linked to the page
    instagramAccountId: text("instagram_account_id"),
    instagramUsername: text("instagram_username"),
    // AES-256-GCM encrypted secrets (page access token, API key…)
    secretEnc: text("secret_enc"),
    scopes: text("scopes").array(),
    lastError: text("last_error"),
    connectedAt: timestamp("connected_at", { withTimezone: true }),
    connectedBy: uuid("connected_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("integrations_ws_provider_idx").on(t.workspaceId, t.provider),
    index("integrations_page_idx").on(t.pageId),
    index("integrations_ig_idx").on(t.instagramAccountId),
  ],
);

export const webhookEvents = pgTable(
  "webhook_events",
  {
    id: id(),
    source: text("source").notNull(), // meta | stripe
    dedupeKey: text("dedupe_key").notNull(),
    payload: jsonb("payload").notNull(),
    error: text("error"),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("webhook_events_dedupe_idx").on(t.source, t.dedupeKey)],
);

// ───────────────────────── CRM ─────────────────────────

export const contacts = pgTable(
  "contacts",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull().default("Unknown"),
    email: text("email"),
    phone: text("phone"),
    avatarUrl: text("avatar_url"),
    source: text("source").notNull().default("manual"), // manual | instagram | messenger | import | demo
    tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
    leadScore: integer("lead_score").notNull().default(0),
    temperature: leadTempEnum("temperature").notNull().default("cold"),
    stage: text("stage").notNull().default("new_lead"),
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
    customFields: jsonb("custom_fields").$type<Record<string, string>>().notNull().default({}),
    // External platform identifiers: { instagram: IGSID, messenger: PSID }
    instagramId: text("instagram_id"),
    messengerId: text("messenger_id"),
    instagramUsername: text("instagram_username"),
    optedOut: boolean("opted_out").notNull().default(false),
    isDemo: boolean("is_demo").notNull().default(false),
    lastActivityAt: timestamp("last_activity_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("contacts_ws_idx").on(t.workspaceId),
    uniqueIndex("contacts_ws_ig_idx").on(t.workspaceId, t.instagramId),
    uniqueIndex("contacts_ws_msgr_idx").on(t.workspaceId, t.messengerId),
    index("contacts_ws_email_idx").on(t.workspaceId, t.email),
  ],
);

export const contactNotes = pgTable(
  "contact_notes",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    authorId: uuid("author_id").references(() => users.id, { onDelete: "set null" }),
    body: text("body").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("contact_notes_contact_idx").on(t.contactId)],
);

export const activities = pgTable(
  "activities",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "cascade" }),
    type: text("type").notNull(), // stage_changed | tag_added | automation_ran | note | created …
    description: text("description").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("activities_contact_idx").on(t.contactId), index("activities_ws_idx").on(t.workspaceId)],
);

// ───────────────────────── Inbox ─────────────────────────

export const conversations = pgTable(
  "conversations",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    channel: channelEnum("channel").notNull(),
    status: conversationStatusEnum("status").notNull().default("open"),
    assignedTo: uuid("assigned_to").references(() => users.id, { onDelete: "set null" }),
    // Human takeover: when true, automations and AI never reply
    humanTakeover: boolean("human_takeover").notNull().default(false),
    priority: boolean("priority").notNull().default(false),
    labels: text("labels").array().notNull().default(sql`'{}'::text[]`),
    unreadCount: integer("unread_count").notNull().default(0),
    lastMessagePreview: text("last_message_preview"),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }).notNull().defaultNow(),
    // Meta standard messaging window: replies allowed within 24h of last user message
    lastInboundAt: timestamp("last_inbound_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    index("conversations_ws_idx").on(t.workspaceId, t.lastMessageAt),
    uniqueIndex("conversations_contact_channel_idx").on(t.contactId, t.channel),
  ],
);

export const messages = pgTable(
  "messages",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    direction: directionEnum("direction").notNull(),
    senderType: senderEnum("sender_type").notNull(),
    senderUserId: uuid("sender_user_id").references(() => users.id, { onDelete: "set null" }),
    body: text("body").notNull(),
    // internal team note — never sent to the contact
    isInternalNote: boolean("is_internal_note").notNull().default(false),
    externalId: text("external_id"),
    status: messageStatusEnum("status").notNull(),
    error: text("error"),
    automationRunId: uuid("automation_run_id"),
    createdAt: createdAt(),
  },
  (t) => [
    index("messages_conv_idx").on(t.conversationId, t.createdAt),
    // dedupes webhook retries / concurrent deliveries (NULL external ids never conflict)
    uniqueIndex("messages_conv_external_idx").on(t.conversationId, t.externalId),
    index("messages_ws_idx").on(t.workspaceId, t.createdAt),
  ],
);

export const savedReplies = pgTable("saved_replies", {
  id: id(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  body: text("body").notNull(),
  createdAt: createdAt(),
});

// ───────────────────────── Automations ─────────────────────────

export type FlowNodeType =
  | "trigger"
  | "send_message"
  | "ask_question"
  | "condition"
  | "add_tag"
  | "remove_tag"
  | "set_field"
  | "lead_score"
  | "set_stage"
  | "ai_reply"
  | "delay"
  | "notify"
  | "handoff"
  | "webhook"
  | "end";

export type FlowNode = {
  id: string;
  type: FlowNodeType;
  position: { x: number; y: number };
  data: Record<string, unknown>;
};

export type FlowEdge = {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null; // "yes" | "no" for condition nodes
};

export type FlowGraph = { nodes: FlowNode[]; edges: FlowEdge[] };

export const automations = pgTable(
  "automations",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    status: automationStatusEnum("status").notNull().default("draft"),
    triggerType: triggerTypeEnum("trigger_type").notNull().default("dm_keyword"),
    // Which channels the trigger listens on
    channels: text("channels").array().notNull().default(sql`'{instagram,messenger}'::text[]`),
    keywords: text("keywords").array().notNull().default(sql`'{}'::text[]`),
    matchType: text("match_type").notNull().default("contains"), // exact | contains | starts_with
    // Optional: restrict comment triggers to one post/reel id
    postId: text("post_id"),
    // For comment triggers: optional public reply posted under the comment
    publicReply: text("public_reply"),
    graph: jsonb("graph").$type<FlowGraph>().notNull(),
    templateKey: text("template_key"),
    runsCount: integer("runs_count").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("automations_ws_idx").on(t.workspaceId)],
);

export type RunLogEntry = {
  at: string;
  nodeId: string;
  nodeType: string;
  status: "ok" | "error" | "skipped" | "waiting";
  message: string;
};

export const automationRuns = pgTable(
  "automation_runs",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    automationId: uuid("automation_id")
      .notNull()
      .references(() => automations.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id").references(() => conversations.id, { onDelete: "cascade" }),
    status: runStatusEnum("status").notNull().default("running"),
    isTest: boolean("is_test").notNull().default(false),
    currentNodeId: text("current_node_id"),
    // waiting for a reply (ask_question) or a timer (delay)
    waitingFor: text("waiting_for"), // reply | timer
    resumeAt: timestamp("resume_at", { withTimezone: true }),
    context: jsonb("context").$type<Record<string, unknown>>().notNull().default({}),
    log: jsonb("log").$type<RunLogEntry[]>().notNull().default([]),
    error: text("error"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [
    index("runs_ws_idx").on(t.workspaceId, t.startedAt),
    index("runs_waiting_idx").on(t.status, t.resumeAt),
    index("runs_conv_idx").on(t.conversationId, t.status),
  ],
);

// ───────────────────────── AI ─────────────────────────

export const chatbots = pgTable(
  "chatbots",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull().default("Ava"),
    avatarUrl: text("avatar_url"),
    enabled: boolean("enabled").notNull().default(false),
    greeting: text("greeting").notNull().default("Hi! How can I help you today?"),
    tone: text("tone").notNull().default("friendly"),
    personality: text("personality").notNull().default(""),
    objective: text("objective").notNull().default("support"), // support | sales | booking | lead_qualification
    bookingUrl: text("booking_url"),
    fallbackMessage: text("fallback_message")
      .notNull()
      .default("Great question — let me get a teammate to help you with that."),
    handoffKeywords: text("handoff_keywords").array().notNull().default(sql`'{human,agent,person,representative}'::text[]`),
    channels: text("channels").array().notNull().default(sql`'{instagram,messenger}'::text[]`),
    languages: text("languages").notNull().default("auto"),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("chatbots_ws_idx").on(t.workspaceId)],
);

export const knowledgeItems = pgTable(
  "knowledge_items",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    type: text("type").notNull().default("text"), // faq | text | pricing | policy | url
    title: text("title").notNull(),
    content: text("content").notNull(),
    sourceUrl: text("source_url"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("knowledge_ws_idx").on(t.workspaceId)],
);

// ───────────────────────── Booking ─────────────────────────

/** Weekly opening hours, local to the booking page's time zone. Keys 0–6 = Sunday–Saturday. */
export type WeeklyHours = Record<string, { start: string; end: string }[]>;

export const bookingPages = pgTable(
  "booking_pages",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    enabled: boolean("enabled").notNull().default(false),
    title: text("title").notNull().default("Book a call"),
    description: text("description"),
    durationMinutes: integer("duration_minutes").notNull().default(30),
    bufferMinutes: integer("buffer_minutes").notNull().default(0),
    minNoticeHours: integer("min_notice_hours").notNull().default(2),
    maxDaysAhead: integer("max_days_ahead").notNull().default(30),
    timezone: text("timezone").notNull().default("UTC"),
    weeklyHours: jsonb("weekly_hours").$type<WeeklyHours>().notNull().default({}),
    confirmationMessage: text("confirmation_message"),
    tagOnBooking: text("tag_on_booking").default("booked"),
    stageOnBooking: text("stage_on_booking"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("booking_pages_ws_idx").on(t.workspaceId), uniqueIndex("booking_pages_slug_idx").on(t.slug)],
);

export const bookings = pgTable(
  "bookings",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    email: text("email"),
    phone: text("phone"),
    notes: text("notes"),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    status: text("status").notNull().default("confirmed"), // confirmed | cancelled
    createdAt: createdAt(),
  },
  (t) => [
    index("bookings_ws_start_idx").on(t.workspaceId, t.startsAt),
    index("bookings_contact_idx").on(t.contactId),
    // Two confirmed bookings can't start at the same moment (guards against double-booking races).
    uniqueIndex("bookings_ws_slot_idx").on(t.workspaceId, t.startsAt).where(sql`status = 'confirmed'`),
  ],
);

// ───────────────────────── Landing pages & forms ─────────────────────────

export type LandingFields = { phone: boolean; phoneRequired: boolean; message: boolean };

export const landingPages = pgTable(
  "landing_pages",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    title: text("title").notNull().default("Untitled page"),
    headline: text("headline").notNull().default(""),
    subheadline: text("subheadline"),
    body: text("body"),
    imageUrl: text("image_url"),
    buttonText: text("button_text").notNull().default("Send"),
    fields: jsonb("fields").$type<LandingFields>().notNull().default({ phone: true, phoneRequired: false, message: false }),
    afterSubmit: text("after_submit").notNull().default("message"), // message | booking
    successMessage: text("success_message"),
    tagOnSubmit: text("tag_on_submit"),
    stageOnSubmit: text("stage_on_submit"),
    published: boolean("published").notNull().default(false),
    submissions: integer("submissions").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("landing_pages_ws_idx").on(t.workspaceId), uniqueIndex("landing_pages_slug_idx").on(t.slug)],
);

export const formSubmissions = pgTable(
  "form_submissions",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    pageId: uuid("page_id").references(() => landingPages.id, { onDelete: "set null" }),
    contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "set null" }),
    data: jsonb("data").$type<Record<string, string>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [index("form_submissions_page_idx").on(t.pageId, t.createdAt), index("form_submissions_ws_idx").on(t.workspaceId, t.createdAt)],
);

// ───────────────────────── Broadcasts ─────────────────────────

export type BroadcastAudience = { channel: "all" | "instagram" | "messenger"; tag?: string | null; stage?: string | null };

export const broadcasts = pgTable(
  "broadcasts",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    message: text("message").notNull().default(""),
    audience: jsonb("audience").$type<BroadcastAudience>().notNull().default({ channel: "all" }),
    status: text("status").notNull().default("draft"), // draft | sending | sent
    sentCount: integer("sent_count").notNull().default(0),
    failedCount: integer("failed_count").notNull().default(0),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("broadcasts_ws_idx").on(t.workspaceId, t.createdAt)],
);

export const broadcastRecipients = pgTable(
  "broadcast_recipients",
  {
    id: id(),
    broadcastId: uuid("broadcast_id")
      .notNull()
      .references(() => broadcasts.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id").references(() => conversations.id, { onDelete: "set null" }),
    contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "set null" }),
    status: text("status").notNull(), // sent | failed
    error: text("error"),
    createdAt: createdAt(),
  },
  (t) => [index("broadcast_recipients_b_idx").on(t.broadcastId), uniqueIndex("broadcast_recipients_conv_idx").on(t.broadcastId, t.conversationId)],
);

// ───────────────────────── Ops ─────────────────────────

export const notifications = pgTable(
  "notifications",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    body: text("body"),
    href: text("href"),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("notifications_ws_idx").on(t.workspaceId, t.createdAt)],
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: id(),
    workspaceId: uuid("workspace_id").references(() => workspaces.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    target: text("target"),
    meta: jsonb("meta").$type<Record<string, unknown>>(),
    createdAt: createdAt(),
  },
  (t) => [index("audit_ws_idx").on(t.workspaceId, t.createdAt)],
);

export type User = typeof users.$inferSelect;
export type Workspace = typeof workspaces.$inferSelect;
export type Contact = typeof contacts.$inferSelect;
export type Conversation = typeof conversations.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type Automation = typeof automations.$inferSelect;
export type AutomationRun = typeof automationRuns.$inferSelect;
export type Chatbot = typeof chatbots.$inferSelect;
export type Integration = typeof integrations.$inferSelect;
export type Role = (typeof roleEnum.enumValues)[number];
export type Plan = (typeof planEnum.enumValues)[number];
export type BookingPage = typeof bookingPages.$inferSelect;
export type Booking = typeof bookings.$inferSelect;
export type LandingPage = typeof landingPages.$inferSelect;
export type FormSubmission = typeof formSubmissions.$inferSelect;
export type Broadcast = typeof broadcasts.$inferSelect;
export type Channel = (typeof channelEnum.enumValues)[number];
