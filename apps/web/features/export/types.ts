import type { JSONContent } from '@tiptap/core'
import type { TabLayout, TabLayoutOverride } from '@writer-hub/shared'

export interface ExportTab {
	id: string
	title: string
	content: JSONContent
	layout: TabLayoutOverride | null
}

export interface ExportPayload {
	documentId: string
	title: string
	layout: TabLayout | null
	tabs: ExportTab[]
}

/**
 * Penanda yang ditunggu worker sebelum memotret.
 *
 * Dipasang pada `<body>`, bukan pada elemen di dalam halaman: worker menunggu
 * satu pemilih sederhana sebelum ia punya alasan mengenal struktur halaman ini
 * sama sekali.
 */
export const EXPORT_READY_ATTRIBUTE = 'data-export-ready'

/**
 * Jumlah halaman terakhir, dipasang bersebelahan dengan penanda siap.
 *
 * Sudah pasti benar pada detik penanda terpasang - paginasinya baru tenang
 * ketika itulah - jadi worker memantaunya untuk menolak dokumen yang kelewat
 * besar **sebelum** membayar biaya mencetaknya (`RENDER_MAX_PAGES`).
 */
export const EXPORT_PAGES_ATTRIBUTE = 'data-export-pages'
