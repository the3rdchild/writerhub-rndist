import { CHAT_CONTEXT_LIMITS } from '@writer-hub/shared'
import { z } from 'zod'

/** Batas jumlah giliran yang ikut dikirim, supaya percakapan panjang tidak membengkak. */
export const MAX_CHAT_MESSAGES = 40

export const chatBodySchema = z.object({
	messages: z
		.array(
			z.object({
				role: z.enum(['user', 'assistant']),
				content: z.string().trim().min(1, 'Message cannot be empty').max(20_000),
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
})

export type ChatBody = z.infer<typeof chatBodySchema>
