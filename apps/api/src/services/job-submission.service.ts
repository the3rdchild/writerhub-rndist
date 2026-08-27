import type { JobSubmission, StyleMemory } from '@writer-hub/shared'
import { env, isLocalAuth } from '@/config/env'
import { USAGE_SERVICE_SLUG, USAGE_TOOL_NAME } from '@/constants/usage'
import { poolRequest } from '@/db/schemas'
import { AppError } from '@/lib/error'
import { recordTokenUsageAfterCompletion } from '@/lib/job-usage-wait'
import LoggerClient from '@/lib/logger'
import { ensureToolQuota, type ResolvedProvider, resolveProvider } from '@/lib/provider-resolver'
import { findTabById } from '@/repository/document-tab'
import { pruneOldHistory } from '@/repository/history'
import { findMemoryByOwner } from '@/repository/memory'
import BaseService from '@/services/base.service'

const log = LoggerClient.getInstance()

/** Keterangan tambahan yang menautkan job ke dokumen dan fiturnya. */
export interface JobRequestMeta {
	tabId?: string | null
	feature?: string
}

/** Kredensial provider yang ikut dikirim ke worker lewat payload antrean. */
export interface ProviderPayload {
	modelId?: string | null
	alias?: string | null
	isNineRouter?: boolean
	baseUrl?: string | null
	apiKey?: string | null
	sdkProvider?: 'openai' | 'anthropic'
}

/**
 * Dasar bersama untuk setiap endpoint yang menitipkan pekerjaan ke worker.
 * Menyimpan langkah-langkah yang selalu sama - otorisasi, pencatatan
 * permintaan, dan balasan 202 - supaya tiap service hanya menyisakan bagian
 * yang benar-benar khas fiturnya.
 */
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
		meta?: JobRequestMeta,
	): Promise<string> {
		const userId = this.context.get('userId') ?? null

		const [request] = await this.db
			.insert(poolRequest)
			.values({
				job_id: jobId,
				status: 'pending',
				model_record_id: provider?.modelRecordId ?? null,
				params,
				user_id: userId,
				tab_id: await this.resolveTabId(meta?.tabId, userId),
				feature: meta?.feature ?? null,
			})
			.returning()

		if (userId) await this.pruneHistoryQuietly(userId)

		return request.id
	}

	protected providerPayload(provider: ResolvedProvider | null): ProviderPayload {
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

		const data: JobSubmission = { jobId, statusURL: statusUrl(jobId) }
		return this.success({ data, status: 202 })
	}

	/** Preferensi gaya tulis pengguna, dipakai chat maupun analysis. */
	protected async styleMemory(): Promise<StyleMemory | null> {
		if (!this.context.get('userId')) return null

		return (await findMemoryByOwner(await this.identityId()))?.preferences ?? null
	}

	/**
	 * Tab hanya ditautkan kalau benar-benar milik pengguna ini. Id yang tidak
	 * cocok dibiarkan menjadi null, bukan ditolak: job tetap boleh berjalan,
	 * hasilnya saja yang tidak tersimpan ke tab mana pun.
	 */
	private async resolveTabId(
		tabId: string | null | undefined,
		userId: string | null,
	): Promise<string | null> {
		if (!tabId || !userId) return null

		const tab = await findTabById(tabId, await this.identityId())
		return tab?.id ?? null
	}

	/**
	 * Pemangkasan riwayat adalah kerja rumah tangga. Kegagalannya tidak boleh
	 * menggagalkan penitipan job yang sudah terlanjur tercatat.
	 */
	private async pruneHistoryQuietly(userId: string): Promise<void> {
		try {
			await pruneOldHistory(userId)
		} catch (error) {
			log.error({ err: error, userId }, 'Gagal memangkas aktivitas AI lama')
		}
	}
}

function statusUrl(jobId: string): string {
	return `${env.SERVICE_URL}/api/v1/status/${jobId}`
}
