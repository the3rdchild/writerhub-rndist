import { randomBytes } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { shares, shareSnapshots } from '@/db/schemas'
import { AppError } from '@/lib/error'
import { findDocumentById, insertDocument } from '@/repository/document'
import BaseService from '@/services/base.service'
import { createShareBodySchema } from './dto'
import type { CreateShareResponse, SharedDocumentResponse } from './dto'

/**
 * Pembuatan dan pembacaan share link dokumen. Konten yang dibagikan dibekukan
 * di `share_snapshots` sehingga perubahan/penghapusan dokumen user tidak
 * memengaruhi link yang sudah tersebar.
 */
export default class ShareService extends BaseService {
	/** Buat share link baru, dengan snapshot konten beku. */
	async create(): Promise<Response> {
		try {
			const body = createShareBodySchema.safeParse(await this.context.req.json())
			if (!body.success) {
				return this.error({ errors: body.error.issues.map((issue) => issue.message) })
			}

			const { documentId, title, content, access, role } = body.data
			const userId = this.context.get('userId')
			if (!userId) throw AppError.unauthorized('User tidak dikenal')

			let documentIdToLink: string
			let snapshotTitle: string
			let snapshotContent: Record<string, unknown>

			if (documentId) {
				// Dokumen sudah tersimpan: pastikan milik user, lalu pakai konten
				// terkini dari editor bila dikirim.
				const document = await findDocumentById(documentId, userId)
				if (!document) throw AppError.notFound('Dokumen tidak ditemukan')

				documentIdToLink = document.id
				snapshotTitle = title ?? document.title
				snapshotContent = content ?? document.content
			} else {
				// Dokumen masih lokal: buat dulu baris dokumen milik user supaya
				// bisa di-autosave nanti.
				if (!title || !content) throw AppError.badRequest('title dan content wajib diisi')
				const document = await insertDocument({ owner_id: userId, title, content })
				if (!document) throw AppError.internalServerError('Gagal menyimpan dokumen')

				documentIdToLink = document.id
				snapshotTitle = title
				snapshotContent = content
			}

			const [snapshot] = await this.db
				.insert(shareSnapshots)
				.values({ title: snapshotTitle, content: snapshotContent })
				.returning({ id: shareSnapshots.id })
			if (!snapshot) throw AppError.internalServerError('Gagal menyimpan snapshot share')

			const token = this.generateToken()
			const [share] = await this.db
				.insert(shares)
				.values({
					document_id: documentIdToLink,
					snapshot_id: snapshot.id,
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
				title: snapshotTitle,
				access: share.access,
				role: share.role,
				createdAt: share.createdAt.getTime(),
			}

			return this.success({ data: result, status: 201 })
		} catch (error) {
			return this.failFromError(error)
		}
	}

	/** Baca dokumen lewat token share (konten beku dari snapshot). */
	async getByToken(): Promise<Response> {
		try {
			const token = this.context.req.param('token')
			if (!token) throw AppError.badRequest('Token share tidak ada')

			const result = await this.db
				.select({
					title: shareSnapshots.title,
					content: shareSnapshots.content,
					access: shares.access,
					role: shares.role,
					createdAt: shares.created_at,
				})
				.from(shares)
				.innerJoin(shareSnapshots, eq(shares.snapshot_id, shareSnapshots.id))
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
