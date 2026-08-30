import { randomBytes } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { documents, shares } from '@/db/schemas'
import { AppError } from '@/lib/error'
import { findDocumentById } from '@/repository/document'
import { findTabsByDocument } from '@/repository/document-tab'
import { insertShare } from '@/repository/share'
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

			const share = await insertShare({
				document_id: documentId,
				token: this.generateToken(),
				access,
				role,
				created_by: this.context.get('userId') ?? null,
			})
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
			const response: SharedDocumentResponse = {
				documentTitle: row.documentTitle,
				tabs: tabs.map((tab) => ({
					id: tab.id,
					title: tab.title,
					emoji: tab.emoji,
					language: tab.language,
					content: tab.content,
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
