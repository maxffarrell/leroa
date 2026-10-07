CREATE TYPE "public"."booking_status" AS ENUM('confirmed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."package_status" AS ENUM('awaiting_pickup', 'picked_up');--> statement-breakpoint
CREATE TABLE "amenity" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"property_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"open_hour" integer DEFAULT 8 NOT NULL,
	"close_hour" integer DEFAULT 21 NOT NULL,
	"slot_minutes" integer DEFAULT 120 NOT NULL,
	"max_days_ahead" integer DEFAULT 14 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "amenity_booking" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"amenity_id" text NOT NULL,
	"tenant_id" text,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"status" "booking_status" DEFAULT 'confirmed' NOT NULL,
	"notes" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "package_log" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"property_id" text NOT NULL,
	"unit_id" text,
	"tenant_id" text,
	"carrier" text,
	"tracking" text,
	"description" text,
	"status" "package_status" DEFAULT 'awaiting_pickup' NOT NULL,
	"received_by" text,
	"picked_up_at" timestamp with time zone,
	"notified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "amenity" ADD CONSTRAINT "amenity_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "amenity" ADD CONSTRAINT "amenity_property_id_property_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."property"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "amenity_booking" ADD CONSTRAINT "amenity_booking_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "amenity_booking" ADD CONSTRAINT "amenity_booking_amenity_id_amenity_id_fk" FOREIGN KEY ("amenity_id") REFERENCES "public"."amenity"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "amenity_booking" ADD CONSTRAINT "amenity_booking_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "amenity_booking" ADD CONSTRAINT "amenity_booking_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "package_log" ADD CONSTRAINT "package_log_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "package_log" ADD CONSTRAINT "package_log_property_id_property_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."property"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "package_log" ADD CONSTRAINT "package_log_unit_id_unit_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."unit"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "package_log" ADD CONSTRAINT "package_log_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "package_log" ADD CONSTRAINT "package_log_received_by_user_id_fk" FOREIGN KEY ("received_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "amenity_property_idx" ON "amenity" USING btree ("property_id");--> statement-breakpoint
CREATE INDEX "amenity_booking_amenity_idx" ON "amenity_booking" USING btree ("amenity_id","starts_at");--> statement-breakpoint
CREATE INDEX "amenity_booking_org_idx" ON "amenity_booking" USING btree ("organization_id","starts_at");--> statement-breakpoint
CREATE INDEX "package_log_org_idx" ON "package_log" USING btree ("organization_id","status","created_at");