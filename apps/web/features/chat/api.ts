import type {
	ChatContext,
	ChatMessage,
	ChatStreamEvent,
	ChatStreamPhase,
	ChatUsage,
	DocumentMetadata,
	ResearchBrief,
	ToolCall,
} from '@writer-hub/shared'
import { FALLBACK_TOOL_FENCE } from '@writer-hub/shared'
import { ChatTurnError } from './failure'
import { stripLeakedCalls } from './leaked-calls'

export interface StreamChatHandlers {
	onDelta: (text: string) => void
	/** `broken`: argumennya bukan JSON utuh - biasanya terpotong batas panjang keluaran. */
	onToolCall?: (call: ToolCall, broken: boolean) => void
	onToolsUnsupported?: () => void
	onStatus?: (phase: ChatStreamPhase, detail?: string) => void
	onReasoning?: (text: string) => void
	onUsage?: (usage: ChatUsage) => void
	/** Alasan provider berhenti (`stop`, `length`, `tool_calls`...), kalau ia menyebutnya. */
	onDone?: (finish: string | undefined) => void
}

export async function streamChat(
	{
		messages,
		context,
		tools = true,
		research = false,
		model,
		templateSlug,
		metadata,
		brief,
	}: {
		messages: ChatMessage[]
		context?: ChatContext
		tools?: boolean
		research?: boolean
		model?: string
		templateSlug?: string
		metadata?: DocumentMetadata
		/** Brief penelitian dokumen aktif; lihat `researchBriefPrompt` di server. */
		brief?: ResearchBrief
	},
	handlers: StreamChatHandlers | ((text: string) => void),
	signal?: AbortSignal,
): Promise<void> {
	const on: StreamChatHandlers = typeof handlers === 'function' ? { onDelta: handlers } : handlers

	const response = await fetch('/api/chat', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({
			messages,
			context,
			tools,
			research,
			...(model ? { model } : {}),
			...(templateSlug ? { templateSlug } : {}),
			...(metadata && Object.keys(metadata).length > 0 ? { metadata } : {}),
			...(brief ? { brief } : {}),
		}),
		signal,
	})

	if (!response.ok || !response.body) {
		const body = await response.json().catch(() => null)
		const detail = body?.errors?.join(', ') || body?.message
		// 502/503/504 datang dari proxy atau gateway, bukan dari model - sekali
		// coba lagi sering cukup.
		const retryable = response.status >= 502 && response.status <= 504
		/*
		 * 400/413/422 ditolak server kita sendiri sebelum sampai ke provider -
		 * permintaannya yang tidak lolos validasi. Saran "periksa kunci API"
		 * menyesatkan di sini (uji 27 Sep, UC3: satu pesan >64 ribu karakter).
		 */
		// 429 dengan Retry-After datang dari batas laju WritingHub sendiri, dan
		// pesannya sudah menyebut berapa lama menunggu. Tanpa header itu, 429
		// berasal dari kuota admin-ppe.
		if (response.status === 429) {
			const limited = response.headers.has('retry-after')
			throw new ChatTurnError(
				detail || 'Terlalu banyak permintaan. Coba lagi sebentar lagi.',
				limited ? 'unknown' : 'quota_exceeded',
				false,
			)
		}
		if (response.status === 400 || response.status === 413 || response.status === 422) {
			throw new ChatTurnError(
				`Permintaan ditolak sebelum sampai ke model${detail ? `: ${detail}` : ''}.`,
				'unknown',
				false,
			)
		}
		throw new ChatTurnError(
			detail || `Percakapan gagal (${response.status})`,
			retryable ? 'provider_unreachable' : 'provider_rejected',
			retryable,
		)
	}

	const reader = response.body.getReader()
	const decoder = new TextDecoder()
	let buffer = ''

	while (true) {
		const { done, value } = await reader.read()
		if (done) break

		buffer += decoder.decode(value, { stream: true })
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
			else if (event.type === 'tool_call') {
				const parsed = parseToolCall(event)
				on.onToolCall?.(parsed.call, parsed.broken)
			} else if (event.type === 'tools_unsupported') on.onToolsUnsupported?.()
			else if (event.type === 'status') on.onStatus?.(event.phase, event.detail)
			else if (event.type === 'reasoning') on.onReasoning?.(event.text)
			else if (event.type === 'usage') {
				on.onUsage?.({ promptTokens: event.promptTokens, completionTokens: event.completionTokens })
			} else if (event.type === 'error') {
				throw new ChatTurnError(event.message, event.code ?? 'unknown', event.retryable ?? false)
			} else if (event.type === 'done') {
				on.onDone?.(event.finish)
				return
			}
		}
	}
}

export function parseToolCall(event: { id: string; name: string; arguments: string }): {
	call: ToolCall
	broken: boolean
} {
	let parsed: Record<string, unknown> = {}
	let broken = false
	try {
		const value = JSON.parse(event.arguments || '{}')
		if (value && typeof value === 'object') parsed = value as Record<string, unknown>
	} catch {
		broken = true
	}
	return { call: { id: event.id, name: event.name, arguments: parsed }, broken }
}

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
					arguments: parsed.arguments && typeof parsed.arguments === 'object' ? parsed.arguments : {},
				})
			}
		} catch {}
		match = FALLBACK_TOOL_FENCE.exec(content)
	}

	return calls
}

/** Teks balasan tanpa panggilan cadangan, termasuk panggilan DSML yang bocor (`leaked-calls.ts`). */
export function stripFallbackCalls(content: string): string {
	return stripLeakedCalls(content)
		.replace(FALLBACK_TOOL_FENCE, '')
		.replace(/\n{3,}/g, '\n\n')
		.trim()
}
