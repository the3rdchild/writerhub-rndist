import type { JobSubmission } from '@writer-hub/shared'
import { env, isLocalAuth } from '@/config/env'
import { poolRequest } from '@/db/schemas'
import { AppError } from '@/lib/error'
import { recordTokenUsageAfterCompletion } from '@/lib/job-usage-wait'
import { ensureToolQuota, resolveProvider, type ResolvedProvider } from '@/lib/provider-resolver'
import BaseService from '@/services/base.service'

/**
 * Slug service & nama tool di admin-ppe. Keduanya dipakai grammar maupun
 * analysis karena keduanya dihitung ke kuota "grammar" yang sama.
 */
export const USAGE_SERVICE_SLUG = 'grammar'
export const USAGE_TOOL_NAME = 'grammar-check'

/**
 * Bagian yang sama persis antara submit grammar dan submit analysis:
 * autentikasi user, resolve provider LLM, gerbang kuota, pembuatan baris
 * pool_request, dan penjadwalan pencatatan token setelah job selesai.
 *
 * Saat `AUTH_MODE=none` seluruh urusan admin-ppe dilewati: provider bernilai
 * null dan worker memakai konfigurasi LLM dari env-nya sendiri.
 */
export default abstract class JobSubmissionService extends BaseService {
	/**
	 * Resolve provider LLM beserta gerbang kuotanya.
	 * Mengembalikan null pada mode lokal — bukan kegagalan.
	 */
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

	/** Catat job baru sebagai `pending` dan kembalikan id barisnya. */
	protected async createPoolRequest(
		jobId: string,
		provider: ResolvedProvider | null,
		params: Record<string, unknown>,
	): Promise<string> {
		const [request] = await this.db
			.insert(poolRequest)
			.values({
				job_id: jobId,
				status: 'pending',
				model_record_id: provider?.modelRecordId ?? null,
				params,
			})
			.returning()

		return request.id
	}

	/**
	 * Field provider yang ikut dikirim ke worker lewat payload job.
	 * Kosong pada mode lokal — worker jatuh ke konfigurasi env miliknya.
	 */
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

	/** Respons 202 standar untuk job yang berhasil masuk antrean. */
	protected accepted(jobId: string, provider: ResolvedProvider | null): Response {
		// Tidak ada kuota yang perlu dicatat kalau provider bukan dari admin-ppe.
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
