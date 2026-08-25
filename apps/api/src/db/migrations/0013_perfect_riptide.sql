INSERT INTO "projects" ("owner_id", "name")
SELECT DISTINCT i."id", 'Dokumen Saya'
FROM "documents" d
JOIN "identity" i ON i."user_id" = d."owner_id" AND i."origin" = 'ppe'
WHERE d."project_id" IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM "projects" p WHERE p."owner_id" = i."id" AND p."name" = 'Dokumen Saya'
  );--> statement-breakpoint
UPDATE "documents" d
SET "project_id" = p."id"
FROM "identity" i, "projects" p
WHERE d."project_id" IS NULL
  AND i."user_id" = d."owner_id" AND i."origin" = 'ppe'
  AND p."owner_id" = i."id" AND p."name" = 'Dokumen Saya';--> statement-breakpoint
ALTER TABLE "documents" DROP CONSTRAINT "documents_project_id_projects_id_fk";--> statement-breakpoint
DROP INDEX "documents_owner_idx";--> statement-breakpoint
ALTER TABLE "documents" ALTER COLUMN "project_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "documents_project_idx" ON "documents" USING btree ("project_id","updated_at" DESC NULLS LAST);--> statement-breakpoint
ALTER TABLE "documents" DROP COLUMN "owner_id";--> statement-breakpoint
ALTER TABLE "document_tabs" DROP COLUMN "owner_id";
