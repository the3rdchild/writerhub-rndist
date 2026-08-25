-- Trigger baru untuk snapshot document_versions yang dibuat otomatis saat
-- job AI (grammar/analysis) selesai - lihat metadata_version di migrasi
-- berikutnya. Migrasi TERPISAH sengaja: Postgres tidak mengizinkan enum value
-- baru dipakai di transaksi yang sama dengan yang menambahkannya (pola sama
-- dengan 0010_pool_request_cancelled_status.sql).
ALTER TYPE "version_trigger" ADD VALUE IF NOT EXISTS 'ai_result';
