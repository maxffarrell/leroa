ALTER TYPE "public"."payment_method" ADD VALUE 'paypal' BEFORE 'other';--> statement-breakpoint
ALTER TYPE "public"."payment_method" ADD VALUE 'direct_debit' BEFORE 'other';