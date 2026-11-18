ALTER TYPE "public"."plan" ADD VALUE 'pro';--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "trial_ends_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "addons" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "billing_exempt" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- Workspaces that existed before billing (the owner's own and beta testers) keep full access.
UPDATE "workspaces" SET "billing_exempt" = true;
