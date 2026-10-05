ALTER TYPE "public"."payment_method" ADD VALUE 'bilt' BEFORE 'other';--> statement-breakpoint
CREATE TABLE "payment_provider" (
	"organization_id" text NOT NULL,
	"provider" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"account_id" text,
	"account_ready" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_provider_organization_id_provider_pk" PRIMARY KEY("organization_id","provider")
);
--> statement-breakpoint
ALTER TABLE "payment" ADD COLUMN "external_id" text;--> statement-breakpoint
ALTER TABLE "payment_provider" ADD CONSTRAINT "payment_provider_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payment_provider_account_idx" ON "payment_provider" USING btree ("provider","account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_external_idx" ON "payment" USING btree ("external_id");