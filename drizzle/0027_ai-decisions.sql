ALTER TABLE "lead" ADD COLUMN "ai_score" text;--> statement-breakpoint
ALTER TABLE "lead" ADD COLUMN "ai_score_reason" text;--> statement-breakpoint
ALTER TABLE "maintenance_ticket" ADD COLUMN "duplicate_of" text;--> statement-breakpoint
ALTER TABLE "message" ADD COLUMN "ai_category" text;--> statement-breakpoint
CREATE INDEX "ticket_dup_idx" ON "maintenance_ticket" USING btree ("duplicate_of");