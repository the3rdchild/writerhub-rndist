import type {
	AnalysisResultData,
	GrammarResultPayload,
	JobStatus,
	ResearchResultPayload,
} from '@writer-hub/shared'
import { AppError } from '@/lib/error'
import {
	deleteAllHistoryForUser,
	deleteHistoryEntry,
	findHistoryByUser,
	findHistoryEntry,
} from '@/repository/history'
import BaseService from '@/services/base.service'
import { HISTORY_FEATURES, historyListQuerySchema } from './dto'
import type { HistoryDetail, HistoryFeature, HistoryListResponse, HistorySummary } from './dto'

interface SummarySource {
	status: JobStatus
	feature: string | null
	grammarScore: number | null
	suggestionCount: number | null
	analysisChangeCount: number | null
	analysisLabel: string | null
	analysisScore: string | null
	researchSourceCount: number | null
}

function summarize(source: SummarySource): string | null {
	if (source.status !== 'completed') return null

	switch (source.feature) {
		case 'grammar': {
			const parts: string[] = []
			if (source.grammarScore !== null) parts.push(`Skor ${source.grammarScore}`)
			const count = source.suggestionCount ?? 0
			parts.push(count === 1 ? '1 saran' : `${count} saran`)
			return parts.join(' · ')
		}
		case 'research': {
			const count = source.researchSourceCount ?? 0
			return count === 1 ? '1 sumber' : `${count} sumber`
		}
		case 'ai_rewriter':
		case 'humanizer': {
			const count = source.analysisChangeCount ?? 0
			if (count === 0) return 'Tanpa perubahan'
			return count === 1 ? '1 perubahan' : `${count} perubahan`
		}
		case 'ai_detector':
		case 'plagiarism': {
			const label = source.analysisLabel
			const score = source.analysisScore !== null ? Math.round(Number(source.analysisScore)) : null
			if (label && score !== null) {
				return source.feature === 'plagiarism' ? `${label} · ${score}% unik` : `${label} · ${score}%`
			}
			return label
		}
		default:
			return null
	}
}

function knownFeature(feature: string | null): HistoryFeature | null {
	return HISTORY_FEATURES.includes(feature as HistoryFeature) ? (feature as HistoryFeature) : null
}

type DetailRow = NonNullable<Awaited<ReturnType<typeof findHistoryEntry>>>

type AnalysisResultShape = AnalysisResultData | null | undefined

function changeCountOf(result: AnalysisResultShape): number | null {
	if (result && 'changes' in result && Array.isArray(result.changes)) return result.changes.length
	return null
}

function labelOf(result: AnalysisResultShape): string | null {
	return result && 'label' in result ? result.label : null
}

function scoreOf(result: AnalysisResultShape): string | null {
	const value =
		result && 'overall_score' in result
			? result.overall_score
			: result && 'uniqueness_score' in result
				? result.uniqueness_score
				: null
	return typeof value === 'number' ? String(value) : null
}

type ResultRow = DetailRow['result']

function researchSourceCountOf(result: ResultRow): number | null {
	if (!result || result.feature !== 'research') return null
	const sources = (result.result as Record<string, unknown>).sources
	return Array.isArray(sources) ? sources.length : 0
}

function analysisResultOf(result: ResultRow): AnalysisResultShape {
	if (!result || result.feature === 'grammar' || result.feature === 'research') return null
	return result.result as unknown as AnalysisResultData
}

function grammarScoreOf(result: ResultRow): number | null {
	if (!result || result.feature !== 'grammar') return null
	const value = (result.result as Record<string, unknown>).writing_quality
	return typeof value === 'number' ? value : null
}

function grammarSuggestionCountOf(result: ResultRow): number | null {
	if (!result || result.feature !== 'grammar') return null
	const suggestions = (result.result as Record<string, unknown>).suggestions
	return Array.isArray(suggestions) ? suggestions.length : null
}

function resultOf(row: DetailRow): HistoryDetail['result'] {
	if (!row.result) return null
	if (row.result.feature === 'grammar') {
		return row.result.result as unknown as GrammarResultPayload
	}
	if (row.result.feature === 'research') {
		return row.result.result as unknown as ResearchResultPayload
	}
	return row.result.result as unknown as AnalysisResultData
}

export default class HistoryService extends BaseService {
	async list(): Promise<Response> {
		try {
			const query = historyListQuerySchema.safeParse(this.context.req.query())
			if (!query.success) {
				return this.error({ errors: query.error.issues.map((issue) => issue.message) })
			}
			const { feature, tabId, limit, cursor } = query.data
			const rows = await findHistoryByUser(this.ownerId(), {
				feature,
				tabId,
				limit: limit + 1,
				cursor: cursor ? new Date(cursor) : undefined,
			})

			const page = rows.slice(0, limit)
			const entries: HistorySummary[] = page.map((row) => ({
				jobId: row.jobId,
				feature: knownFeature(row.feature),
				status: row.status,
				tabId: row.tabId,
				documentTitle: row.documentTitle,
				createdAt: row.createdAt.getTime(),
				summary: summarize(row),
			}))

			const data: HistoryListResponse = {
				entries,
				nextCursor: rows.length > limit ? (entries.at(-1)?.createdAt ?? null) : null,
			}
			return this.success({ data })
		} catch (error) {
			return this.failFromError(error)
		}
	}
	async getById(): Promise<Response> {
		try {
			const row = await findHistoryEntry(this.ownerId(), this.jobId())
			if (!row) throw AppError.notFound('Aktivitas tidak ditemukan')

			const detail: HistoryDetail = {
				jobId: row.request.job_id,
				feature: knownFeature(row.request.feature),
				status: row.request.status,
				tabId: row.request.tab_id,
				documentTitle: row.documentTitle,
				createdAt: row.request.created_at.getTime(),
				summary: summarize({
					status: row.request.status,
					feature: row.request.feature,
					grammarScore: grammarScoreOf(row.result),
					suggestionCount: grammarSuggestionCountOf(row.result),
					analysisChangeCount: changeCountOf(analysisResultOf(row.result)),
					analysisLabel: labelOf(analysisResultOf(row.result)),
					analysisScore: scoreOf(analysisResultOf(row.result)),
					researchSourceCount: researchSourceCountOf(row.result),
				}),
				error: row.request.error,
				result: resultOf(row),
			}
			return this.success({ data: detail })
		} catch (error) {
			return this.failFromError(error)
		}
	}
	async remove(): Promise<Response> {
		try {
			const deleted = await deleteHistoryEntry(this.ownerId(), this.jobId())
			if (!deleted) throw AppError.notFound('Aktivitas tidak ditemukan')
			return this.success({ data: { deleted: true } })
		} catch (error) {
			return this.failFromError(error)
		}
	}
	async clear(): Promise<Response> {
		try {
			const deleted = await deleteAllHistoryForUser(this.ownerId())
			return this.success({ data: { deleted } })
		} catch (error) {
			return this.failFromError(error)
		}
	}

	private ownerId(): string {
		const userId = this.context.get('userId')
		if (!userId) throw AppError.unauthorized('User tidak dikenal')
		return userId
	}

	private jobId(): string {
		const jobId = this.context.req.param('jobId')
		if (!jobId) throw AppError.badRequest('ID job tidak ada')
		return jobId
	}
}
