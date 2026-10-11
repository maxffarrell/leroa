ALTER TABLE "document" ADD COLUMN "category" text;--> statement-breakpoint
ALTER TABLE "notification_settings" ADD COLUMN "ai_digest" boolean DEFAULT true NOT NULL;