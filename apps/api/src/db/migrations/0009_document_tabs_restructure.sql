ALTER TABLE "documents" RENAME TO "document_tabs";--> statement-breakpoint
ALTER TABLE "document_tabs" RENAME CONSTRAINT "documents_pkey" TO "document_tabs_pkey";--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" varchar(255) NOT NULL,
	"title" text NOT NULL,
	"project_id" uuid,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "documents_owner_idx" ON "documents" USING btree ("owner_id","updated_at" DESC NULLS LAST);--> statement-breakpoint
ALTER TABLE "document_tabs" ADD COLUMN "document_id" uuid;--> statement-breakpoint
ALTER TABLE "document_tabs" ADD COLUMN "position" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
WITH mapping AS (
	SELECT "id" AS tab_id, gen_random_uuid() AS doc_id FROM "document_tabs"
), ins AS (
	INSERT INTO "documents" ("id", "owner_id", "title", "project_id", "updated_at", "created_at")
	SELECT m.doc_id, t."owner_id", t."title", t."project_id", t."updated_at", t."created_at"
	FROM "document_tabs" t
	JOIN mapping m ON m.tab_id = t."id"
)
UPDATE "document_tabs" t SET "document_id" = m.doc_id FROM mapping m WHERE t."id" = m.tab_id;
--> statement-breakpoint
ALTER TABLE "document_tabs" ALTER COLUMN "document_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "document_tabs" ADD CONSTRAINT "document_tabs_document_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "document_tabs_document_idx" ON "document_tabs" USING btree ("document_id","position");--> statement-breakpoint
ALTER TABLE "document_tabs" DROP COLUMN "project_id";--> statement-breakpoint
ALTER TABLE "document_versions" RENAME COLUMN "document_id" TO "tab_id";--> statement-breakpoint
ALTER TABLE "shares" RENAME COLUMN "document_id" TO "tab_id";--> statement-breakpoint
ALTER TABLE "pool_request" RENAME COLUMN "document_id" TO "tab_id";--> statement-breakpoint
ALTER TABLE "document_versions" RENAME CONSTRAINT "document_versions_document_id_documents_id_fk" TO "document_versions_tab_id_document_tabs_id_fk";--> statement-breakpoint
ALTER TABLE "shares" RENAME CONSTRAINT "shares_document_id_documents_id_fk" TO "shares_tab_id_document_tabs_id_fk";--> statement-breakpoint
ALTER TABLE "pool_request" RENAME CONSTRAINT "pool_request_document_id_documents_id_fk" TO "pool_request_tab_id_document_tabs_id_fk";
