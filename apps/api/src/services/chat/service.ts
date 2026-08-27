import type { StyleMemory } from '@writer-hub/shared'
import { DEFAULT_CHAT_MODEL, isKnownChatModel, toProviderTools } from '@writer-hub/shared'
import { env } from '@/config/env'
import type { ResolvedProvider } from '@/lib/provider-resolver'
import { findMemoryByOwner } from '@/repository/memory'
import JobSubmissionService from '@/services/job-submission.service'
import { type ChatBody, chatBodySchema } from './dto'
import { buildMessages } from './messages'
import { openChatStream } from './stream'

const TEMPERATURE = 0.4

const SSE_HEADERS = {
	'content-type': 'text/event-stream; charset=utf-8',
	'cache-control': 'no-cache, no-transform',
	connection: 'keep-alive',
	// Mencegah nginx menyangga balasan - tanpa ini stream baru sampai di akhir.
	'x-accel-buffering': 'no',
} as const

/** Kredensial provider yang sudah diputuskan untuk satu permintaan. */
interface ProviderConfig {
	baseUrl: string
	apiKey: string
	model: string
}

export default class ChatService extends JobSubmissionService {
	async stream(): Promise<Response> {
		try {
			const parsed = chatBodySchema.safeParse(await this.context.req.json().catch(() => ({})))
			if (!parsed.success) {
				return this.error({ errors: parsed.error.issues.map((issue) => issue.message) })
			}

			const provider = await this.authorizeAndResolveProvider()
			const config = this.resolveProviderConfig(provider, parsed.data.model)
			if (!config) {
				return this.error({
					errors: ['Provider AI belum dikonfigurasi untuk percakapan.'],
					status: 503,
				})
			}

			const memory = await this.styleMemory()
			const call = (withTools: boolean) => this.callProvider(config, parsed.data, withTools, memory)

			return new Response(openChatStream(call, parsed.data.tools ?? false), { headers: SSE_HEADERS })
		} catch (error) {
			return this.failFromError(error)
		}
	}

	/**
	 * Provider dari admin-ppe didahulukan; nilai env dipakai sebagai cadangan.
	 * Null berarti tidak ada kredensial sama sekali, dan pemanggil membalas 503.
	 */
	private resolveProviderConfig(
		provider: ResolvedProvider | null,
		requestedModel: string | undefined,
	): ProviderConfig | null {
		const baseUrl = provider?.baseUrl || env.AI_BASE_URL
		const apiKey = provider?.apiKey || env.AI_API_KEY
		if (!baseUrl || !apiKey) return null

		return {
			baseUrl,
			apiKey,
			model: pickModel(requestedModel, provider?.modelId || env.AI_MODEL, baseUrl),
		}
	}

	private async styleMemory(): Promise<StyleMemory | null> {
		if (!this.context.get('userId')) return null

		return (await findMemoryByOwner(await this.identityId()))?.preferences ?? null
	}

	private callProvider(
		{ baseUrl, apiKey, model }: ProviderConfig,
		body: ChatBody,
		withTools: boolean,
		memory: StyleMemory | null,
	): Promise<Response> {
		return fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
			method: 'POST',
			headers: {
				authorization: `Bearer ${apiKey}`,
				'content-type': 'application/json',
			},
			body: JSON.stringify({
				model,
				stream: true,
				temperature: TEMPERATURE,
				messages: buildMessages(body, withTools, memory),
				...(withTools ? { tools: toProviderTools({ research: body.research }), tool_choice: 'auto' } : {}),
			}),
			signal: this.context.req.raw.signal,
		})
	}
}

/**
 * Model pilihan pengguna hanya dihormati di OpenRouter. Provider lain punya
 * daftar model sendiri, jadi meneruskan nama dari klien ke sana akan ditolak.
 */
function pickModel(requested: string | undefined, fallback: string, baseUrl: string): string {
	if (!requested || !isKnownChatModel(requested) || requested === DEFAULT_CHAT_MODEL) return fallback

	return baseUrl.includes('openrouter.ai') ? requested : fallback
}
