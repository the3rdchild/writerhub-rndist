CREATE TABLE "templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(64) NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"category" varchar(32) NOT NULL,
	"locale" varchar(8) NOT NULL,
	"spec" jsonb NOT NULL,
	"content" jsonb NOT NULL,
	"builtin" boolean DEFAULT false NOT NULL,
	"owner_id" uuid,
	"position" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "templates_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "template_slug" varchar(64);--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "layout" jsonb;--> statement-breakpoint
ALTER TABLE "document_tabs" ADD COLUMN "layout" jsonb;--> statement-breakpoint
ALTER TABLE "templates" ADD CONSTRAINT "templates_owner_id_identity_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."identity"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "templates_category_idx" ON "templates" USING btree ("category","position");--> statement-breakpoint
CREATE INDEX "templates_owner_idx" ON "templates" USING btree ("owner_id");