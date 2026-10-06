CREATE TABLE "profile_code" (
	"code_hash" text PRIMARY KEY NOT NULL,
	"grant_id" text NOT NULL,
	"code_challenge" text NOT NULL,
	"redirect_uri" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profile_grant" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"client_id" text NOT NULL,
	"scopes" text[] NOT NULL,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profile_link" (
	"user_id" text PRIMARY KEY NOT NULL,
	"hub_url" text NOT NULL,
	"access_token" text NOT NULL,
	"scopes" text[] NOT NULL,
	"data" jsonb NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profile_token" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"grant_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "resident_profile" (
	"user_id" text PRIMARY KEY NOT NULL,
	"data" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tenant" ADD COLUMN "profile_sync" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "profile_code" ADD CONSTRAINT "profile_code_grant_id_profile_grant_id_fk" FOREIGN KEY ("grant_id") REFERENCES "public"."profile_grant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_grant" ADD CONSTRAINT "profile_grant_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_link" ADD CONSTRAINT "profile_link_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_token" ADD CONSTRAINT "profile_token_grant_id_profile_grant_id_fk" FOREIGN KEY ("grant_id") REFERENCES "public"."profile_grant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resident_profile" ADD CONSTRAINT "resident_profile_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "profile_grant_user_client_idx" ON "profile_grant" USING btree ("user_id","client_id");--> statement-breakpoint
CREATE INDEX "profile_token_grant_idx" ON "profile_token" USING btree ("grant_id");