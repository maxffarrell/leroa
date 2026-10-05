ALTER TABLE "charge" ADD COLUMN "applies_to_charge_id" text;--> statement-breakpoint
ALTER TABLE "lease" ADD COLUMN "late_fee_amount" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "lease" ADD COLUMN "late_fee_grace_days" integer DEFAULT 5 NOT NULL;--> statement-breakpoint
ALTER TABLE "lease" ADD COLUMN "renewed_from_id" text;--> statement-breakpoint
CREATE UNIQUE INDEX "charge_late_fee_idx" ON "charge" USING btree ("applies_to_charge_id") WHERE "charge"."kind" = 'fee';--> statement-breakpoint
CREATE INDEX "lease_renewed_from_idx" ON "lease" USING btree ("renewed_from_id");