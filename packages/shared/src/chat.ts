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
	| { type: 'error'; message: string }
export const CHAT_CONTEXT_LIMITS = {
	selection: 8_000,
	surrounding: 4_000,
	document: 60_000,
	messages: 40,
} as const
