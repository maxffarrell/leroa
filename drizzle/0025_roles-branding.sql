CREATE TABLE "member_property_scope" (
	"member_id" text NOT NULL,
	"property_id" text NOT NULL,
	CONSTRAINT "member_property_scope_member_id_property_id_pk" PRIMARY KEY("member_id","property_id")
);
--> statement-breakpoint
CREATE TABLE "org_role" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"permissions" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "member" ADD COLUMN "custom_role_id" text;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "accent_color" text;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "portal_title" text;--> statement-breakpoint
ALTER TABLE "member_property_scope" ADD CONSTRAINT "member_property_scope_member_id_member_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."member"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_role" ADD CONSTRAINT "org_role_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "member_scope_property_idx" ON "member_property_scope" USING btree ("property_id");--> statement-breakpoint
CREATE UNIQUE INDEX "org_role_name_idx" ON "org_role" USING btree ("organization_id","name");--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_custom_role_id_org_role_id_fk" FOREIGN KEY ("custom_role_id") REFERENCES "public"."org_role"("id") ON DELETE set null ON UPDATE no action;