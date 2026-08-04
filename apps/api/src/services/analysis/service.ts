import QueueClient from '@/lib/queue'
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

			const requestId = await this.createPoolRequest(jobId, provider, {
				feature: body.feature,
				text_length: body.text.length,
			})

			await QueueClient.enqueueAnalysisJob(jobId, {
				request_id: requestId,
				feature: body.feature,
				text: body.text,
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
}
