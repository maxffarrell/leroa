CREATE TABLE "custom_field" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"entity" text NOT NULL,
	"name" text NOT NULL,
	"type" text DEFAULT 'text' NOT NULL,
	"options" jsonb,
	"position" integer DEFAULT 0 NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "custom_field_value" (
	"id" text PRIMARY KEY NOT NULL,
	"field_id" text NOT NULL,
	"record_id" text NOT NULL,
	"value" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "custom_field" ADD CONSTRAINT "custom_field_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_field_value" ADD CONSTRAINT "custom_field_value_field_id_custom_field_id_fk" FOREIGN KEY ("field_id") REFERENCES "public"."custom_field"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "custom_field_org_entity_idx" ON "custom_field" USING btree ("organization_id","entity");--> statement-breakpoint
CREATE UNIQUE INDEX "custom_field_name_idx" ON "custom_field" USING btree ("organization_id","entity","name");--> statement-breakpoint
CREATE UNIQUE INDEX "custom_field_value_once_idx" ON "custom_field_value" USING btree ("field_id","record_id");--> statement-breakpoint
CREATE INDEX "custom_field_value_record_idx" ON "custom_field_value" USING btree ("record_id");