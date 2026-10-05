CREATE TABLE "integration_connection" (
	"organization_id" text NOT NULL,
	"integration_id" text NOT NULL,
	"access_token" text NOT NULL,
	"refresh_token" text,
	"expires_at" timestamp with time zone,
	"params" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"account" text DEFAULT '' NOT NULL,
	"account_name" text,
	"status" text DEFAULT 'connected' NOT NULL,
	"connected_by" text,
	"sync_started_at" timestamp with time zone,
	"last_sync_at" timestamp with time zone,
	"last_sync_result" jsonb,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "integration_connection_organization_id_integration_id_pk" PRIMARY KEY("organization_id","integration_id")
);
--> statement-breakpoint
CREATE TABLE "integration_link" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"integration_id" text NOT NULL,
	"account" text DEFAULT '' NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"external_id" text,
	"status" text NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "integration_connection" ADD CONSTRAINT "integration_connection_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_connection" ADD CONSTRAINT "integration_connection_connected_by_user_id_fk" FOREIGN KEY ("connected_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_link" ADD CONSTRAINT "integration_link_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "integration_link_entity_idx" ON "integration_link" USING btree ("organization_id","integration_id","account","entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "integration_link_status_idx" ON "integration_link" USING btree ("organization_id","integration_id","status");