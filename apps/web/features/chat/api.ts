import type {
	ChatContext,
	ChatMessage,
	ChatStreamEvent,
	ChatStreamPhase,
	ChatUsage,
	ToolCall,
} from '@writer-hub/shared'
import { FALLBACK_TOOL_FENCE } from '@writer-hub/shared'
export interface StreamChatHandlers {
	onDelta: (text: string) => void
	onToolCall?: (call: ToolCall) => void
	onToolsUnsupported?: () => void
	onStatus?: (phase: ChatStreamPhase, detail?: string) => void
	onReasoning?: (text: string) => void
	onUsage?: (usage: ChatUsage) => void
}

export async function streamChat(
	{
		messages,
		context,
		tools = true,
		research = false,
		model,
	}: {
		messages: ChatMessage[]
		context?: ChatContext
		tools?: boolean
		research?: boolean
		model?: string
	},
	handlers: StreamChatHandlers | ((text: string) => void),
	signal?: AbortSignal,
): Promise<void> {
	const on: StreamChatHandlers = typeof handlers === 'function' ? { onDelta: handlers } : handlers

	const response = await fetch('/api/chat', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ messages, context, tools, research, ...(model ? { model } : {}) }),
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
			} else if (event.type === 'error') throw new Error(event.message)
			else if (event.type === 'done') return
		}
	}
}

function parseToolCall(event: { id: string; name: string; arguments: string }): ToolCall {
	let parsed: Record<string, unknown> = {}
	try {
		const value = JSON.parse(event.arguments || '{}')
		if (value && typeof value === 'object') parsed = value as Record<string, unknown>
	} catch {}
	return { id: event.id, name: event.name, arguments: parsed }
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
export function stripFallbackCalls(content: string): string {
	return content
		.replace(FALLBACK_TOOL_FENCE, '')
		.replace(/\n{3,}/g, '\n\n')
		.trim()
}
