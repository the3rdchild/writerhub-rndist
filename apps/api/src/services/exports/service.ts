import type { TabLayout, TabLayoutOverride } from '@writer-hub/shared'
import { env } from '@/config/env'
import { getAsset } from '@/lib/asset-storage'
import { AppError } from '@/lib/error'
import { signRender, verifyRender } from '@/lib/signed-url'
import { findAssetById } from '@/repository/asset'
import { findDocumentById, findDocumentUnscoped } from '@/repository/document'
import { findTabsByDocument } from '@/repository/document-tab'
import BaseService from '@/services/base.service'
import type { ExportDocumentResponse, ExportLinkResponse } from './dto'

/**
 * Menyematkan gambar watermark ke dalam muatan sebagai `data:` URI.
 *
 * Perender berkas adalah peramban tak berkepala yang hanya memegang tanda
 * tangan satu dokumen - ia tidak punya sesi dan tidak boleh diberi satu, jadi
 * URL aset bertanda tangan tidak bisa diandalkan dari sana. Aturan yang sama
 * sudah berlaku untuk gambar di dalam naskah (lihat `lib/asset-storage.ts`):
 * berkas hasil ekspor wajib utuh tanpa jaringan.
 *
 * Aset dari proyek lain ditolak diam-diam. Yang bisa meminta ekspor memang
 * pemilik dokumennya, tapi `assetId` datang dari tata letak yang ia tulis
 * sendiri - tanpa pemeriksaan ini, endpoint yang izinnya "satu dokumen" berubah
 * menjadi pembaca aset proyek mana pun yang UUID-nya tertebak.
 */
async function embedWatermark<T extends TabLayout | TabLayoutOverride>(
	layout: T | null,
	projectId: string,
): Promise<T | null> {
	const watermark = layout?.pageSetup?.watermark
	if (!layout || !watermark?.assetId) return layout

	const asset = await findAssetById(watermark.assetId)
	if (!asset || asset.project_id !== projectId) return layout

	const bytes = await getAsset(asset.key)
	const base64 = Buffer.from(bytes).toString('base64')
	return {
		...layout,
		pageSetup: {
			...layout.pageSetup,
			watermark: { ...watermark, imageDataUrl: `data:${asset.mime};base64,${base64}` },
		},
	} as T
}

/**
 * Isi dokumen untuk perender berkas.
 *
 * Ada dua sisi yang sengaja tidak simetris. **Menerbitkan** tautan menuntut
 * sesi: hanya pemilik dokumen yang boleh meminta satu. **Membaca** isinya
 * hanya menuntut tanda tangan, karena pembacanya adalah peramban tak berkepala
 * di worker - ia tidak punya sesi dan tidak boleh diberi satu.
 *
 * Itu keputusan keamanan yang perlu dinyatakan terang-terangan: worker adalah
 * proses yang menjalankan HTML buatan model di dalam Chromium. Kalau ia juga
 * memegang sesi penggunanya, seluruh permukaan terautentikasi aplikasi bisa
 * dijangkau dari dalam proses yang sama. Token bercakupan satu dokumen dan
 * berumur menit adalah izin sekecil yang bisa diberikan tanpa membuat
 * pekerjaannya mustahil.
 */
export default class ExportsService extends BaseService {
	/** Tautan bertanda tangan untuk satu dokumen milik pemanggil. */
	async link(): Promise<Response> {
		try {
			const documentId = this.uuidParam('documentId', 'ID dokumen')
			const document = await findDocumentById(documentId, await this.identityId())
			if (!document) throw AppError.notFound('Dokumen tidak ditemukan')

			const { exp, sig } = signRender(documentId)
			const url = `${env.WEB_URL}/export/${documentId}?exp=${exp}&sig=${encodeURIComponent(sig)}`

			const response: ExportLinkResponse = { url, expiresAt: exp }
			return this.success({ data: response })
		} catch (error) {
			return this.failFromError(error)
		}
	}

	/** Isi dokumen di balik tautan itu. Tanda tangannya yang menjadi izinnya. */
	async read(): Promise<Response> {
		try {
			const documentId = this.uuidParam('documentId', 'ID dokumen')
			verifyRender(documentId, Number(this.context.req.query('exp')), this.context.req.query('sig') ?? '')

			const document = await findDocumentUnscoped(documentId)
			if (!document) throw AppError.notFound('Dokumen tidak ditemukan')

			const tabs = await findTabsByDocument(documentId)
			const response: ExportDocumentResponse = {
				documentId,
				title: document.title,
				layout: await embedWatermark(document.layout ?? null, document.project_id),
				tabs: await Promise.all(
					tabs.map(async (tab) => ({
						id: tab.id,
						title: tab.title,
						content: tab.content,
						layout: await embedWatermark(tab.layout ?? null, document.project_id),
					})),
				),
			}

			return this.success({ data: response })
		} catch (error) {
			return this.failFromError(error)
		}
	}
}
