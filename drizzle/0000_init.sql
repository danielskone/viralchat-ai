CREATE TYPE "public"."automation_status" AS ENUM('draft', 'active', 'paused');--> statement-breakpoint
CREATE TYPE "public"."channel" AS ENUM('instagram', 'messenger', 'demo', 'test');--> statement-breakpoint
CREATE TYPE "public"."conversation_status" AS ENUM('open', 'pending', 'closed');--> statement-breakpoint
CREATE TYPE "public"."direction" AS ENUM('inbound', 'outbound');--> statement-breakpoint
CREATE TYPE "public"."integration_status" AS ENUM('disconnected', 'connected', 'error');--> statement-breakpoint
CREATE TYPE "public"."lead_temperature" AS ENUM('hot', 'warm', 'cold');--> statement-breakpoint
CREATE TYPE "public"."message_status" AS ENUM('received', 'queued', 'sent', 'failed', 'simulated');--> statement-breakpoint
CREATE TYPE "public"."plan" AS ENUM('free', 'starter', 'professional', 'business', 'agency');--> statement-breakpoint
CREATE TYPE "public"."provider" AS ENUM('meta', 'openai');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('owner', 'admin', 'staff');--> statement-breakpoint
CREATE TYPE "public"."run_status" AS ENUM('running', 'waiting', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."sender_type" AS ENUM('contact', 'agent', 'automation', 'ai', 'system');--> statement-breakpoint
CREATE TYPE "public"."trigger_type" AS ENUM('dm_keyword', 'comment_keyword', 'story_reply', 'new_conversation');--> statement-breakpoint
CREATE TABLE "activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"contact_id" uuid,
	"type" text NOT NULL,
	"description" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid,
	"user_id" uuid,
	"action" text NOT NULL,
	"target" text,
	"meta" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "automation_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"automation_id" uuid NOT NULL,
	"contact_id" uuid,
	"conversation_id" uuid,
	"status" "run_status" DEFAULT 'running' NOT NULL,
	"is_test" boolean DEFAULT false NOT NULL,
	"current_node_id" text,
	"waiting_for" text,
	"resume_at" timestamp with time zone,
	"context" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"log" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"error" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "automations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"status" "automation_status" DEFAULT 'draft' NOT NULL,
	"trigger_type" "trigger_type" DEFAULT 'dm_keyword' NOT NULL,
	"channels" text[] DEFAULT '{instagram,messenger}'::text[] NOT NULL,
	"keywords" text[] DEFAULT '{}'::text[] NOT NULL,
	"match_type" text DEFAULT 'contains' NOT NULL,
	"post_id" text,
	"public_reply" text,
	"graph" jsonb NOT NULL,
	"template_key" text,
	"runs_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chatbots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text DEFAULT 'Ava' NOT NULL,
	"avatar_url" text,
	"enabled" boolean DEFAULT false NOT NULL,
	"greeting" text DEFAULT 'Hi! How can I help you today?' NOT NULL,
	"tone" text DEFAULT 'friendly' NOT NULL,
	"personality" text DEFAULT '' NOT NULL,
	"objective" text DEFAULT 'support' NOT NULL,
	"booking_url" text,
	"fallback_message" text DEFAULT 'Great question — let me get a teammate to help you with that.' NOT NULL,
	"handoff_keywords" text[] DEFAULT '{human,agent,person,representative}'::text[] NOT NULL,
	"channels" text[] DEFAULT '{instagram,messenger}'::text[] NOT NULL,
	"languages" text DEFAULT 'auto' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contact_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"author_id" uuid,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text DEFAULT 'Unknown' NOT NULL,
	"email" text,
	"phone" text,
	"avatar_url" text,
	"source" text DEFAULT 'manual' NOT NULL,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"lead_score" integer DEFAULT 0 NOT NULL,
	"temperature" "lead_temperature" DEFAULT 'cold' NOT NULL,
	"stage" text DEFAULT 'new_lead' NOT NULL,
	"owner_id" uuid,
	"custom_fields" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"instagram_id" text,
	"messenger_id" text,
	"instagram_username" text,
	"opted_out" boolean DEFAULT false NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"last_activity_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"channel" "channel" NOT NULL,
	"status" "conversation_status" DEFAULT 'open' NOT NULL,
	"assigned_to" uuid,
	"human_takeover" boolean DEFAULT false NOT NULL,
	"priority" boolean DEFAULT false NOT NULL,
	"labels" text[] DEFAULT '{}'::text[] NOT NULL,
	"unread_count" integer DEFAULT 0 NOT NULL,
	"last_message_preview" text,
	"last_message_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_inbound_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "integrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"provider" "provider" NOT NULL,
	"status" "integration_status" DEFAULT 'disconnected' NOT NULL,
	"page_id" text,
	"page_name" text,
	"instagram_account_id" text,
	"instagram_username" text,
	"secret_enc" text,
	"scopes" text[],
	"last_error" text,
	"connected_at" timestamp with time zone,
	"connected_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"email" text NOT NULL,
	"role" "role" DEFAULT 'staff' NOT NULL,
	"token_hash" text NOT NULL,
	"invited_by" uuid,
	"accepted_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invitations_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "knowledge_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"type" text DEFAULT 'text' NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"source_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memberships" (
	"workspace_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "role" DEFAULT 'staff' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "memberships_workspace_id_user_id_pk" PRIMARY KEY("workspace_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"direction" "direction" NOT NULL,
	"sender_type" "sender_type" NOT NULL,
	"sender_user_id" uuid,
	"body" text NOT NULL,
	"is_internal_note" boolean DEFAULT false NOT NULL,
	"external_id" text,
	"status" "message_status" NOT NULL,
	"error" text,
	"automation_run_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" uuid,
	"title" text NOT NULL,
	"body" text,
	"href" text,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saved_replies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"password_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" text NOT NULL,
	"dedupe_key" text NOT NULL,
	"payload" jsonb NOT NULL,
	"error" text,
	"processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"business_type" text,
	"website" text,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"plan" "plan" DEFAULT 'free' NOT NULL,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"subscription_status" text,
	"current_period_end" timestamp with time zone,
	"onboarding_completed" boolean DEFAULT false NOT NULL,
	"demo_mode" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspaces_stripe_customer_id_unique" UNIQUE("stripe_customer_id"),
	CONSTRAINT "workspaces_stripe_subscription_id_unique" UNIQUE("stripe_subscription_id")
);
--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_runs" ADD CONSTRAINT "automation_runs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_runs" ADD CONSTRAINT "automation_runs_automation_id_automations_id_fk" FOREIGN KEY ("automation_id") REFERENCES "public"."automations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_runs" ADD CONSTRAINT "automation_runs_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_runs" ADD CONSTRAINT "automation_runs_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automations" ADD CONSTRAINT "automations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chatbots" ADD CONSTRAINT "chatbots_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_notes" ADD CONSTRAINT "contact_notes_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_notes" ADD CONSTRAINT "contact_notes_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_notes" ADD CONSTRAINT "contact_notes_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integrations" ADD CONSTRAINT "integrations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integrations" ADD CONSTRAINT "integrations_connected_by_users_id_fk" FOREIGN KEY ("connected_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_items" ADD CONSTRAINT "knowledge_items_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_user_id_users_id_fk" FOREIGN KEY ("sender_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_replies" ADD CONSTRAINT "saved_replies_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activities_contact_idx" ON "activities" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "activities_ws_idx" ON "activities" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "audit_ws_idx" ON "audit_logs" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "runs_ws_idx" ON "automation_runs" USING btree ("workspace_id","started_at");--> statement-breakpoint
CREATE INDEX "runs_waiting_idx" ON "automation_runs" USING btree ("status","resume_at");--> statement-breakpoint
CREATE INDEX "runs_conv_idx" ON "automation_runs" USING btree ("conversation_id","status");--> statement-breakpoint
CREATE INDEX "automations_ws_idx" ON "automations" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "chatbots_ws_idx" ON "chatbots" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "contact_notes_contact_idx" ON "contact_notes" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "contacts_ws_idx" ON "contacts" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "contacts_ws_ig_idx" ON "contacts" USING btree ("workspace_id","instagram_id");--> statement-breakpoint
CREATE UNIQUE INDEX "contacts_ws_msgr_idx" ON "contacts" USING btree ("workspace_id","messenger_id");--> statement-breakpoint
CREATE INDEX "contacts_ws_email_idx" ON "contacts" USING btree ("workspace_id","email");--> statement-breakpoint
CREATE INDEX "conversations_ws_idx" ON "conversations" USING btree ("workspace_id","last_message_at");--> statement-breakpoint
CREATE UNIQUE INDEX "conversations_contact_channel_idx" ON "conversations" USING btree ("contact_id","channel");--> statement-breakpoint
CREATE UNIQUE INDEX "integrations_ws_provider_idx" ON "integrations" USING btree ("workspace_id","provider");--> statement-breakpoint
CREATE INDEX "integrations_page_idx" ON "integrations" USING btree ("page_id");--> statement-breakpoint
CREATE INDEX "integrations_ig_idx" ON "integrations" USING btree ("instagram_account_id");--> statement-breakpoint
CREATE INDEX "knowledge_ws_idx" ON "knowledge_items" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "messages_conv_idx" ON "messages" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "messages_ws_idx" ON "messages" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "notifications_ws_idx" ON "notifications" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_events_dedupe_idx" ON "webhook_events" USING btree ("source","dedupe_key");