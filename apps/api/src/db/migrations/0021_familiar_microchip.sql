-- share_snapshots dihapus: share dokumen sekarang dibaca LIVE dari
-- document_tabs (pola Google Docs), bukan salinan beku - lihat share.ts.
-- `shares` tidak berubah strukturnya, cuma kehilangan pasangan snapshot-nya.
DROP TABLE "share_snapshots" CASCADE;
