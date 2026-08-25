
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
