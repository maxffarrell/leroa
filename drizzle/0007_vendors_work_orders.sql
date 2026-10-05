CREATE TYPE "public"."ticket_author" AS ENUM('staff', 'vendor', 'tenant');--> statement-breakpoint
CREATE TABLE "ticket_note" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"ticket_id" text NOT NULL,
	"author_type" "ticket_author" NOT NULL,
	"author_id" text,
	"vendor_id" text,
	"author_name" text NOT NULL,
	"body" text NOT NULL,
	"internal" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vendor" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"contact_name" text,
	"email" text,
	"phone" text,
	"trades" text[] DEFAULT '{}'::text[] NOT NULL,
	"notes" text,
	"insurance_expires_on" date,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "maintenance_ticket" ADD COLUMN "vendor_id" text;--> statement-breakpoint
ALTER TABLE "maintenance_ticket" ADD COLUMN "cost_amount" integer;--> statement-breakpoint
ALTER TABLE "maintenance_ticket" ADD COLUMN "vendor_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ticket_note" ADD CONSTRAINT "ticket_note_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_note" ADD CONSTRAINT "ticket_note_ticket_id_maintenance_ticket_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."maintenance_ticket"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_note" ADD CONSTRAINT "ticket_note_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_note" ADD CONSTRAINT "ticket_note_vendor_id_vendor_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendor"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor" ADD CONSTRAINT "vendor_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ticket_note_ticket_idx" ON "ticket_note" USING btree ("ticket_id","created_at");--> statement-breakpoint
CREATE INDEX "vendor_org_idx" ON "vendor" USING btree ("organization_id","name");--> statement-breakpoint
ALTER TABLE "maintenance_ticket" ADD CONSTRAINT "maintenance_ticket_vendor_id_vendor_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendor"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ticket_vendor_idx" ON "maintenance_ticket" USING btree ("vendor_id");--> statement-breakpoint
INSERT INTO "vendor" ("id", "organization_id", "name")
SELECT gen_random_uuid()::text, s."organization_id", s."name"
FROM (
	SELECT DISTINCT "organization_id", btrim("vendor") AS "name"
	FROM "maintenance_ticket"
	WHERE "vendor" IS NOT NULL AND btrim("vendor") <> ''
) s;--> statement-breakpoint
UPDATE "maintenance_ticket" t
SET "vendor_id" = v."id"
FROM "vendor" v
WHERE v."organization_id" = t."organization_id" AND v."name" = btrim(t."vendor") AND t."vendor_id" IS NULL;
