CREATE TYPE "public"."share_access" AS ENUM('anyone', 'restricted');--> statement-breakpoint
CREATE TYPE "public"."share_role" AS ENUM('viewer', 'commenter', 'editor');--> statement-breakpoint
CREATE TABLE "share_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"share_id" uuid NOT NULL,
	"content" jsonb NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "share_snapshots_share_id_unique" UNIQUE("share_id")
);
--> statement-breakpoint
CREATE TABLE "shares" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid,
	"token" varchar(255) NOT NULL,
	"access" "share_access" NOT NULL,
	"role" "share_role" NOT NULL,
	"created_by" varchar(255),
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shares_token_unique" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "share_snapshots" ADD CONSTRAINT "share_snapshots_share_id_shares_id_fk" FOREIGN KEY ("share_id") REFERENCES "public"."shares"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shares" ADD CONSTRAINT "shares_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;