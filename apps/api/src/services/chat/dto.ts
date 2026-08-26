import { CHAT_CONTEXT_LIMITS } from '@writer-hub/shared'
import { z } from 'zod'
export const MAX_CHAT_MESSAGES = CHAT_CONTEXT_LIMITS.messages

export const chatBodySchema = z.object({
	messages: z
		.array(
			z.object({
				role: z.enum(['user', 'assistant', 'tool']),
				content: z.string().max(CHAT_CONTEXT_LIMITS.message),
				toolCalls: z
					.array(z.object({ id: z.string(), name: z.string(), arguments: z.string() }))
					.optional(),
				toolCallId: z.string().optional(),
			}),
		)
		.min(1, 'Conversation needs at least one message')
		.max(MAX_CHAT_MESSAGES, `Conversation is too long (max ${MAX_CHAT_MESSAGES} messages)`),

	context: z
		.object({
			selection: z.string().max(CHAT_CONTEXT_LIMITS.selection).optional(),
			surrounding: z.string().max(CHAT_CONTEXT_LIMITS.surrounding).optional(),
			document: z.string().max(CHAT_CONTEXT_LIMITS.document).optional(),
			title: z.string().max(500).optional(),
		})
		.optional(),
	tools: z.boolean().optional().default(true),
	research: z.boolean().optional().default(false),
	model: z.string().max(200).optional(),
})

export type ChatBody = z.infer<typeof chatBodySchema>
