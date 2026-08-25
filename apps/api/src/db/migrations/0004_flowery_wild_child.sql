CREATE TABLE "share_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"content" jsonb NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "shares" DROP CONSTRAINT "shares_document_id_documents_id_fk";
--> statement-breakpoint
ALTER TABLE "shares" ALTER COLUMN "document_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "shares" ADD COLUMN "snapshot_id" uuid;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "emoji" varchar(32);--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "language" varchar(32);--> statement-breakpoint
WITH src AS (
	SELECT s."id" AS share_id, s."document_id" AS doc_id, gen_random_uuid() AS snapshot_id, d."title", d."content", d."created_at"
	FROM "shares" s
	JOIN "documents" d ON d."id" = s."document_id"
	WHERE s."snapshot_id" IS NULL AND s."document_id" IS NOT NULL
), ins AS (
	INSERT INTO "share_snapshots" ("id", "title", "content", "created_at")
	SELECT snapshot_id, title, content, created_at FROM src
), upd AS (
	UPDATE "shares" s SET "snapshot_id" = src.snapshot_id FROM src WHERE s."id" = src.share_id
)
DELETE FROM "documents" d WHERE d."id" IN (SELECT doc_id FROM src);
--> statement-breakpoint
UPDATE "shares" s SET "document_id" = NULL
WHERE s."document_id" IS NOT NULL
AND NOT EXISTS (SELECT 1 FROM "documents" d WHERE d."id" = s."document_id");
--> statement-breakpoint
UPDATE "documents" SET "owner_id" = 'local-dev' WHERE "owner_id" IS NULL;
--> statement-breakpoint
ALTER TABLE "documents" ALTER COLUMN "owner_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "shares" ADD CONSTRAINT "shares_snapshot_id_share_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."share_snapshots"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shares" ADD CONSTRAINT "shares_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;
