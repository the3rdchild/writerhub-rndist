/**
 * Proyek milik user di server: pengelompokan dokumen di File Library.
 */
export interface ProjectSummary {
	id: string
	name: string
	color: string | null
	/** Jumlah dokumen di dalamnya; terisi pada endpoint daftar. */
	documentCount: number
	/** Epoch milidetik (server mengirim `Date.getTime()`). */
	updatedAt: number
	createdAt: number
}

export interface CreateProjectInput {
	name: string
	color?: string | null
}

/** Semua field opsional; yang tidak dikirim dibiarkan oleh server. */
export interface UpdateProjectInput {
	name?: string
	color?: string | null
}
