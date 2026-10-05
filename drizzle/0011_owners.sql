CREATE TABLE "owner" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"phone" text,
	"notes" text,
	"portal_user_id" text,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "property_owner" (
	"property_id" text NOT NULL,
	"owner_id" text NOT NULL,
	CONSTRAINT "property_owner_property_id_owner_id_pk" PRIMARY KEY("property_id","owner_id")
);
--> statement-breakpoint
ALTER TABLE "owner" ADD CONSTRAINT "owner_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "owner" ADD CONSTRAINT "owner_portal_user_id_user_id_fk" FOREIGN KEY ("portal_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_owner" ADD CONSTRAINT "property_owner_property_id_property_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."property"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_owner" ADD CONSTRAINT "property_owner_owner_id_owner_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."owner"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "owner_org_idx" ON "owner" USING btree ("organization_id","name");--> statement-breakpoint
CREATE INDEX "owner_portal_user_idx" ON "owner" USING btree ("portal_user_id");--> statement-breakpoint
CREATE INDEX "property_owner_owner_idx" ON "property_owner" USING btree ("owner_id");