CREATE TYPE "public"."lead_note_kind" AS ENUM('note', 'call', 'email', 'text', 'inquiry');--> statement-breakpoint
CREATE TYPE "public"."lead_source" AS ENUM('website', 'listing', 'application', 'phone', 'email', 'walk_in', 'referral', 'listing_site', 'api', 'other');--> statement-breakpoint
CREATE TYPE "public"."lead_stage" AS ENUM('new', 'contacted', 'touring', 'applied', 'leased', 'lost');--> statement-breakpoint
CREATE TYPE "public"."tour_kind" AS ENUM('in_person', 'virtual', 'self_guided');--> statement-breakpoint
CREATE TYPE "public"."tour_status" AS ENUM('scheduled', 'completed', 'no_show', 'cancelled');--> statement-breakpoint
CREATE TABLE "lead" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"stage" "lead_stage" DEFAULT 'new' NOT NULL,
	"source" "lead_source" DEFAULT 'other' NOT NULL,
	"source_detail" text,
	"first_name" text NOT NULL,
	"last_name" text DEFAULT '' NOT NULL,
	"email" text,
	"phone" text,
	"property_id" text,
	"listing_id" text,
	"move_in_date" date,
	"bedrooms" integer,
	"budget_max" integer,
	"message" text,
	"assigned_to" text,
	"next_follow_up_on" date,
	"last_contacted_at" timestamp with time zone,
	"waitlist" boolean DEFAULT false NOT NULL,
	"waitlisted_at" timestamp with time zone,
	"lost_reason" text,
	"application_id" text,
	"tenant_id" text,
	"consent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead_note" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"lead_id" text NOT NULL,
	"kind" "lead_note_kind" DEFAULT 'note' NOT NULL,
	"body" text NOT NULL,
	"author_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leasing_settings" (
	"organization_id" text PRIMARY KEY NOT NULL,
	"self_booking" boolean DEFAULT false NOT NULL,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"tour_days" integer[] DEFAULT '{1,2,3,4,5,6}'::integer[] NOT NULL,
	"tour_start" integer DEFAULT 600 NOT NULL,
	"tour_end" integer DEFAULT 1080 NOT NULL,
	"slot_minutes" integer DEFAULT 30 NOT NULL,
	"notice_hours" integer DEFAULT 12 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tour" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"lead_id" text NOT NULL,
	"property_id" text NOT NULL,
	"listing_id" text,
	"starts_at" timestamp with time zone NOT NULL,
	"duration_minutes" integer DEFAULT 30 NOT NULL,
	"kind" "tour_kind" DEFAULT 'in_person' NOT NULL,
	"status" "tour_status" DEFAULT 'scheduled' NOT NULL,
	"agent_id" text,
	"self_booked" boolean DEFAULT false NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notification_settings" ADD COLUMN "new_leads" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "property" ADD COLUMN "marketing_description" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "property" ADD COLUMN "amenities" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "property" ADD COLUMN "public_page" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "lead" ADD CONSTRAINT "lead_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead" ADD CONSTRAINT "lead_property_id_property_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."property"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead" ADD CONSTRAINT "lead_listing_id_listing_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listing"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead" ADD CONSTRAINT "lead_assigned_to_user_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead" ADD CONSTRAINT "lead_application_id_rental_application_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."rental_application"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead" ADD CONSTRAINT "lead_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_note" ADD CONSTRAINT "lead_note_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_note" ADD CONSTRAINT "lead_note_lead_id_lead_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."lead"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_note" ADD CONSTRAINT "lead_note_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leasing_settings" ADD CONSTRAINT "leasing_settings_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tour" ADD CONSTRAINT "tour_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tour" ADD CONSTRAINT "tour_lead_id_lead_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."lead"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tour" ADD CONSTRAINT "tour_property_id_property_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."property"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tour" ADD CONSTRAINT "tour_listing_id_listing_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listing"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tour" ADD CONSTRAINT "tour_agent_id_user_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lead_org_stage_idx" ON "lead" USING btree ("organization_id","stage","created_at");--> statement-breakpoint
CREATE INDEX "lead_org_email_idx" ON "lead" USING btree ("organization_id","email");--> statement-breakpoint
CREATE INDEX "lead_org_follow_up_idx" ON "lead" USING btree ("organization_id","next_follow_up_on");--> statement-breakpoint
CREATE INDEX "lead_waitlist_idx" ON "lead" USING btree ("organization_id","waitlist");--> statement-breakpoint
CREATE INDEX "lead_note_lead_idx" ON "lead_note" USING btree ("lead_id","created_at");--> statement-breakpoint
CREATE INDEX "tour_org_starts_idx" ON "tour" USING btree ("organization_id","starts_at");--> statement-breakpoint
CREATE INDEX "tour_lead_idx" ON "tour" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "tour_property_starts_idx" ON "tour" USING btree ("property_id","starts_at");