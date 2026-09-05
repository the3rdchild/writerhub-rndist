ALTER TABLE "templates" DROP CONSTRAINT "templates_owner_id_identity_id_fk";
--> statement-breakpoint
DROP INDEX "templates_owner_idx";--> statement-breakpoint
ALTER TABLE "templates" DROP COLUMN "builtin";--> statement-breakpoint
ALTER TABLE "templates" DROP COLUMN "owner_id";