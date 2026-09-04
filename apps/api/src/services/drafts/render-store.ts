import type { DraftOutput } from '@writer-hub/shared'
import redis from '@/config/redis'
import LoggerClient from '@/lib/logger'

/**
 * Catatan render satu dokumen, ditulis apps/api saat job dibuat dan ditulis
 * ulang worker Python selama ia bekerja (`services/render_service.py`).
 *
 * Kenapa Redis, bukan kolom di basis data: umurnya memang sehari - sama dengan
 * lifecycle objek `exports/` di penyimpanan - dan sesudah itu tidak ada yang
 * perlu diingat. Berkasnya sendiri tidak disimpan di sini, hanya kunci
 * objeknya; URL unduh diterbitkan apps/api setiap kali statusnya ditanya,
 * supaya umurnya selalu dihitung dari saat itu ditanya, bukan dari saat
 * dokumennya dirender.
 */

const KEY_PREFIX = 'draft:render:'

/**
 * Seumur lifecycle objek hasil render. Sedikit lebih panjang dari umur objek
 * supaya tautan yang diterbitkan menjelang akhir tidak menunjuk catatan yang
 * sudah hilang lebih dulu.
 */
const TTL_SECONDS = 26 * 60 * 60

const log = LoggerClient.getInstance()

export interface RenderDownloadEntry {
	output: DraftOutput
	/** Kunci objek di penyimpanan, mis. `exports/<uuid>.pdf`. */
	key: string
	/** Halaman keberapa yang dipotret; hanya untuk gambar. */
	page?: number
}

export interface RenderRecord {
	/** `queued`/`rendering` saat berjalan; `done` berisi hasilnya. */
	status: 'queued' | 'rendering' | 'done'
	/**
	 * Detik Unix saat catatan ini ditulis, dipasang {@link writeRenderRecord}
	 * dan padanannya di worker. Tanpanya, catatan `queued` yang workernya mati
	 * sebelum sempat menyentuhnya menggantung sampai TTL Redis habis - 26 jam
	 * menjawab "sedang dikerjakan" untuk pekerjaan yang tidak ada.
	 */
	at?: number
	/** Keluaran yang diminta saat job dibuat - catatan, bukan kebenaran. */
	outputs?: DraftOutput[]
	downloads?: RenderDownloadEntry[]
	errors?: Array<{ output: DraftOutput; reason: string }>
}

function key(documentId: string): string {
	return `${KEY_PREFIX}${documentId}`
}

export async function writeRenderRecord(documentId: string, record: RenderRecord): Promise<void> {
	try {
		const stamped: RenderRecord = { ...record, at: Math.floor(Date.now() / 1000) }
		await redis.setex(key(documentId), TTL_SECONDS, JSON.stringify(stamped))
	} catch (error) {
		/*
		 * Kegagalan mencatat tidak boleh menggagalkan dokumennya: rendernya
		 * tetap jalan, hanya pelacakannya yang gelap - pemanggil akan membaca
		 * catatan yang tidak ada dan diberi tahu bahwa hasilnya tak terlacak.
		 */
		log.error({ err: error, documentId }, 'Gagal mencatat status render draf')
	}
}

export async function readRenderRecord(documentId: string): Promise<RenderRecord | null> {
	try {
		const raw = await redis.get(key(documentId))
		return raw ? (JSON.parse(raw) as RenderRecord) : null
	} catch (error) {
		log.error({ err: error, documentId }, 'Gagal membaca status render draf')
		return null
	}
}
