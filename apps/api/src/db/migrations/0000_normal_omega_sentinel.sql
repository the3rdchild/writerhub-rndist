CREATE TYPE "public"."pool_request_status" AS ENUM('pending', 'processing', 'completed', 'failed');--> statement-breakpoint
CREATE TABLE "pool_request" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" varchar(255) NOT NULL,
	"status" "pool_request_status" DEFAULT 'pending' NOT NULL,
	"error" text,
	"params" jsonb,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pool_request_job_id_unique" UNIQUE("job_id")
);
--> statement-breakpoint
CREATE TABLE "grammar_result" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" varchar(255) NOT NULL,
	"request_id" uuid NOT NULL,
	"original_text" text NOT NULL,
	"corrected_text" text,
	"suggestions" jsonb,
	"scores" jsonb,
	"writing_quality" integer,
	"quality_label" varchar(50),
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "grammar_result_job_id_unique" UNIQUE("job_id")
);
--> statement-breakpoint
CREATE TABLE "analysis_result" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" varchar(255) NOT NULL,
	"request_id" uuid NOT NULL,
	"feature" varchar(50) NOT NULL,
	"result" jsonb NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "analysis_result_job_id_unique" UNIQUE("job_id")
);
--> statement-breakpoint
ALTER TABLE "grammar_result" ADD CONSTRAINT "grammar_result_request_id_pool_request_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."pool_request"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analysis_result" ADD CONSTRAINT "analysis_result_request_id_pool_request_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."pool_request"("id") ON DELETE cascade ON UPDATE no action;