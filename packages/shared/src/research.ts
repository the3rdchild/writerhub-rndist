/**
 * Bentuk hasil riset web yang dibagi API dan web.
 *
 * Disimpan di `metadata_version.result` dengan `feature = 'research'`, jadi ia
 * ikut muncul di halaman Aktivitas seperti hasil modul AI lain.
 */
export const RESEARCH_FEATURE = 'research'

export type ResearchTopic = 'general' | 'news'

export interface ResearchSource {
	url: string
	title: string
	snippet: string
	score: number
	/** Tanggal terbit menurut penyedia, kalau ada. Format bebas - berasal dari halaman. */
	publishedAt: string | null
	favicon: string | null
	/** Benar kalau isi halaman ikut diambil, bukan cuma cuplikan hasil pencarian. */
	extracted: boolean
	fetchedAt: number
}

export interface ResearchResultPayload {
	query: string
	topic: ResearchTopic
	/** ISO 639-1 yang dipakai saat mencari, atau null kalau pencarian tanpa penyaring bahasa. */
	language: string | null
	sources: ResearchSource[]
	credits: number
}
