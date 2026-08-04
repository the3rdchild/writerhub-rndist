import type { AnalysisJobStatus, GrammarJobStatus } from '@writer-hub/shared'
import { AppError } from '@/lib/error'
import { findAnalysisResult, findGrammarResult, findPoolRequest } from '@/repository/job-result'
import BaseService from '@/services/base.service'
import { poolingParamSchema } from './dto'

const COMPLETED_CACHE_TTL_SECONDS = 60

type JobStatusResponse = GrammarJobStatus | AnalysisJobStatus

/** Endpoint polling `/status/:jobId` - alternatif SSE untuk klien tanpa EventSource. */
export default class PoolingService extends BaseService {
	async getById(): Promise<Response> {
		try {
			const parsed = poolingParamSchema.safeParse({ jobId: this.context.req.param('jobId') })
			if (!parsed.success) {
				return this.error({ errors: parsed.error.issues.map((e) => e.message) })
			}
			const { jobId } = parsed.data

			const cacheKey = `pooling:${jobId}`
			const cached = await this.cacheGet<JobStatusResponse>(cacheKey)
			if (cached) return this.success({ data: cached })

			const result = await this.getStatus(jobId)
			// Hasil selesai bersifat immutable, jadi aman di-cache; status berjalan tidak.
			if (result.status === 'completed') {
				await this.cacheSet(cacheKey, result, COMPLETED_CACHE_TTL_SECONDS)
			}

			return this.success({ data: result })
		} catch (error) {
			return this.failFromError(error)
		}
	}

	private async getStatus(jobId: string): Promise<JobStatusResponse> {
		const request = await findPoolRequest(jobId)
		if (!request) throw AppError.notFound(`jobId ${jobId} not found`)

		const params = request.params as { title?: string; feature?: string } | null
		const base = { jobId: request.job_id, status: request.status, title: params?.title ?? null }

		if (request.status !== 'completed') {
			return { ...base, ...(request.error ? { error: request.error } : {}) }
		}

		// Job analisis menyimpan `feature` di params dan hasilnya di tabel terpisah.
		if (params?.feature) {
			const analysis = await findAnalysisResult(jobId)
			if (!analysis) throw AppError.notFound('Analysis result not found')
			return { ...base, feature: analysis.feature, result: analysis.result }
		}

		const grammar = await findGrammarResult(jobId)
		if (!grammar) throw AppError.notFound('Grammar result not found')
		return {
			...base,
			original_text: grammar.original_text,
			corrected_text: grammar.corrected_text,
			suggestions: grammar.suggestions ?? [],
			scores: grammar.scores,
			writing_quality: grammar.writing_quality,
			quality_label: grammar.quality_label,
		}
	}
}
