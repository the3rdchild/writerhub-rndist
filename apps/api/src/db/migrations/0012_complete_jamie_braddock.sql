-- DITULIS TANGAN - jangan regenerasi migrasi ini dengan db:generate: `owner_id`
-- lama menyimpan id eksternal (varchar) yang TIDAK dijamin berformat UUID
-- (mis. 'local-dev' di mode dev) - `ALTER COLUMN ... SET DATA TYPE uuid`
-- naif (hasil generate default) akan gagal di data yang sudah ada.
--
-- CATATAN: origin baris lama di-backfill sebagai 'ppe' (asumsi traffic
-- historis didominasi client pp-extended). PERLU DIVALIDASI ke data produksi
-- nyata sebelum migrasi ini dijalankan - kalau ada owner_id lama yang
-- sebenarnya dari client ransel-ai, baris identity-nya perlu dikoreksi
-- manual (origin diganti 'ransel') sebelum/segera setelah migrasi ini.

-- 1. Backfill identity dari owner_id yang sudah ada di kedua tabel.
INSERT INTO "identity" ("user_id", "origin")
SELECT DISTINCT "owner_id", 'ppe' FROM "projects"
ON CONFLICT ("user_id", "origin") DO NOTHING;--> statement-breakpoint

INSERT INTO "identity" ("user_id", "origin")
SELECT DISTINCT "owner_id", 'ppe' FROM "user_memories"
ON CONFLICT ("user_id", "origin") DO NOTHING;--> statement-breakpoint

-- 2. projects.owner_id: kolom baru uuid, backfill via identity, ganti kolom lama.
--    Index lama (projects_owner_idx) ikut terhapus otomatis bersama kolom.
ALTER TABLE "projects" ADD COLUMN "owner_identity_id" uuid;--> statement-breakpoint
UPDATE "projects" p SET "owner_identity_id" = i."id"
FROM "identity" i WHERE i."user_id" = p."owner_id" AND i."origin" = 'ppe';--> statement-breakpoint
ALTER TABLE "projects" ALTER COLUMN "owner_identity_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" DROP COLUMN "owner_id";--> statement-breakpoint
ALTER TABLE "projects" RENAME COLUMN "owner_identity_id" TO "owner_id";--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_owner_id_identity_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."identity"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "projects_owner_idx" ON "projects" USING btree ("owner_id","updated_at" DESC NULLS LAST);--> statement-breakpoint

-- 3. user_memories.owner_id adalah PRIMARY KEY - dance kolom sama, plus
--    pindahkan constraint PK ke kolom baru.
ALTER TABLE "user_memories" ADD COLUMN "owner_identity_id" uuid;--> statement-breakpoint
UPDATE "user_memories" m SET "owner_identity_id" = i."id"
FROM "identity" i WHERE i."user_id" = m."owner_id" AND i."origin" = 'ppe';--> statement-breakpoint
ALTER TABLE "user_memories" ALTER COLUMN "owner_identity_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "user_memories" DROP CONSTRAINT "user_memories_pkey";--> statement-breakpoint
ALTER TABLE "user_memories" DROP COLUMN "owner_id";--> statement-breakpoint
ALTER TABLE "user_memories" RENAME COLUMN "owner_identity_id" TO "owner_id";--> statement-breakpoint
ALTER TABLE "user_memories" ADD CONSTRAINT "user_memories_pkey" PRIMARY KEY ("owner_id");--> statement-breakpoint
ALTER TABLE "user_memories" ADD CONSTRAINT "user_memories_owner_id_identity_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."identity"("id") ON DELETE no action ON UPDATE no action;
