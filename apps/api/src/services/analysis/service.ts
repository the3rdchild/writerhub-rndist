import type { StyleMemory } from '@writer-hub/shared'
import QueueClient from '@/lib/queue'
import { findMemoryByOwner } from '@/repository/memory'
import JobSubmissionService from '@/services/job-submission.service'
import { analysisBodySchema } from './dto'

/**
 * `POST /api/v1/analyze` - antrekan job AI detector / rewriter / humanizer /
 * plagiarism. Menerima JSON maupun form-data agar kompatibel dengan klien lama.
 */
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

			// AI Memory dibaca di server dan ikut di PAYLOAD JOB (bukan di params
			// pool_request - params untuk audit). Worker hanya memakainya di
			// analyzer yang menulis ulang naskah (rewriter & humanizer).
			const styleMemory = await this.styleMemory()

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
				style_memory: styleMemory,
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

	/**
	 * AI Memory milik user untuk payload job; null bila belum pernah diisi.
	 * Diambil dari userId context - klien tidak mengirimnya.
	 */
	private async styleMemory(): Promise<StyleMemory | null> {
		const userId = this.context.get('userId')
		if (!userId) return null
		const row = await findMemoryByOwner(userId)
		return row?.preferences ?? null
	}
}
