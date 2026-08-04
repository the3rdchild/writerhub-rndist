/**
 * Percakapan dengan AI di panel samping.
 *
 * Bentuknya sengaja berbeda dari modul analisis. Analisis adalah job batch:
 * satu teks masuk, satu hasil utuh keluar lewat antrean. Percakapan harus
 * membalas sambil mengetik, jadi ia memakai jalur SSE tersendiri di apps/api
 * yang mem-proxy provider LLM langsung - tanpa antrean, tanpa worker.
 */

export type ChatRole = 'user' | 'assistant'

export interface ChatMessage {
	role: ChatRole
	content: string
}

/** Potongan dokumen yang ikut dikirim sebagai konteks. */
export interface ChatContext {
	/** Teks yang sedang disorot pengguna, kalau ada. */
	selection?: string
	/** Paragraf di sekitar seleksi - secukupnya untuk menjawab, tidak lebih. */
	surrounding?: string
	/** Seluruh naskah; hanya dikirim kalau pengguna memintanya. */
	document?: string
	title?: string
}

export interface ChatRequest {
	messages: ChatMessage[]
	context?: ChatContext
}

/**
 * Event SSE percakapan.
 *
 * `delta` datang berkali-kali berisi potongan teks; `done` menutup giliran.
 * Berbeda dari job analisis yang hanya mengenal satu event terminal.
 */
export type ChatStreamEvent =
	| { type: 'delta'; text: string }
	| { type: 'done' }
	| { type: 'error'; message: string }

/** Batas panjang konteks supaya satu giliran tidak menghabiskan jendela model. */
export const CHAT_CONTEXT_LIMITS = {
	selection: 8_000,
	surrounding: 4_000,
	document: 60_000,
} as const
