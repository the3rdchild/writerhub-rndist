import type { ProviderErrorCode } from './provider-failure'

export type ChatRole = 'user' | 'assistant' | 'tool'

export interface ChatMessage {
	role: ChatRole
	content: string
	toolCalls?: Array<{ id: string; name: string; arguments: string }>
	toolCallId?: string
}

export interface ChatContext {
	selection?: string
	surrounding?: string
	document?: string
	title?: string
	/**
	 * Geometri halaman yang sedang berlaku, sudah berupa kalimat siap pakai.
	 *
	 * Ikut di setiap permintaan, bukan menunggu model memanggil
	 * `get_page_setup`: rancangan HTML satu halaman harus tahu kertasnya
	 * potret atau lanskap **sebelum** ia menulis satu baris CSS pun, dan
	 * mengandalkan model ingat bertanya lebih dulu terbukti tidak cukup.
	 */
	page?: string
}

export interface ChatRequest {
	messages: ChatMessage[]
	context?: ChatContext
	tools?: boolean
}

export type ChatStreamPhase = 'connecting' | 'thinking' | 'reading' | 'writing' | 'retrying'

export interface ChatUsage {
	promptTokens?: number
	completionTokens?: number
}

export type ChatStreamEvent =
	| { type: 'delta'; text: string }
	| { type: 'tool_call'; id: string; name: string; arguments: string }
	| { type: 'tools_unsupported' }
	| { type: 'status'; phase: ChatStreamPhase; detail?: string }
	| { type: 'reasoning'; text: string }
	| { type: 'tool_start'; id: string; name: string; arguments: string }
	| { type: 'tool_result'; id: string; summary: string; ok: boolean }
	| { type: 'usage'; promptTokens?: number; completionTokens?: number }
	| { type: 'ping' }
	| { type: 'done' }
	/**
	 * `message` sudah berupa kalimat untuk penulis, bukan pesan pengecualian.
	 * `code` dan `retryable` yang dibaca antarmuka untuk memutuskan apakah
	 * giliran ini layak diulang sendiri sebelum penulis diganggu.
	 */
	| { type: 'error'; message: string; code?: ProviderErrorCode; retryable?: boolean }

export const CHAT_CONTEXT_LIMITS = {
	selection: 8_000,
	surrounding: 4_000,
	document: 60_000,
	messages: 40,
	/** Satu pesan - longgar karena hasil `fetch_url` masuk lewat sini. */
	message: 64_000,
} as const
