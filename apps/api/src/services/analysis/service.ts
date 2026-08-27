import type { StyleMemory } from '@writer-hub/shared'
import { REWRITE_TONES } from '@writer-hub/shared'
import QueueClient from '@/lib/queue'
import { findMemoryByOwner } from '@/repository/memory'
import JobSubmissionService from '@/services/job-submission.service'
import { analysisBodySchema } from './dto'

export default class AnalysisService extends JobSubmissionService {
	async create(): Promise<Response> {
		try {
			const parsed = analysisBodySchema.safeParse(await this.readBody())
			if (!parsed.success) {
				return this.error({ errors: parsed.error.issues.map((e) => e.message) })
			}
			const body = parsed.data

			const provider = await this.authorizeAndResolveProvider()
			const jobId = crypto.randomUUID()
			const styleMemory = await this.styleMemory()
			const tone = body.tone ? REWRITE_TONES.find((item) => item.id === body.tone) : undefined
			const effectiveMemory =
				tone && body.feature === 'ai_rewriter' ? { ...styleMemory, tone: tone.instruction } : styleMemory

			const requestId = await this.createPoolRequest(
				jobId,
				provider,
				{
					feature: body.feature,
					text_length: body.text.length,
				},
				{ feature: body.feature, tabId: body.tabId ?? body.documentId ?? null },
			)

			await QueueClient.enqueueAnalysisJob(jobId, {
				request_id: requestId,
				feature: body.feature,
				text: body.text,
				language: body.language ?? null,
				style_memory: effectiveMemory,
				target_lang: body.targetLang ?? null,
				...this.providerPayload(provider),
			})

			return this.accepted(jobId, provider)
		} catch (error) {
			return this.failFromError(error)
		}
	}

	private async readBody(): Promise<unknown> {
		const contentType = this.context.req.header('content-type') ?? ''
		return contentType.includes('application/json')
			? this.context.req.json().catch(() => ({}))
			: this.context.req.parseBody({ all: true })
	}
	private async styleMemory(): Promise<StyleMemory | null> {
		const userId = this.context.get('userId')
		if (!userId) return null
		const row = await findMemoryByOwner(await this.identityId())
		return row?.preferences ?? null
	}
}
