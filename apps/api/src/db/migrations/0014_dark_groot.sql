-- Tambah nilai 'ai_result' ke enum version_trigger.
--
-- BUKAN "ALTER TYPE ... ADD VALUE": drizzle menjalankan SELURUH migrasi yang
-- tertunda di dalam SATU transaksi, dan Postgres melarang memakai nilai enum
-- hasil ADD VALUE sebelum transaksinya commit. Pada basis data baru, migrasi
-- 0015 berjalan di transaksi yang sama dan langsung memakai 'ai_result' -
-- hasilnya error 55P04 "unsafe use of new value".
--
-- Tipe dibuat ulang sebagai gantinya: nilai milik tipe yang LAHIR di transaksi
-- ini boleh dipakai seketika. Keadaan akhirnya persis sama dengan ADD VALUE,
-- jadi snapshot drizzle-kit tidak berubah.
ALTER TYPE "public"."version_trigger" RENAME TO "version_trigger__old";--> statement-breakpoint
CREATE TYPE "public"."version_trigger" AS ENUM('manual', 'interval', 'pre_translate', 'pre_restore', 'ai_result');--> statement-breakpoint
ALTER TABLE "document_versions" ALTER COLUMN "trigger" TYPE "public"."version_trigger" USING "trigger"::text::"public"."version_trigger";--> statement-breakpoint
DROP TYPE "public"."version_trigger__old";
