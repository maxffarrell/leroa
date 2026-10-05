CREATE TYPE "public"."agreement_status" AS ENUM('draft', 'sent', 'signed', 'void');--> statement-breakpoint
CREATE TABLE "agreement_signer" (
	"agreement_id" text NOT NULL,
	"tenant_id" text NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"signed_name" text,
	"signed_at" timestamp with time zone,
	"signed_by_user_id" text,
	"ip" text,
	"user_agent" text,
	CONSTRAINT "agreement_signer_agreement_id_tenant_id_pk" PRIMARY KEY("agreement_id","tenant_id")
);
--> statement-breakpoint
CREATE TABLE "lease_agreement" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"lease_id" text NOT NULL,
	"template_id" text,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"status" "agreement_status" DEFAULT 'draft' NOT NULL,
	"content_hash" text,
	"sent_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"document_id" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lease_template" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agreement_signer" ADD CONSTRAINT "agreement_signer_agreement_id_lease_agreement_id_fk" FOREIGN KEY ("agreement_id") REFERENCES "public"."lease_agreement"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agreement_signer" ADD CONSTRAINT "agreement_signer_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agreement_signer" ADD CONSTRAINT "agreement_signer_signed_by_user_id_user_id_fk" FOREIGN KEY ("signed_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lease_agreement" ADD CONSTRAINT "lease_agreement_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lease_agreement" ADD CONSTRAINT "lease_agreement_lease_id_lease_id_fk" FOREIGN KEY ("lease_id") REFERENCES "public"."lease"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lease_agreement" ADD CONSTRAINT "lease_agreement_template_id_lease_template_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."lease_template"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lease_agreement" ADD CONSTRAINT "lease_agreement_document_id_document_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."document"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lease_agreement" ADD CONSTRAINT "lease_agreement_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lease_template" ADD CONSTRAINT "lease_template_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agreement_signer_tenant_idx" ON "agreement_signer" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "lease_agreement_lease_idx" ON "lease_agreement" USING btree ("organization_id","lease_id");--> statement-breakpoint
CREATE INDEX "lease_template_org_idx" ON "lease_template" USING btree ("organization_id","name");