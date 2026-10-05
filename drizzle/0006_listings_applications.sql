CREATE TYPE "public"."application_status" AS ENUM('new', 'reviewing', 'approved', 'declined', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."listing_status" AS ENUM('draft', 'published', 'closed');--> statement-breakpoint
CREATE TABLE "listing" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"unit_id" text NOT NULL,
	"status" "listing_status" DEFAULT 'draft' NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"rent_amount" integer NOT NULL,
	"deposit_amount" integer DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"available_on" date,
	"lease_term_months" integer,
	"pet_policy" text,
	"amenities" text[] DEFAULT '{}'::text[] NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rental_application" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"listing_id" text,
	"unit_id" text,
	"status" "application_status" DEFAULT 'new' NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"move_in_date" date,
	"occupants" integer DEFAULT 1 NOT NULL,
	"pets" text,
	"employer" text,
	"monthly_income" integer,
	"current_address" text,
	"message" text,
	"notes" text,
	"consent_at" timestamp with time zone NOT NULL,
	"ip" text,
	"user_agent" text,
	"decided_at" timestamp with time zone,
	"decided_by" text,
	"tenant_id" text,
	"lease_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notification_settings" ADD COLUMN "new_applications" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "listing" ADD CONSTRAINT "listing_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing" ADD CONSTRAINT "listing_unit_id_unit_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."unit"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rental_application" ADD CONSTRAINT "rental_application_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rental_application" ADD CONSTRAINT "rental_application_listing_id_listing_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listing"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rental_application" ADD CONSTRAINT "rental_application_unit_id_unit_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."unit"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rental_application" ADD CONSTRAINT "rental_application_decided_by_user_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rental_application" ADD CONSTRAINT "rental_application_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rental_application" ADD CONSTRAINT "rental_application_lease_id_lease_id_fk" FOREIGN KEY ("lease_id") REFERENCES "public"."lease"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "listing_org_status_idx" ON "listing" USING btree ("organization_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "listing_open_unit_idx" ON "listing" USING btree ("unit_id") WHERE "listing"."status" <> 'closed';--> statement-breakpoint
CREATE INDEX "application_org_status_idx" ON "rental_application" USING btree ("organization_id","status","created_at");--> statement-breakpoint
CREATE INDEX "application_listing_idx" ON "rental_application" USING btree ("listing_id");--> statement-breakpoint
CREATE INDEX "application_email_idx" ON "rental_application" USING btree ("listing_id","email");