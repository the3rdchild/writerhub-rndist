import { env } from '@/config/env'
import { AppError } from '@/lib/error'
import { signRender, verifyRender } from '@/lib/signed-url'
import { findDocumentById, findDocumentUnscoped } from '@/repository/document'
import { findTabsByDocument } from '@/repository/document-tab'
import BaseService from '@/services/base.service'
import type { ExportDocumentResponse, ExportLinkResponse } from './dto'

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
				layout: document.layout ?? null,
				tabs: tabs.map((tab) => ({
					id: tab.id,
					title: tab.title,
					content: tab.content,
					layout: tab.layout ?? null,
				})),
			}

			return this.success({ data: response })
		} catch (error) {
			return this.failFromError(error)
		}
	}
}
