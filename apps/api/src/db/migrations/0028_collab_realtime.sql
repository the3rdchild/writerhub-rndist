CREATE TABLE "collab_documents" (
	"tab_id" uuid PRIMARY KEY NOT NULL,
	"epoch" uuid NOT NULL,
	"content_sv" "bytea",
	"seeded_by" varchar(255),
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "collab_documents_tab_epoch_key" UNIQUE("tab_id","epoch")
);
--> statement-breakpoint
CREATE TABLE "collab_updates" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"tab_id" uuid NOT NULL,
	"epoch" uuid NOT NULL,
	"update" "bytea" NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "collab_documents" ADD CONSTRAINT "collab_documents_tab_id_document_tabs_id_fk" FOREIGN KEY ("tab_id") REFERENCES "public"."document_tabs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collab_updates" ADD CONSTRAINT "collab_updates_document_fk" FOREIGN KEY ("tab_id","epoch") REFERENCES "public"."collab_documents"("tab_id","epoch") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "collab_updates_tab_idx" ON "collab_updates" USING btree ("tab_id","id");