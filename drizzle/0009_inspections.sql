CREATE TYPE "public"."inspection_kind" AS ENUM('move_in', 'move_out', 'routine');--> statement-breakpoint
CREATE TYPE "public"."inspection_status" AS ENUM('in_progress', 'completed');--> statement-breakpoint
CREATE TYPE "public"."item_condition" AS ENUM('good', 'fair', 'poor', 'damaged', 'na');--> statement-breakpoint
CREATE TABLE "inspection" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"unit_id" text NOT NULL,
	"lease_id" text,
	"kind" "inspection_kind" NOT NULL,
	"status" "inspection_status" DEFAULT 'in_progress' NOT NULL,
	"scheduled_for" date,
	"summary" text,
	"completed_at" timestamp with time zone,
	"completed_by" text,
	"document_id" text,
	"acknowledged_at" timestamp with time zone,
	"acknowledged_by" text,
	"tenant_comment" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inspection_item" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"inspection_id" text NOT NULL,
	"area" text NOT NULL,
	"label" text NOT NULL,
	"condition" "item_condition",
	"notes" text,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "inspection" ADD CONSTRAINT "inspection_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspection" ADD CONSTRAINT "inspection_unit_id_unit_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."unit"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspection" ADD CONSTRAINT "inspection_lease_id_lease_id_fk" FOREIGN KEY ("lease_id") REFERENCES "public"."lease"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspection" ADD CONSTRAINT "inspection_completed_by_user_id_fk" FOREIGN KEY ("completed_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspection" ADD CONSTRAINT "inspection_document_id_document_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."document"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspection" ADD CONSTRAINT "inspection_acknowledged_by_user_id_fk" FOREIGN KEY ("acknowledged_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspection" ADD CONSTRAINT "inspection_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspection_item" ADD CONSTRAINT "inspection_item_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspection_item" ADD CONSTRAINT "inspection_item_inspection_id_inspection_id_fk" FOREIGN KEY ("inspection_id") REFERENCES "public"."inspection"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "inspection_org_idx" ON "inspection" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "inspection_lease_idx" ON "inspection" USING btree ("lease_id");--> statement-breakpoint
CREATE INDEX "inspection_unit_idx" ON "inspection" USING btree ("unit_id");--> statement-breakpoint
CREATE INDEX "inspection_item_inspection_idx" ON "inspection_item" USING btree ("inspection_id","position");