-- shares/share_snapshots dirombak dari per-TAB ke per-PROYEK (lihat migrasi
-- 0018). Tidak ada jalur migrasi setia dari data lama: share tab dulu tidak
-- pernah merekam proyek pemiliknya, jadi tidak ada cara mengubah "share satu
-- tab" jadi "share satu proyek" tanpa mengarang keanggotaan. Token share yang
-- sudah tersebar dari fitur lama BERHENTI BERFUNGSI setelah migrasi ini -
-- keputusan sadar, bukan oversight.
DROP TABLE "share_snapshots" CASCADE;--> statement-breakpoint
DROP TABLE "shares" CASCADE;--> statement-breakpoint
DROP TYPE "public"."share_access";--> statement-breakpoint
DROP TYPE "public"."share_role";
