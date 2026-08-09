ALTER TABLE "pool_request" ADD COLUMN "user_id" varchar(255);--> statement-breakpoint
ALTER TABLE "pool_request" ADD COLUMN "document_id" uuid;--> statement-breakpoint
ALTER TABLE "pool_request" ADD COLUMN "feature" varchar(50);--> statement-breakpoint
ALTER TABLE "pool_request" ADD CONSTRAINT "pool_request_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pool_request_user_created_idx" ON "pool_request" USING btree ("user_id","created_at" DESC NULLS LAST);