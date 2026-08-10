import { randomBytes } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { shares, shareSnapshots } from '@/db/schemas'
import { AppError } from '@/lib/error'
import { insertDocument } from '@/repository/document'
import { findTabById, insertTab } from '@/repository/document-tab'
import BaseService from '@/services/base.service'
import { createShareBodySchema } from './dto'
import type { CreateShareResponse, SharedDocumentResponse } from './dto'

/**
 * Pembuatan dan pembacaan share link tab. Konten yang dibagikan dibekukan
 * di `share_snapshots` sehingga perubahan/penghapusan tab user tidak
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

			const { title, content, access, role } = body.data
			// `documentId` alias usang untuk `tabId` (id dokumen lama = id tab).
			const requestedTabId = body.data.tabId ?? body.data.documentId
			const userId = this.context.get('userId')
			if (!userId) throw AppError.unauthorized('User tidak dikenal')

			let tabIdToLink: string
			let snapshotTitle: string
			let snapshotContent: Record<string, unknown>

			if (requestedTabId) {
				// Tab sudah tersimpan: pastikan milik user, lalu pakai konten
				// terkini dari editor bila dikirim.
				const tab = await findTabById(requestedTabId, userId)
				if (!tab) throw AppError.notFound('Tab tidak ditemukan')

				tabIdToLink = tab.id
				snapshotTitle = title ?? tab.title
				snapshotContent = content ?? tab.content
			} else {
				// Tab masih lokal: buat dulu dokumen induk + satu tab milik user
				// supaya bisa di-autosave nanti.
				if (!title || !content) throw AppError.badRequest('title dan content wajib diisi')
				const document = await insertDocument({ owner_id: userId, title })
				if (!document) throw AppError.internalServerError('Gagal menyimpan dokumen')
				const tab = await insertTab({
					document_id: document.id,
					owner_id: userId,
					title,
					content,
					position: 0,
				})
				if (!tab) throw AppError.internalServerError('Gagal menyimpan tab')

				tabIdToLink = tab.id
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
					tab_id: tabIdToLink,
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
				tabId: tabIdToLink,
				documentId: tabIdToLink,
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
