import type { JobSubmission } from '@writer-hub/shared'
import { env, isLocalAuth } from '@/config/env'
import { poolRequest } from '@/db/schemas'
import { AppError } from '@/lib/error'
import { recordTokenUsageAfterCompletion } from '@/lib/job-usage-wait'
import { ensureToolQuota, resolveProvider, type ResolvedProvider } from '@/lib/provider-resolver'
import { findDocumentById } from '@/repository/document'
import { pruneOldHistory } from '@/repository/history'
import BaseService from '@/services/base.service'
import LoggerClient from '@/utils/logger'

const log = LoggerClient.getInstance()

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
	 * Mengembalikan null pada mode lokal - bukan kegagalan.
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
		meta?: { documentId?: string | null; feature?: string },
	): Promise<string> {
		// user_id diambil dari context (diisi authMiddleware di kedua mode auth),
		// BUKAN dari provider - provider bernilai null pada AUTH_MODE=none, dan
		// memakainya berarti aktivitas tidak tercatat sama sekali di dev lokal.
		const userId = this.context.get('userId') ?? null

		// Tautan dokumen hanya dicatat bila dokumennya memang milik user ini.
		// documentId dikirim klien dan bisa basi (dokumen sudah dihapus) atau
		// menunjuk dokumen orang lain - keduanya cukup diperlakukan sebagai
		// "tanpa tautan", bukan menggagalkan job.
		let documentId: string | null = null
		if (meta?.documentId && userId) {
			const document = await findDocumentById(meta.documentId, userId)
			documentId = document?.id ?? null
		}

		const [request] = await this.db
			.insert(poolRequest)
			.values({
				job_id: jobId,
				status: 'pending',
				model_record_id: provider?.modelRecordId ?? null,
				params,
				user_id: userId,
				document_id: documentId,
				feature: meta?.feature ?? null,
			})
			.returning()

		// Retensi 90 hari, dipangkas saat menulis entri baru (pola
		// pruneIntervalVersions). Kegagalan prune tidak boleh menggagalkan job.
		if (userId) {
			try {
				await pruneOldHistory(userId)
			} catch (error) {
				log.error({ err: error, userId }, 'Gagal memangkas aktivitas AI lama')
			}
		}

		return request.id
	}

	/**
	 * Field provider yang ikut dikirim ke worker lewat payload job.
	 * Kosong pada mode lokal - worker jatuh ke konfigurasi env miliknya.
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
