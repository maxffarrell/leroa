CREATE TABLE "saved_view" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"page" text NOT NULL,
	"name" text NOT NULL,
	"state" jsonb NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "saved_view" ADD CONSTRAINT "saved_view_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_view" ADD CONSTRAINT "saved_view_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "saved_view_org_page_idx" ON "saved_view" USING btree ("organization_id","page");--> statement-breakpoint
CREATE UNIQUE INDEX "saved_view_name_idx" ON "saved_view" USING btree ("organization_id","page","name");