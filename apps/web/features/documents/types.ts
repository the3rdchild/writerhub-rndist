import type { JSONContent } from '@tiptap/core'

/**
 * Kontrak dokumen/tab di server (restrukturisasi Project ▸ Dokumen ▸ Tab).
 *
 * Dokumen adalah induk: judul dan keanggotaan proyek tinggal di sini.
 * `DocumentSummary` dipakai daftar /library (dengan jumlah tab sebagai info),
 * `DocumentDetail` membawa daftar tabnya sekalian - konten tiap tab diambil
 * terpisah lewat `getTab`, supaya membuka daftar tidak mengunduh seluruh
 * naskah.
 */
export interface DocumentSummary {
	id: string
	title: string
	/** ID proyek tempat dokumen bernaung; null berarti "Tanpa proyek". */
	projectId: string | null
	tabCount: number
	/** Epoch milidetik (server mengirim `Date.getTime()`). */
	updatedAt: number
	createdAt: number
}

export interface DocumentDetail extends DocumentSummary {
	/** Tab milik dokumen, urut `position`. */
	tabs: TabSummary[]
}

/** Ringkasan satu tab (tanpa konten), untuk daftar tab sebuah dokumen. */
export interface TabSummary {
	id: string
	documentId: string
	title: string
	emoji: string | null
	language: string | null
	position: number
	/** Epoch milidetik (server mengirim `Date.getTime()`). */
	updatedAt: number
	createdAt: number
}

/** Detail satu tab beserta naskahnya. */
export interface TabDetail extends TabSummary {
	content: JSONContent
}

/** `content`/`emoji`/`language` adalah milik tab pertama yang ikut dibuat. */
export interface CreateDocumentInput {
	title: string
	content?: JSONContent
	emoji?: string | null
	language?: string | null
	/** Proyek tujuan; tidak dikirim berarti "Tanpa proyek". */
	projectId?: string | null
}

/**
 * Dokumen induk hanya menerima judul dan keanggotaan proyek - konten, emoji,
 * dan bahasa adalah milik tab dan diperbarui lewat `updateTab`.
 */
export interface UpdateDocumentInput {
	title?: string
	/** ID proyek tujuan; `null` mengeluarkan dokumen dari proyeknya. */
	projectId?: string | null
}

export interface CreateTabInput {
	title?: string
	content?: JSONContent
	emoji?: string | null
	language?: string | null
}

/** Autosave tab: semua field opsional, hanya yang dikirim yang ditimpa. */
export interface UpdateTabInput {
	title?: string
	content?: JSONContent
	emoji?: string | null
	language?: string | null
}
