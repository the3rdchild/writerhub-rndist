import { randomBytes } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { documents, shares } from '@/db/schemas'
import { AppError } from '@/lib/error'
import BaseService from '@/services/base.service'
import { createShareBodySchema } from './dto'
import type { CreateShareResponse, SharedDocumentResponse } from './dto'

/**
 * Pembuatan dan pembacaan share link dokumen.
 */
export default class ShareService extends BaseService {
	/** Buat dokumen + share link baru. */
	async create(): Promise<Response> {
		try {
			const body = createShareBodySchema.safeParse(await this.context.req.json())
			if (!body.success) {
				return this.error({ errors: body.error.issues.map((issue) => issue.message) })
			}

			const { title, content, access, role } = body.data
			const userId = this.context.get('userId')

			const [document] = await this.db
				.insert(documents)
				.values({ owner_id: userId, title, content })
				.returning({ id: documents.id })

			if (!document) throw AppError.internalServerError('Gagal menyimpan dokumen')

			const token = this.generateToken()
			const [share] = await this.db
				.insert(shares)
				.values({
					document_id: document.id,
					token,
					access,
					role,
					created_by: userId,
				})
				.returning({
					token: shares.token,
					access: shares.access,
					role: shares.role,
					createdAt: shares.created_at,
				})

			if (!share) throw AppError.internalServerError('Gagal membuat share link')

			const result: CreateShareResponse = {
				token: share.token,
				url: `/share/${share.token}`,
				title,
				access: share.access,
				role: share.role,
				createdAt: share.createdAt.getTime(),
			}

			return this.success({ data: result, status: 201 })
		} catch (error) {
			return this.failFromError(error)
		}
	}

	/** Baca dokumen lewat token share. */
	async getByToken(): Promise<Response> {
		try {
			const token = this.context.req.param('token')
			if (!token) throw AppError.badRequest('Token share tidak ada')

			const result = await this.db
				.select({
					title: documents.title,
					content: documents.content,
					access: shares.access,
					role: shares.role,
					createdAt: shares.created_at,
				})
				.from(shares)
				.innerJoin(documents, eq(shares.document_id, documents.id))
				.where(eq(shares.token, token))
				.limit(1)

			const share = result[0]
			if (!share) throw AppError.notFound('Share link tidak ditemukan')

			if (share.access === 'restricted' && !this.context.get('userId')) {
				throw AppError.forbidden('Dokumen ini dibatasi, silakan masuk terlebih dahulu')
			}

			const response: SharedDocumentResponse = {
				title: share.title,
				content: share.content as Record<string, unknown>,
				access: share.access,
				role: share.role,
				createdAt: share.createdAt.getTime(),
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
