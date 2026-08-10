-- M1 restrukturisasi dokumen (docs/DOCUMENT-TABS-RESTRUCTURE-PLAN.md §4).
-- DITULIS TANGAN - jangan pernah regenerasi migrasi ini dengan db:generate:
-- drizzle-kit tidak mengenali penggantian nama tabel dan akan menghasilkan
-- DROP+CREATE yang menghapus seluruh dokumen pengguna.
--
-- Karena versi/share/aktivitas tetap melekat per TAB, UUID yang mereka simpan
-- tetap valid tanpa backfill: tabel `documents` lama hanya diganti nama jadi
-- `document_tabs`, lalu dibuat tabel `documents` induk yang baru.

-- 1. Tabel lama jadi tabel tab. FK dari document_versions/shares/pool_request
--    otomatis ikut menunjuk tabel hasil rename.
ALTER TABLE "documents" RENAME TO "document_tabs";--> statement-breakpoint
ALTER TABLE "document_tabs" RENAME CONSTRAINT "documents_pkey" TO "document_tabs_pkey";--> statement-breakpoint

-- 2. Induk baru: judul, pemilik, dan proyek tinggal di sini. Konten/emoji/
--    bahasa milik tab, bukan dokumen.
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

-- 3. Tab menunjuk induknya; `position` mengatur urutan tab dalam dokumen.
ALTER TABLE "document_tabs" ADD COLUMN "document_id" uuid;--> statement-breakpoint
ALTER TABLE "document_tabs" ADD COLUMN "position" integer DEFAULT 0 NOT NULL;--> statement-breakpoint

-- 4. Backfill: tiap baris tab lama mendapat satu dokumen induk; judul, pemilik,
--    proyek, dan stempel waktu ikut pindah. Satu statement WITH...INSERT...
--    UPDATE mengikuti pola terbukti di migrasi 0004 - CTE `mapping` dievaluasi
--    sekali sehingga doc_id yang di-INSERT dan yang di-UPDATE pasti sama.
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
-- ON DELETE CASCADE: menghapus dokumen menghapus tabnya; versi/share milik tab
-- ikut lewat cascade yang sudah ada di tabel mereka.
ALTER TABLE "document_tabs" ADD CONSTRAINT "document_tabs_document_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "document_tabs_document_idx" ON "document_tabs" USING btree ("document_id","position");--> statement-breakpoint

-- 5. project_id naik ke induk; tab tidak lagi memilikinya (constraint FK lama
--    ikut terhapus bersama kolom).
ALTER TABLE "document_tabs" DROP COLUMN "project_id";--> statement-breakpoint

-- 6. Rename kolom fisik document_id -> tab_id di tiga tabel. Nilainya tidak
--    berubah - hanya namanya yang berhenti berbohong (ketiganya menunjuk tab).
ALTER TABLE "document_versions" RENAME COLUMN "document_id" TO "tab_id";--> statement-breakpoint
ALTER TABLE "shares" RENAME COLUMN "document_id" TO "tab_id";--> statement-breakpoint
ALTER TABLE "pool_request" RENAME COLUMN "document_id" TO "tab_id";--> statement-breakpoint

-- 7. Rename constraint FK supaya konsisten dengan nama kolom/tabel baru.
ALTER TABLE "document_versions" RENAME CONSTRAINT "document_versions_document_id_documents_id_fk" TO "document_versions_tab_id_document_tabs_id_fk";--> statement-breakpoint
ALTER TABLE "shares" RENAME CONSTRAINT "shares_document_id_documents_id_fk" TO "shares_tab_id_document_tabs_id_fk";--> statement-breakpoint
ALTER TABLE "pool_request" RENAME CONSTRAINT "pool_request_document_id_documents_id_fk" TO "pool_request_tab_id_document_tabs_id_fk";
