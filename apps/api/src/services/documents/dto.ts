import { z } from 'zod'
import type { TabSummary } from '@/services/tabs/dto'

export type { TabSummary }

/**
 * Body `POST /documents`: membuat dokumen induk + satu tab awal.
 * `content`/`emoji`/`language` adalah milik TAB PERTAMA; `content` adalah
 * JSONContent dari editor Tiptap dan disimpan apa adanya di jsonb.
 */
export const createDocumentBodySchema = z.object({
	title: z.string().min(1).max(500),
	content: z.record(z.string(), z.unknown()).optional(),
	emoji: z.string().max(32).nullish(),
	language: z.string().max(32).nullish(),
	/**
	 * Proyek tujuan; harus milik user. Setiap dokumen wajib punya proyek, tapi
	 * field ini boleh dikosongkan - server memakai proyek default milik user
	 * (dibuat sekali, dipakai ulang) supaya jalur cloud-sync otomatis
	 * (`features/sync/sync-context.tsx`, tidak pernah memilih proyek) tetap
	 * jalan tanpa perlu UI pemilihan proyek di titik itu.
	 */
	projectId: z.uuid().optional(),
})

export type CreateDocumentBody = z.infer<typeof createDocumentBodySchema>

/** Update dokumen induk: judul dan/atau keanggotaan proyek. */
export const updateDocumentBodySchema = z.object({
	title: z.string().min(1).max(500).optional(),
	// Pindah dokumen ke proyek lain; field tidak dikirim berarti jangan ubah.
	// Dokumen tidak bisa dilepas dari proyek (tidak ada "Tanpa proyek" lagi).
	projectId: z.uuid().optional(),
})

export type UpdateDocumentBody = z.infer<typeof updateDocumentBodySchema>

/** Satu baris daftar dokumen (Library): metadata induk + jumlah tab. */
export interface DocumentSummary {
	id: string
	title: string
	projectId: string
	tabCount: number
	updatedAt: number
	createdAt: number
}

/** Detail dokumen induk beserta daftar tabnya, urut `position`. */
export interface DocumentDetail extends DocumentSummary {
	tabs: TabSummary[]
}
