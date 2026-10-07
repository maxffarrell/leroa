CREATE TYPE "public"."guest_pass_status" AS ENUM('active', 'used', 'void');--> statement-breakpoint
CREATE TYPE "public"."key_kind" AS ENUM('key', 'fob', 'remote', 'card', 'other');--> statement-breakpoint
CREATE TYPE "public"."key_status" AS ENUM('issued', 'returned', 'lost');--> statement-breakpoint
CREATE TYPE "public"."parking_permit_status" AS ENUM('active', 'revoked');--> statement-breakpoint
CREATE TABLE "guest_pass" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"property_id" text NOT NULL,
	"unit_id" text,
	"tenant_id" text,
	"guest_name" text NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date NOT NULL,
	"status" "guest_pass_status" DEFAULT 'active' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "key_record" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"property_id" text NOT NULL,
	"unit_id" text,
	"tenant_id" text,
	"kind" "key_kind" DEFAULT 'key' NOT NULL,
	"label" text NOT NULL,
	"status" "key_status" DEFAULT 'issued' NOT NULL,
	"issued_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "parking_permit" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"property_id" text NOT NULL,
	"unit_id" text,
	"tenant_id" text,
	"permit_number" text NOT NULL,
	"vehicle" text,
	"status" "parking_permit_status" DEFAULT 'active' NOT NULL,
	"expires_on" date,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "guest_pass" ADD CONSTRAINT "guest_pass_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guest_pass" ADD CONSTRAINT "guest_pass_property_id_property_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."property"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guest_pass" ADD CONSTRAINT "guest_pass_unit_id_unit_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."unit"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guest_pass" ADD CONSTRAINT "guest_pass_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "key_record" ADD CONSTRAINT "key_record_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "key_record" ADD CONSTRAINT "key_record_property_id_property_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."property"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "key_record" ADD CONSTRAINT "key_record_unit_id_unit_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."unit"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "key_record" ADD CONSTRAINT "key_record_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parking_permit" ADD CONSTRAINT "parking_permit_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parking_permit" ADD CONSTRAINT "parking_permit_property_id_property_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."property"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parking_permit" ADD CONSTRAINT "parking_permit_unit_id_unit_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."unit"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parking_permit" ADD CONSTRAINT "parking_permit_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "guest_pass_org_idx" ON "guest_pass" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "key_record_org_idx" ON "key_record" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "parking_permit_org_idx" ON "parking_permit" USING btree ("organization_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "parking_permit_number_idx" ON "parking_permit" USING btree ("property_id","permit_number");