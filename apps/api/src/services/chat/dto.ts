import { CHAT_CONTEXT_LIMITS } from '@writer-hub/shared'
import { z } from 'zod'

/** Batas jumlah giliran yang ikut dikirim, supaya percakapan panjang tidak membengkak. */
export const MAX_CHAT_MESSAGES = CHAT_CONTEXT_LIMITS.messages

export const chatBodySchema = z.object({
	messages: z
		.array(
			z.object({
				role: z.enum(['user', 'assistant', 'tool']),
				// Pesan asisten yang hanya berisi panggilan alat sah tanpa teks.
				content: z.string().max(20_000),
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

	/** Aktifkan tool calling; klien mematikannya saat sudah tahu provider menolak. */
	tools: z.boolean().optional().default(true),
})

export type ChatBody = z.infer<typeof chatBodySchema>
