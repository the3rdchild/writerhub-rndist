-- DITULIS TANGAN (bagian backfill) - lihat metadata-version.ts. Tabel dibuat
-- kosong oleh generate, lalu diisi dari grammar_result/analysis_result lama
-- sebelum keduanya di-drop di migrasi berikutnya (0016).

CREATE TABLE "metadata_version" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" varchar(255) NOT NULL,
	"request_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"feature" varchar(50) NOT NULL,
	"result" jsonb NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "metadata_version_job_id_unique" UNIQUE("job_id")
);
--> statement-breakpoint
ALTER TABLE "metadata_version" ADD CONSTRAINT "metadata_version_request_id_pool_request_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."pool_request"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metadata_version" ADD CONSTRAINT "metadata_version_version_id_document_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."document_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

-- Backfill grammar_result -> metadata_version. Tiap baris butuh satu
-- document_versions baru (trigger 'ai_result') karena metadata_version.version_id
-- wajib ada - konten snapshotnya adalah konten TAB SAAT INI (histori konten
-- persis saat job itu selesai tidak pernah direkam sebelumnya), dan
-- word_count diisi 0 (perkiraan, bukan dihitung ulang - baris migrasi lama).
--
-- Baris yang tab_id-nya sudah NULL/basi (pool_request.tab_id IS NULL, atau
-- tabnya sudah dihapus) TIDAK BISA dimigrasi dan akan HILANG permanen - cek
-- dulu di produksi seberapa banyak sebelum migrasi ini dijalankan:
--   SELECT count(*) FROM grammar_result gr JOIN pool_request pr ON pr.id = gr.request_id WHERE pr.tab_id IS NULL;
WITH src AS (
	SELECT
		gr.job_id, gr.request_id, pr.tab_id, dt.content,
		gen_random_uuid() AS version_id,
		jsonb_build_object(
			'original_text', gr.original_text,
			'corrected_text', gr.corrected_text,
			'suggestions', coalesce(gr.suggestions, '[]'::jsonb),
			'scores', gr.scores,
			'writing_quality', gr.writing_quality,
			'quality_label', gr.quality_label
		) AS result
	FROM "grammar_result" gr
	JOIN "pool_request" pr ON pr.id = gr.request_id
	JOIN "document_tabs" dt ON dt.id = pr.tab_id
	WHERE pr.tab_id IS NOT NULL
), ins_version AS (
	INSERT INTO "document_versions" ("id", "tab_id", "content", "trigger", "word_count", "created_by")
	SELECT version_id, tab_id, content, 'ai_result', 0, NULL FROM src
)
INSERT INTO "metadata_version" ("job_id", "request_id", "version_id", "feature", "result")
SELECT job_id, request_id, version_id, 'grammar', result FROM src;--> statement-breakpoint

-- Backfill analysis_result -> metadata_version, pola sama.
WITH src AS (
	SELECT
		ar.job_id, ar.request_id, pr.tab_id, dt.content, ar.feature, ar.result,
		gen_random_uuid() AS version_id
	FROM "analysis_result" ar
	JOIN "pool_request" pr ON pr.id = ar.request_id
	JOIN "document_tabs" dt ON dt.id = pr.tab_id
	WHERE pr.tab_id IS NOT NULL
), ins_version AS (
	INSERT INTO "document_versions" ("id", "tab_id", "content", "trigger", "word_count", "created_by")
	SELECT version_id, tab_id, content, 'ai_result', 0, NULL FROM src
)
INSERT INTO "metadata_version" ("job_id", "request_id", "version_id", "feature", "result")
SELECT job_id, request_id, version_id, feature, result FROM src;
