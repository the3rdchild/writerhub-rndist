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
 * Fase kemajuan satu giliran (§B1.2). Dikirim server sebagai event `status`;
 * klien yang menampilkannya sebagai baris langkah di lini masa.
 */
export type ChatStreamPhase = 'connecting' | 'thinking' | 'reading' | 'writing' | 'retrying'

/** Pemakaian token satu giliran, bila provider melaporkannya. */
export interface ChatUsage {
	promptTokens?: number
	completionTokens?: number
}

/**
 * Event SSE percakapan.
 *
 * `delta` datang berkali-kali berisi potongan teks; `done` menutup giliran.
 * Berbeda dari job analisis yang hanya mengenal satu event terminal.
 *
 * Event kemajuan (§B1) bersifat tambahan: klien lama mengabaikannya, klien baru
 * mengubahnya jadi lini masa langkah. `tool_start`/`tool_result` tidak pernah
 * dipancarkan server - keduanya disintesis klien saat alat baca dijalankan -
 * tetapi bentuknya didaftarkan di sini supaya lini masa dan protokol berbagi
 * satu kosakata.
 */
export type ChatStreamEvent =
	| { type: 'delta'; text: string }
	/** Model meminta sebuah alat dijalankan; argumennya sudah utuh. */
	| { type: 'tool_call'; id: string; name: string; arguments: string }
	/** Provider menolak parameter `tools`; klien beralih ke protokol blok teks. */
	| { type: 'tools_unsupported' }
	/** Fase baru dalam giliran; menyalakan baris langkah di UI. */
	| { type: 'status'; phase: ChatStreamPhase; detail?: string }
	/** Ringkasan penalaran (`reasoning_content`); dilewati bila provider tak mengirimnya. */
	| { type: 'reasoning'; text: string }
	/** Alat baca mulai dijalankan (disintesis klien). */
	| { type: 'tool_start'; id: string; name: string; arguments: string }
	/** Ringkasan pendek hasil alat, bukan isi penuh (disintesis klien). */
	| { type: 'tool_result'; id: string; summary: string; ok: boolean }
	/** Pemakaian token; ditampilkan halus di kaki giliran. */
	| { type: 'usage'; promptTokens?: number; completionTokens?: number }
	/** Denyut anti-menganggur supaya proksi tidak memutus koneksi. */
	| { type: 'ping' }
	| { type: 'done' }
	| { type: 'error'; message: string }

/** Batas panjang konteks supaya satu giliran tidak menghabiskan jendela model. */
export const CHAT_CONTEXT_LIMITS = {
	selection: 8_000,
	surrounding: 4_000,
	document: 60_000,
	/**
	 * Jumlah pesan maksimum yang ikut dikirim. Divalidasi server (dto chat) dan
	 * dijaga klien (buildOutboundMessages membuang giliran tertua lebih dulu) -
	 * satu angka untuk keduanya supaya tidak ada yang kecele.
	 */
	messages: 40,
} as const
