-- B-8 (§P7 lapis B): tambah nilai 'cancelled' pada enum pool_request_status.
-- Job yang dibatalkan tetap dicatat (token sudah terpakai di sisi penyedia, §2.8),
-- jadi 'cancelled' adalah status terminal tersendiri, bukan dihapus.
ALTER TYPE "pool_request_status" ADD VALUE IF NOT EXISTS 'cancelled';
