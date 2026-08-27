import type { AnalysisJobStatus, GrammarJobStatus } from '@writer-hub/shared'
import { AppError } from '@/lib/error'
import { findMetadataVersion, findPoolRequest } from '@/repository/job-result'
import BaseService from '@/services/base.service'
import { poolingParamSchema } from './dto'

const COMPLETED_CACHE_TTL_SECONDS = 60

type JobStatusResponse = GrammarJobStatus | AnalysisJobStatus

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

		const row = await findMetadataVersion(jobId)
		if (!row) {
			// Job-nya sendiri ada dan sudah selesai, hasilnya yang tidak tersimpan:
			// metadata_version wajib menempel ke satu document_versions, jadi worker
			// melewatinya kalau job tidak tertaut tab (atau tabnya keburu dihapus) -
			// lihat save_metadata_version di services/worker/core/db/repository.py.
			// Balas status apa adanya; 404 di sini berbohong soal jobId tidak dikenal.
			return { ...base, error: 'Hasil job tidak tersimpan karena job tidak tertaut ke tab dokumen' }
		}
		if (params?.feature) {
			return {
				...base,
				feature: row.feature as AnalysisJobStatus['feature'],
				result: row.result as unknown as AnalysisJobStatus['result'],
			}
		}

		const result = row.result as unknown as {
			original_text: string
			corrected_text: string | null
			suggestions: GrammarJobStatus['suggestions']
			scores: GrammarJobStatus['scores']
			writing_quality: number | null
			quality_label: string | null
		}
		return {
			...base,
			original_text: result.original_text,
			corrected_text: result.corrected_text,
			suggestions: result.suggestions ?? [],
			scores: result.scores,
			writing_quality: result.writing_quality,
			quality_label: result.quality_label,
		}
	}
}
