/**
 * Percakapan dengan AI di panel samping.
 *
 * Bentuknya sengaja berbeda dari modul analisis. Analisis adalah job batch:
 * satu teks masuk, satu hasil utuh keluar lewat antrean. Percakapan harus
 * membalas sambil mengetik, jadi ia memakai jalur SSE tersendiri di apps/api
 * yang mem-proxy provider LLM langsung - tanpa antrean, tanpa worker.
 */

export type ChatRole = 'user' | 'assistant' | 'tool'

export interface ChatMessage {
	role: ChatRole
	content: string
	/** Giliran asisten yang meminta alat dijalankan. */
	toolCalls?: Array<{ id: string; name: string; arguments: string }>
	/** Untuk pesan `tool`: panggilan mana yang dijawabnya. */
	toolCallId?: string
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
	/** Minta provider mengaktifkan tool calling; klien mematikannya saat jatuh ke cadangan. */
	tools?: boolean
}

/**
 * Event SSE percakapan.
 *
 * `delta` datang berkali-kali berisi potongan teks; `done` menutup giliran.
 * Berbeda dari job analisis yang hanya mengenal satu event terminal.
 */
export type ChatStreamEvent =
	| { type: 'delta'; text: string }
	/** Model meminta sebuah alat dijalankan; argumennya sudah utuh. */
	| { type: 'tool_call'; id: string; name: string; arguments: string }
	/** Provider menolak parameter `tools`; klien beralih ke protokol blok teks. */
	| { type: 'tools_unsupported' }
	| { type: 'done' }
	| { type: 'error'; message: string }

/** Batas panjang konteks supaya satu giliran tidak menghabiskan jendela model. */
export const CHAT_CONTEXT_LIMITS = {
	selection: 8_000,
	surrounding: 4_000,
	document: 60_000,
} as const
