-- shares/share_snapshots dirombak dari per-PROYEK ke per-DOKUMEN (pola Google
-- Docs: "Share" satu file, bukan satu folder - lihat share.ts). Sama seperti
-- migrasi 0017: tidak ada jalur migrasi setia dari data lama, token share
-- yang sempat dibuat dengan skema per-proyek BERHENTI BERFUNGSI.
DROP TABLE "share_snapshots" CASCADE;--> statement-breakpoint
DROP TABLE "shares" CASCADE;--> statement-breakpoint
DROP TYPE "public"."share_access";--> statement-breakpoint
DROP TYPE "public"."share_role";
