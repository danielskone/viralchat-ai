ALTER TYPE "public"."provider" ADD VALUE 'youtube';--> statement-breakpoint
CREATE TABLE "youtube_automations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"status" "automation_status" DEFAULT 'draft' NOT NULL,
	"any_word" boolean DEFAULT false NOT NULL,
	"keywords" text[] DEFAULT '{}'::text[] NOT NULL,
	"video_ids" text[] DEFAULT '{}'::text[] NOT NULL,
	"replies" text[] DEFAULT '{}'::text[] NOT NULL,
	"link" text DEFAULT '' NOT NULL,
	"replies_count" integer DEFAULT 0 NOT NULL,
	"last_reply_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "youtube_replies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"automation_id" uuid,
	"comment_id" text NOT NULL,
	"video_id" text,
	"author_name" text,
	"comment_text" text,
	"reply_text" text,
	"status" text DEFAULT 'sending' NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "youtube_automations" ADD CONSTRAINT "youtube_automations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "youtube_replies" ADD CONSTRAINT "youtube_replies_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "youtube_replies" ADD CONSTRAINT "youtube_replies_automation_id_youtube_automations_id_fk" FOREIGN KEY ("automation_id") REFERENCES "public"."youtube_automations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "yt_automations_ws_idx" ON "youtube_automations" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "yt_replies_comment_idx" ON "youtube_replies" USING btree ("workspace_id","comment_id");--> statement-breakpoint
CREATE INDEX "yt_replies_ws_idx" ON "youtube_replies" USING btree ("workspace_id","created_at");