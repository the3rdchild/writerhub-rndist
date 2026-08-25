-- grammar_result/analysis_result sudah dibackfill ke metadata_version di
-- migrasi 0015 - lihat catatan di sana soal baris yang tidak bisa dimigrasi
-- (tab_id NULL/basi).
DROP TABLE "grammar_result" CASCADE;--> statement-breakpoint
DROP TABLE "analysis_result" CASCADE;
