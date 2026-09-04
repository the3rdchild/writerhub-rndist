/**
 * Serah-terima draf dari klien eksternal ke WritingHub: satu permintaan
 * "buatkan …" - misalnya dari AI Chat PPE - ditukar dengan tautan dokumen yang
 * bisa langsung dibuka penulisnya.
 *
 * Bentuk ini dilihat `apps/api` (yang menyusunnya) dan `apps/web` (yang
 * menanyakan statusnya sampai draf selesai ditulis), jadi ia tinggal di sini.
 */

import type { ProviderErrorCode } from './provider-failure'

/**
 * `generating` berarti isinya masih ditulis di latar belakang; dokumen dan
 * tautannya sudah ada sejak detik pertama.
 *
 * `queued` dan `rendering` menggambarkan pekerjaan **sesudah** naskahnya jadi:
 * mengubah dokumen menjadi berkas. Keduanya sudah ada di kontrak sebelum
 * perendernya ada, supaya pemanggil menuliskan penanganannya sekali saja - lihat
 * `docs/RENDER-WORKER-PLAN.md` §7.
 */
export type DraftStatus = 'generating' | 'queued' | 'rendering' | 'ready' | 'failed'

/** Bentuk berkas yang bisa diminta dari satu dokumen. */
export const DRAFT_OUTPUTS = ['pdf', 'docx', 'png', 'jpg'] as const
export type DraftOutput = (typeof DRAFT_OUTPUTS)[number]

export interface DraftDownload {
	output: DraftOutput
	/** URL bertanda tangan, berumur lebih pendek dari objek yang ditunjuknya. */
	url: string
	expiresAt: number
	/**
	 * Halaman keberapa yang dipotret; hanya untuk gambar.
	 *
	 * Disebut eksplisit, bukan disimpulkan dari urutan larik: dokumen tiga
	 * halaman menghasilkan tiga entri ber-`output: 'png'`, dan membedakannya
	 * lewat urutan adalah asumsi yang diam-diam rusak.
	 */
	page?: number
}

/**
 * Keluaran yang diminta tapi tidak jadi.
 *
 * Ada karena **sebagian berhasil adalah keadaan normal di sini**, bukan
 * kekecualian: `['pdf','png']` atas dokumen enam halaman menghasilkan PDF yang
 * jadi dan PNG yang ditolak karena batas halaman. Statusnya karena itu tetap
 * `ready` - dokumennya utuh dan bisa dibuka - dan pemanggil membaca `downloads`
 * bersama daftar ini untuk tahu mana yang ada.
 */
export interface DraftRenderError {
	output: DraftOutput
	reason: string
}

/** Tahap yang sedang berjalan selama status masih `generating`. */
export type DraftPhase = 'preparing' | 'writing' | 'saving'

/**
 * Sebab kegagalan dalam bentuk yang bisa diperiksa program - pemanggil tidak
 * perlu mencocokkan kalimat galat untuk memutuskan apakah layak dicoba lagi.
 *
 * Sebab yang berasal dari provider AI dipakai bersama chat (`ProviderErrorCode`
 * di `provider-failure.ts`); dua di bawah ini hanya ada di jalur draf, karena
 * hanya di sana naskahnya masih harus disimpan sesudah provider selesai.
 */
export type DraftErrorCode =
	| ProviderErrorCode
	/** Provider membalas tanpa naskah sama sekali. */
	| 'empty_response'
	/** Naskahnya jadi, tapi gagal disimpan sebagai isi dokumen. */
	| 'save_failed'

export interface DraftProgress {
	phase: DraftPhase
	/**
	 * 0-100. **Estimasi**, bukan ukuran pasti: jumlah karakter yang sudah
	 * diterima dibagi target panjang yang diminta ke model. Model tidak tahu
	 * panjang keluarannya sendiri, jadi angka ini tidak pernah menyentuh 100
	 * selama naskahnya masih ditulis.
	 */
	percent: number
	/** Karakter naskah yang sudah diterima dari provider. */
	characters: number
	/** Target panjang yang dipakai sebagai pembagi. */
	targetCharacters: number
}

export interface DraftHandoff {
	documentId: string
	tabId: string
	title: string
	status: DraftStatus
	/** Tautan WritingHub yang dibuka pengguna. */
	url: string
	/** Tautan untuk menanyakan status sampai ia tidak lagi `generating`. */
	statusUrl: string
	/** Hanya terisi selama status `generating`. */
	progress?: DraftProgress
	/** Hanya terisi saat status `failed`. */
	error?: string
	errorCode?: DraftErrorCode
	/**
	 * Terisi setelah render selesai. Berkasnya adalah **potret dokumen pada saat
	 * dirender**: kalau penggunanya menyunting sesudah itu, berkasnya isi lama.
	 */
	downloads?: DraftDownload[]
	/** Keluaran yang diminta tapi tidak jadi; lihat `DraftRenderError`. */
	renderErrors?: DraftRenderError[]
	/** Posisi dalam antrean, hanya selama `queued`. */
	queuePosition?: number
}
