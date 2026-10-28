ALTER TYPE "public"."post_vis" ADD VALUE 'private';--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "mood" integer;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "feelings" jsonb DEFAULT '[]'::jsonb NOT NULL;