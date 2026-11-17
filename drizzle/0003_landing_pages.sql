CREATE TABLE "form_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"page_id" uuid,
	"contact_id" uuid,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "landing_pages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"title" text DEFAULT 'Untitled page' NOT NULL,
	"headline" text DEFAULT '' NOT NULL,
	"subheadline" text,
	"body" text,
	"image_url" text,
	"button_text" text DEFAULT 'Send' NOT NULL,
	"fields" jsonb DEFAULT '{"phone":true,"phoneRequired":false,"message":false}'::jsonb NOT NULL,
	"after_submit" text DEFAULT 'message' NOT NULL,
	"success_message" text,
	"tag_on_submit" text,
	"stage_on_submit" text,
	"published" boolean DEFAULT false NOT NULL,
	"submissions" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "form_submissions" ADD CONSTRAINT "form_submissions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_submissions" ADD CONSTRAINT "form_submissions_page_id_landing_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."landing_pages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_submissions" ADD CONSTRAINT "form_submissions_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "landing_pages" ADD CONSTRAINT "landing_pages_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "form_submissions_page_idx" ON "form_submissions" USING btree ("page_id","created_at");--> statement-breakpoint
CREATE INDEX "form_submissions_ws_idx" ON "form_submissions" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "landing_pages_ws_idx" ON "landing_pages" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "landing_pages_slug_idx" ON "landing_pages" USING btree ("slug");