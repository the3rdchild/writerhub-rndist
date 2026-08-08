import type { JSONContent } from '@tiptap/core'

/** Pemicu terciptanya sebuah versi (lihat skema `document_versions` di apps/api). */
export type VersionTrigger = 'manual' | 'interval' | 'pre_translate' | 'pre_restore'

/**
 * Satu entri di lini masa versi. `VersionSummary` dipakai daftar riwayat,
 * `VersionDetail` membawa naskahnya sekalian untuk pratinjau.
 */
export interface VersionSummary {
	id: string
	trigger: VersionTrigger
	/** Nama versi dari user (trigger `manual`); null untuk versi otomatis. */
	label: string | null
	wordCount: number
	/** Epoch milidetik (server mengirim `Date.getTime()`). */
	createdAt: number
}

export interface VersionDetail extends VersionSummary {
	content: JSONContent
}

/** Jawaban server atas restore: versi yang dipulihkan + id snapshot pre-restore. */
export interface RestoreVersionResult {
	restored: VersionSummary
	preRestoreVersionId: string
}
