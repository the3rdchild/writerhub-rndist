CREATE TYPE "public"."identity_origin" AS ENUM('ransel', 'ppe');--> statement-breakpoint
CREATE TABLE "identity" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"origin" "identity_origin" NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "identity_user_origin_idx" ON "identity" USING btree ("user_id","origin");
