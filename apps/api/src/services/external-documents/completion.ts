import type { RewriterTone } from '@writer-hub/shared'
import { AppError } from '@/lib/error'
import { SYSTEM_PROMPT, tonePrompt } from '@/services/chat/prompts'

/**
 * Satu panggilan chat-completion NON-streaming untuk membuat draf dokumen
 * dari instruksi bebas. Hanya transport: bentuk prompt dan makna galatnya
 * milik pemanggil.
 */

/** Selaras dengan TEMPERATURE di services/chat/service.ts. */
const TEMPERATURE = 0.4
const TIMEOUT_MS = 90_000

export interface CompletionConfig {
	baseUrl: string
	apiKey: string
	model: string
}

const GENERATION_GUIDANCE = [
	'Write the full document the user asks for as Markdown.',
	'Reply with the document content only - no preamble, no closing remarks,',
	'no fenced code block around the whole document.',
].join(' ')

interface CompletionResponse {
	choices?: { message?: { content?: string | null } }[]
}

export async function generateMarkdownDocument(
	{ baseUrl, apiKey, model }: CompletionConfig,
	instruction: string,
	tone: RewriterTone | undefined,
): Promise<string> {
	let response: Response
	try {
		response = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
			method: 'POST',
			headers: {
				authorization: `Bearer ${apiKey}`,
				'content-type': 'application/json',
			},
			body: JSON.stringify({
				model,
				stream: false,
				temperature: TEMPERATURE,
				messages: [
					{ role: 'system', content: [SYSTEM_PROMPT, tonePrompt(tone), GENERATION_GUIDANCE].filter(Boolean).join('\n\n') },
					{ role: 'user', content: instruction },
				],
			}),
			signal: AbortSignal.timeout(TIMEOUT_MS),
		})
	} catch {
		throw new AppError(502, 'Provider AI tidak dapat dihubungi. Coba lagi nanti.')
	}

	if (!response.ok) {
		throw new AppError(502, `Provider AI menolak permintaan (status ${response.status}).`)
	}

	const payload = (await response.json().catch(() => null)) as CompletionResponse | null
	const content = payload?.choices?.[0]?.message?.content?.trim()
	if (!content) throw new AppError(502, 'Provider AI membalas tanpa isi dokumen.')

	return content
}
