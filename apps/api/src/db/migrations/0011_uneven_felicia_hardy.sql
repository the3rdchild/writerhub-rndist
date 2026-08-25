-- Tabel identity: normalisasi identitas user lintas origin (ransel/ppe).
-- Lihat repository/identity.ts untuk cara resolve-nya (upsert by user_id+origin).
--
-- CATATAN: `bun run db:generate` semula juga menyertakan
-- `ALTER TYPE pool_request_status ADD VALUE 'cancelled'` dan rename FK
-- `document_tabs_document_id_fk`. Keduanya DIBUANG dari migrasi ini secara
-- sengaja - itu drift lama karena migrasi 0010 (hand-written) tidak pernah
-- punya meta/0010_snapshot.json, jadi drizzle-kit mengira perubahan itu
-- belum diterapkan padahal sudah (re-run ADD VALUE tanpa IF NOT EXISTS akan
-- gagal di DB yang sudah menjalankan 0010). Perlu migrasi terpisah yang
-- membackfill meta/0010_snapshot.json sebelum drift ini aman digenerate lagi.
CREATE TYPE "public"."identity_origin" AS ENUM('ransel', 'ppe');--> statement-breakpoint
CREATE TABLE "identity" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"origin" "identity_origin" NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "identity_user_origin_idx" ON "identity" USING btree ("user_id","origin");
