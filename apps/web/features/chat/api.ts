import type { ChatContext, ChatMessage, ChatStreamEvent, ChatStreamPhase, ChatUsage, ToolCall } from '@writer-hub/shared'
import { FALLBACK_TOOL_FENCE } from '@writer-hub/shared'

/**
 * Kirim satu giliran percakapan dan alirkan jawabannya.
 *
 * Tidak memakai `streamJob`: helper itu menunggu satu event terminal lalu
 * menyelesaikan Promise - bentuk yang pas untuk job batch, tapi tidak untuk
 * jawaban yang datang berkeping-keping. Di sini tiap keping diteruskan lewat
 * handler dan Promise-nya baru selesai saat giliran ditutup.
 *
 * EventSource juga tidak dipakai karena hanya bisa GET, sedangkan percakapan
 * membawa riwayat dan konteks dokumen di body.
 */

export interface StreamChatHandlers {
	onDelta: (text: string) => void
	/** Model meminta sebuah alat dijalankan. */
	onToolCall?: (call: ToolCall) => void
	/** Provider menolak tool calling; giliran berikutnya dikirim tanpa itu. */
	onToolsUnsupported?: () => void
	/** Fase baru dalam giliran (§B1); bahan baris langkah di lini masa. */
	onStatus?: (phase: ChatStreamPhase, detail?: string) => void
	/** Ringkasan penalaran, bila provider mengirimkannya. */
	onReasoning?: (text: string) => void
	/** Pemakaian token, dilaporkan di keping terakhir bila provider menyediakannya. */
	onUsage?: (usage: ChatUsage) => void
}

export async function streamChat(
	{
		messages,
		context,
		tools = true,
		model,
	}: { messages: ChatMessage[]; context?: ChatContext; tools?: boolean; model?: string },
	handlers: StreamChatHandlers | ((text: string) => void),
	signal?: AbortSignal,
): Promise<void> {
	// Pemanggil lama (AI Edit) hanya peduli teks; keduanya tetap didukung.
	const on: StreamChatHandlers = typeof handlers === 'function' ? { onDelta: handlers } : handlers

	const response = await fetch('/api/chat', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		// `model` kosong berarti "ikuti bawaan server"; jangan kirim kunci itu
		// sama sekali supaya DTO tidak perlu mengenal string kosong.
		body: JSON.stringify({ messages, context, tools, ...(model ? { model } : {}) }),
		signal,
	})

	if (!response.ok || !response.body) {
		const body = await response.json().catch(() => null)
		const detail = body?.errors?.join(', ') || body?.message
		throw new Error(detail || `Percakapan gagal (${response.status})`)
	}

	const reader = response.body.getReader()
	const decoder = new TextDecoder()
	let buffer = ''

	while (true) {
		const { done, value } = await reader.read()
		if (done) break

		buffer += decoder.decode(value, { stream: true })

		// Satu chunk jaringan tidak selalu berisi baris utuh; sisa potongannya
		// disimpan sampai barisnya lengkap.
		const lines = buffer.split('\n')
		buffer = lines.pop() ?? ''

		for (const line of lines) {
			const trimmed = line.trim()
			if (!trimmed.startsWith('data:')) continue

			let event: ChatStreamEvent
			try {
				event = JSON.parse(trimmed.slice(5).trim()) as ChatStreamEvent
			} catch {
				continue
			}

			if (event.type === 'delta') on.onDelta(event.text)
			else if (event.type === 'tool_call') on.onToolCall?.(parseToolCall(event))
			else if (event.type === 'tools_unsupported') on.onToolsUnsupported?.()
			else if (event.type === 'status') on.onStatus?.(event.phase, event.detail)
			else if (event.type === 'reasoning') on.onReasoning?.(event.text)
			else if (event.type === 'usage') {
				on.onUsage?.({ promptTokens: event.promptTokens, completionTokens: event.completionTokens })
			}
			// `ping` sengaja tidak diteruskan: ia denyut jaringan, bukan kemajuan.
			else if (event.type === 'error') throw new Error(event.message)
			else if (event.type === 'done') return
		}
	}
}

function parseToolCall(event: { id: string; name: string; arguments: string }): ToolCall {
	let parsed: Record<string, unknown> = {}
	try {
		const value = JSON.parse(event.arguments || '{}')
		if (value && typeof value === 'object') parsed = value as Record<string, unknown>
	} catch {
		// Argumen rusak diperlakukan sebagai kosong: eksekutornya yang menolak,
		// dengan pesan yang bisa dibaca pengguna.
	}
	return { id: event.id, name: event.name, arguments: parsed }
}

/**
 * Panggilan alat yang ditulis sebagai blok teks.
 *
 * Jalur cadangan untuk provider yang tidak mendukung tool calling: model
 * diminta menulis blok berpagar `writerhub`, dan di sinilah blok itu dibaca
 * kembali jadi panggilan yang bentuknya sama dengan jalur native.
 */
export function parseFallbackCalls(content: string): ToolCall[] {
	const calls: ToolCall[] = []
	FALLBACK_TOOL_FENCE.lastIndex = 0

	let match = FALLBACK_TOOL_FENCE.exec(content)
	while (match !== null) {
		try {
			const parsed = JSON.parse(match[1].trim())
			if (parsed?.tool) {
				calls.push({
					id: `fallback_${calls.length}_${Date.now().toString(36)}`,
					name: String(parsed.tool),
					arguments:
						parsed.arguments && typeof parsed.arguments === 'object' ? parsed.arguments : {},
				})
			}
		} catch {
			// Blok rusak dilewati - lebih baik kehilangan satu aksi daripada
			// menggugurkan seluruh jawaban.
		}
		match = FALLBACK_TOOL_FENCE.exec(content)
	}

	return calls
}

/** Buang blok panggilan dari teks yang ditampilkan ke pengguna. */
export function stripFallbackCalls(content: string): string {
	return content.replace(FALLBACK_TOOL_FENCE, '').replace(/\n{3,}/g, '\n\n').trim()
}
