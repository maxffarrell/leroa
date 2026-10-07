CREATE TYPE "public"."ti_status" AS ENUM('planned', 'approved', 'in_progress', 'complete');--> statement-breakpoint
CREATE TABLE "lease_ti_item" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"lease_id" text NOT NULL,
	"name" text NOT NULL,
	"status" "ti_status" DEFAULT 'planned' NOT NULL,
	"budget_amount" integer DEFAULT 0 NOT NULL,
	"actual_amount" integer DEFAULT 0 NOT NULL,
	"due_date" date,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lease_ti_item" ADD CONSTRAINT "lease_ti_item_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lease_ti_item" ADD CONSTRAINT "lease_ti_item_lease_id_lease_id_fk" FOREIGN KEY ("lease_id") REFERENCES "public"."lease"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lease_ti_lease_idx" ON "lease_ti_item" USING btree ("lease_id");