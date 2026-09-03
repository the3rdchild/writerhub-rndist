import type { TabLayout, TabLayoutOverride } from '@writer-hub/shared'

/**
 * Isi dokumen untuk dirender jadi berkas.
 *
 * Bentuknya sengaja sebangun dengan `SharedDocumentResponse`: keduanya
 * menyerahkan naskah kepada pembaca yang tidak punya Y.Doc, dan karena itu
 * keduanya harus membawa tata letaknya sendiri. Halaman ekspor memakai ulang
 * komponen tampilan yang sama persis.
 */
export interface ExportTab {
	id: string
	title: string
	content: Record<string, unknown>
	layout: TabLayoutOverride | null
}

export interface ExportDocumentResponse {
	documentId: string
	title: string
	layout: TabLayout | null
	tabs: ExportTab[]
}

export interface ExportLinkResponse {
	/** URL halaman ekspor, lengkap dengan tanda tangannya. */
	url: string
	/** Epoch detik; sesudahnya URL-nya ditolak. */
	expiresAt: number
}
