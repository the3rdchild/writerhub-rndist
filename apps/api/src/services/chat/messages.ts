import type { ChatContext, ChatMessage, StyleMemory } from '@writer-hub/shared'
import type { ChatBody } from './dto'
import { buildSystemPrompt } from './prompts'

/**
 * Menerjemahkan permintaan chat menjadi larik pesan berformat OpenAI.
 */

export function contextMessage(context: ChatContext | undefined): ChatMessage | null {
	if (!context) return null

	const parts: string[] = []
	if (context.title) parts.push(`Document title: ${context.title}`)
	if (context.document) {
		parts.push(`Document content (outline + opening, or full text if requested):\n${context.document}`)
	} else if (context.surrounding) parts.push(`Surrounding text:\n${context.surrounding}`)
	if (context.selection) parts.push(`Selected text the user is asking about:\n${context.selection}`)

	if (parts.length === 0) return null
	return { role: 'user', content: `[Editor context]\n${parts.join('\n\n')}` }
}

export function toProviderMessage(message: ChatBody['messages'][number]): Record<string, unknown> {
	if (message.role === 'tool') {
		return { role: 'tool', tool_call_id: message.toolCallId, content: message.content }
	}

	if (message.role === 'assistant' && message.toolCalls?.length) {
		return {
			role: 'assistant',
			content: message.content || null,
			tool_calls: message.toolCalls.map((call) => ({
				id: call.id,
				type: 'function',
				function: { name: call.name, arguments: call.arguments },
			})),
		}
	}

	return { role: message.role, content: message.content }
}

export function buildMessages(
	body: ChatBody,
	withTools: boolean,
	memory: StyleMemory | null,
	templateRules?: string[],
): unknown[] {
	const { messages, context, research } = body
	const contextPart = contextMessage(context)

	return [
		{ role: 'system', content: buildSystemPrompt({ withTools, research, memory, templateRules }) },
		...(contextPart ? [contextPart] : []),
		...messages.map(toProviderMessage),
	]
}
