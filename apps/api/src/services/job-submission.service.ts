import type { JobSubmission } from '@writer-hub/shared'
import { env, isLocalAuth } from '@/config/env'
import { poolRequest } from '@/db/schemas'
import { AppError } from '@/lib/error'
import { recordTokenUsageAfterCompletion } from '@/lib/job-usage-wait'
import { ensureToolQuota, resolveProvider, type ResolvedProvider } from '@/lib/provider-resolver'
import { findTabById } from '@/repository/document-tab'
import { pruneOldHistory } from '@/repository/history'
import BaseService from '@/services/base.service'
import LoggerClient from '@/lib/logger'

const log = LoggerClient.getInstance()
export const USAGE_SERVICE_SLUG = 'grammar'
export const USAGE_TOOL_NAME = 'grammar-check'

export default abstract class JobSubmissionService extends BaseService {
	protected async authorizeAndResolveProvider(): Promise<ResolvedProvider | null> {
		if (isLocalAuth) return null

		const bearerToken = this.context.get('bearerToken')
		if (!bearerToken) {
			throw AppError.unauthorized('Butuh autentikasi pp-extended untuk memproses permintaan ini.')
		}

		const provider = await resolveProvider(bearerToken, USAGE_SERVICE_SLUG)
		if (!provider) {
			throw AppError.badRequest('Model AI belum tersedia untuk plan Anda saat ini. Coba lagi nanti.')
		}

		await ensureToolQuota(provider.userId, USAGE_SERVICE_SLUG, USAGE_TOOL_NAME)
		return provider
	}
	protected async createPoolRequest(
		jobId: string,
		provider: ResolvedProvider | null,
		params: Record<string, unknown>,
		meta?: { tabId?: string | null; feature?: string },
	): Promise<string> {
		const userId = this.context.get('userId') ?? null
		let tabId: string | null = null
		if (meta?.tabId && userId) {
			const tab = await findTabById(meta.tabId, await this.identityId())
			tabId = tab?.id ?? null
		}

		const [request] = await this.db
			.insert(poolRequest)
			.values({
				job_id: jobId,
				status: 'pending',
				model_record_id: provider?.modelRecordId ?? null,
				params,
				user_id: userId,
				tab_id: tabId,
				feature: meta?.feature ?? null,
			})
			.returning()
		if (userId) {
			try {
				await pruneOldHistory(userId)
			} catch (error) {
				log.error({ err: error, userId }, 'Gagal memangkas aktivitas AI lama')
			}
		}

		return request.id
	}
	protected providerPayload(provider: ResolvedProvider | null) {
		if (!provider) return {}

		return {
			modelId: provider.modelId,
			alias: provider.alias,
			isNineRouter: provider.isNineRouter,
			baseUrl: provider.baseUrl,
			apiKey: provider.apiKey,
			sdkProvider: provider.sdkProvider,
		}
	}
	protected accepted(jobId: string, provider: ResolvedProvider | null): Response {
		if (provider) {
			recordTokenUsageAfterCompletion({
				jobId,
				userId: provider.userId,
				serviceSlug: USAGE_SERVICE_SLUG,
			})
		}

		const data: JobSubmission = {
			jobId,
			statusURL: `${env.SERVICE_URL}/api/v1/status/${jobId}`,
		}
		return this.success({ data, status: 202 })
	}
}
