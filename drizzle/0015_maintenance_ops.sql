CREATE TYPE "public"."asset_kind" AS ENUM('appliance', 'boiler', 'electrical', 'elevator', 'hvac', 'laundry', 'plumbing', 'pool', 'roof', 'safety', 'water_heater', 'other');--> statement-breakpoint
CREATE TYPE "public"."pm_interval" AS ENUM('weeks', 'months', 'years');--> statement-breakpoint
CREATE TYPE "public"."turn_stage" AS ENUM('move_out', 'make_ready', 'listed', 'done');--> statement-breakpoint
CREATE TABLE "asset" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"property_id" text NOT NULL,
	"unit_id" text,
	"vendor_id" text,
	"name" text NOT NULL,
	"kind" "asset_kind" DEFAULT 'other' NOT NULL,
	"make" text,
	"model" text,
	"serial_number" text,
	"installed_on" date,
	"warranty_expires_on" date,
	"notes" text,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pm_schedule" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"property_id" text NOT NULL,
	"unit_id" text,
	"asset_id" text,
	"title" text NOT NULL,
	"description" text,
	"priority" "ticket_priority" DEFAULT 'normal' NOT NULL,
	"vendor_id" text,
	"assignee_id" text,
	"every" integer DEFAULT 1 NOT NULL,
	"interval" "pm_interval" DEFAULT 'months' NOT NULL,
	"next_run_on" date NOT NULL,
	"last_run_on" date,
	"lead_days" integer DEFAULT 7 NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "unit_turn" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"unit_id" text NOT NULL,
	"lease_id" text,
	"stage" "turn_stage" DEFAULT 'move_out' NOT NULL,
	"move_out_on" date,
	"target_ready_on" date,
	"notes" text,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "maintenance_ticket" ADD COLUMN "asset_id" text;--> statement-breakpoint
ALTER TABLE "maintenance_ticket" ADD COLUMN "schedule_id" text;--> statement-breakpoint
ALTER TABLE "notification_settings" ADD COLUMN "vendor_insurance_alerts" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "asset" ADD CONSTRAINT "asset_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset" ADD CONSTRAINT "asset_property_id_property_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."property"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset" ADD CONSTRAINT "asset_unit_id_unit_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."unit"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset" ADD CONSTRAINT "asset_vendor_id_vendor_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendor"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pm_schedule" ADD CONSTRAINT "pm_schedule_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pm_schedule" ADD CONSTRAINT "pm_schedule_property_id_property_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."property"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pm_schedule" ADD CONSTRAINT "pm_schedule_unit_id_unit_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."unit"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pm_schedule" ADD CONSTRAINT "pm_schedule_asset_id_asset_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."asset"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pm_schedule" ADD CONSTRAINT "pm_schedule_vendor_id_vendor_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendor"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pm_schedule" ADD CONSTRAINT "pm_schedule_assignee_id_user_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unit_turn" ADD CONSTRAINT "unit_turn_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unit_turn" ADD CONSTRAINT "unit_turn_unit_id_unit_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."unit"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unit_turn" ADD CONSTRAINT "unit_turn_lease_id_lease_id_fk" FOREIGN KEY ("lease_id") REFERENCES "public"."lease"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "asset_org_idx" ON "asset" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "asset_property_idx" ON "asset" USING btree ("property_id");--> statement-breakpoint
CREATE INDEX "asset_unit_idx" ON "asset" USING btree ("unit_id");--> statement-breakpoint
CREATE INDEX "pm_schedule_org_idx" ON "pm_schedule" USING btree ("organization_id","enabled");--> statement-breakpoint
CREATE INDEX "pm_schedule_property_idx" ON "pm_schedule" USING btree ("property_id");--> statement-breakpoint
CREATE INDEX "unit_turn_org_idx" ON "unit_turn" USING btree ("organization_id","stage");--> statement-breakpoint
CREATE UNIQUE INDEX "unit_turn_open_idx" ON "unit_turn" USING btree ("organization_id","unit_id") WHERE "unit_turn"."completed_at" is null;--> statement-breakpoint
ALTER TABLE "maintenance_ticket" ADD CONSTRAINT "maintenance_ticket_asset_id_asset_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."asset"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_ticket" ADD CONSTRAINT "maintenance_ticket_schedule_id_pm_schedule_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."pm_schedule"("id") ON DELETE set null ON UPDATE no action;