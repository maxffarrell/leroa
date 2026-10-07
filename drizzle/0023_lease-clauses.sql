CREATE TYPE "public"."clause_kind" AS ENUM('option_to_renew', 'option_to_expand', 'option_to_purchase', 'right_of_first_refusal', 'exclusivity', 'termination_option', 'escalation', 'percentage_rent', 'subletting', 'insurance', 'other');--> statement-breakpoint
CREATE TABLE "lease_clause" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"lease_id" text NOT NULL,
	"kind" "clause_kind" DEFAULT 'other' NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lease_critical_date" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"lease_id" text NOT NULL,
	"clause_id" text,
	"label" text NOT NULL,
	"date" date NOT NULL,
	"remind_days" integer DEFAULT 30 NOT NULL,
	"done_at" timestamp,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lease_clause" ADD CONSTRAINT "lease_clause_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lease_clause" ADD CONSTRAINT "lease_clause_lease_id_lease_id_fk" FOREIGN KEY ("lease_id") REFERENCES "public"."lease"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lease_critical_date" ADD CONSTRAINT "lease_critical_date_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lease_critical_date" ADD CONSTRAINT "lease_critical_date_lease_id_lease_id_fk" FOREIGN KEY ("lease_id") REFERENCES "public"."lease"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lease_critical_date" ADD CONSTRAINT "lease_critical_date_clause_id_lease_clause_id_fk" FOREIGN KEY ("clause_id") REFERENCES "public"."lease_clause"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lease_clause_lease_idx" ON "lease_clause" USING btree ("lease_id");--> statement-breakpoint
CREATE INDEX "critical_date_lease_idx" ON "lease_critical_date" USING btree ("lease_id");--> statement-breakpoint
CREATE INDEX "critical_date_org_date_idx" ON "lease_critical_date" USING btree ("organization_id","date");