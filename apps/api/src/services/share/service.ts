import { randomBytes } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { documents, shares } from '@/db/schemas'
import { AppError } from '@/lib/error'
import { findDocumentById } from '@/repository/document'
import { findTabsByDocument } from '@/repository/document-tab'
import BaseService from '@/services/base.service'
import type { CreateShareResponse, SharedDocumentResponse } from './dto'
import { createShareBodySchema } from './dto'

export default class ShareService extends BaseService {
	async create(): Promise<Response> {
		try {
			const body = createShareBodySchema.safeParse(await this.context.req.json())
			if (!body.success) {
				return this.error({ errors: body.error.issues.map((issue) => issue.message) })
			}
			const { documentId, access, role } = body.data

			const identityId = await this.identityId()
			const document = await findDocumentById(documentId, identityId)
			if (!document) throw AppError.notFound('Dokumen tidak ditemukan')

			const [share] = await this.db
				.insert(shares)
				.values({
					document_id: documentId,
					token: this.generateToken(),
					access,
					role,
					created_by: this.context.get('userId') ?? null,
				})
				.returning()
			if (!share) throw AppError.internalServerError('Gagal membuat share link')

			const result: CreateShareResponse = {
				token: share.token,
				url: `/share/${share.token}`,
				documentId,
				documentTitle: document.title,
				access: share.access,
				role: share.role,
				createdAt: share.created_at.getTime(),
			}

			return this.success({ data: result, status: 201 })
		} catch (error) {
			return this.failFromError(error)
		}
	}
	async getByToken(): Promise<Response> {
		try {
			const token = this.context.req.param('token')
			if (!token) throw AppError.badRequest('Token share tidak ada')

			const [row] = await this.db
				.select({
					documentId: shares.document_id,
					documentTitle: documents.title,
					documentLayout: documents.layout,
					access: shares.access,
					role: shares.role,
					createdAt: shares.created_at,
				})
				.from(shares)
				.innerJoin(documents, eq(shares.document_id, documents.id))
				.where(eq(shares.token, token))
				.limit(1)

			if (!row || !row.documentId) throw AppError.notFound('Share link tidak ditemukan')

			if (row.access === 'restricted' && !this.context.get('userId')) {
				throw AppError.forbidden('Dokumen ini dibatasi, silakan masuk terlebih dahulu')
			}

			const tabs = await findTabsByDocument(row.documentId)
			/*
			 * Tata letak ikut dikirim - dasar dokumen plus penimpa tiap tab.
			 * Penerima tautan tidak punya Y.Doc, jadi tanpa ini ia tidak punya
			 * cara tahu ukuran kertas, margin, maupun huruf dokumennya, dan
			 * merendernya dengan bawaan A4 potret margin satu inci. Untuk naskah
			 * biasa itu terlihat sekadar berbeda; untuk rancangan satu halaman -
			 * flyer, poster - ia salah bentuk, karena blok itu ukurannya persis
			 * kotak konten halaman.
			 */
			const response: SharedDocumentResponse = {
				documentTitle: row.documentTitle,
				layout: row.documentLayout ?? null,
				tabs: tabs.map((tab) => ({
					id: tab.id,
					title: tab.title,
					emoji: tab.emoji,
					language: tab.language,
					content: tab.content,
					layout: tab.layout ?? null,
				})),
				access: row.access,
				role: row.role,
				createdAt: row.createdAt.getTime(),
			}

			return this.success({ data: response })
		} catch (error) {
			return this.failFromError(error)
		}
	}

	private generateToken(): string {
		return randomBytes(16).toString('base64url')
	}
}
