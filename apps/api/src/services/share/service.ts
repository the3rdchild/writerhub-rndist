import { randomBytes } from 'node:crypto'
import { asc, eq } from 'drizzle-orm'
import { documents, shares } from '@/db/schemas'
import { AppError } from '@/lib/error'
import { findDocumentById } from '@/repository/document'
import { findTabsByDocument } from '@/repository/document-tab'
import BaseService from '@/services/base.service'
import type { CreateShareResponse, SharedDocumentResponse } from './dto'
import { createShareBodySchema, updateShareBodySchema } from './dto'

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

			/*
			 * Satu tautan per dokumen, seperti Docs. Dulu setiap pembukaan dialog
			 * Bagikan - dan setiap ganti akses atau peran - membuat token BARU,
			 * sehingga tautan publik lama terus berlaku tanpa bisa dicabut (uji
			 * editor 2 Okt, SHL-10). Kini tautan yang ada dipakai ulang dan
			 * pengaturannya diperbarui.
			 */
			const existing = await this.currentShare(documentId)
			const [share] = existing
				? await this.db.update(shares).set({ access, role }).where(eq(shares.id, existing.id)).returning()
				: await this.db
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

			return this.success({
				data: this.shareResponse(share, document.title),
				status: existing ? 200 : 201,
			})
		} catch (error) {
			return this.failFromError(error)
		}
	}
	/**
	 * Tautan dokumen milik pengguna ini; `share` null bila belum dibagikan.
	 * Dibungkus objek karena `success` membuang `data` yang null.
	 */
	async current(): Promise<Response> {
		try {
			const documentId = this.context.req.query('documentId')
			if (!documentId) throw AppError.badRequest('documentId wajib diisi')
			const document = await findDocumentById(documentId, await this.identityId())
			if (!document) throw AppError.notFound('Dokumen tidak ditemukan')
			const share = await this.currentShare(documentId)
			return this.success({ data: { share: share ? this.shareResponse(share, document.title) : null } })
		} catch (error) {
			return this.failFromError(error)
		}
	}

	/** Ubah akses/peran tautan yang ada - tokennya tetap. */
	async update(): Promise<Response> {
		try {
			const body = updateShareBodySchema.safeParse(await this.context.req.json())
			if (!body.success) {
				return this.error({ errors: body.error.issues.map((issue) => issue.message) })
			}
			const { share, document } = await this.ownedShare()
			const [updated] = await this.db
				.update(shares)
				.set({
					...(body.data.access ? { access: body.data.access } : {}),
					...(body.data.role ? { role: body.data.role } : {}),
				})
				.where(eq(shares.id, share.id))
				.returning()
			if (!updated) throw AppError.internalServerError('Gagal memperbarui share link')
			return this.success({ data: this.shareResponse(updated, document.title) })
		} catch (error) {
			return this.failFromError(error)
		}
	}

	/** Berhenti membagikan: semua tautan dokumen itu tidak berlaku lagi. */
	async revoke(): Promise<Response> {
		try {
			const { share } = await this.ownedShare()
			if (share.document_id) await this.db.delete(shares).where(eq(shares.document_id, share.document_id))
			return this.success({ data: { revoked: true } })
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

	private async currentShare(documentId: string) {
		const [share] = await this.db
			.select()
			.from(shares)
			.where(eq(shares.document_id, documentId))
			.orderBy(asc(shares.created_at))
			.limit(1)
		return share ?? null
	}

	/** Tautan dari parameter `:token`, hanya bila dokumennya milik pengguna ini. */
	private async ownedShare() {
		const token = this.context.req.param('token')
		if (!token) throw AppError.badRequest('Token share tidak ada')
		const [share] = await this.db.select().from(shares).where(eq(shares.token, token)).limit(1)
		if (!share?.document_id) throw AppError.notFound('Share link tidak ditemukan')
		const document = await findDocumentById(share.document_id, await this.identityId())
		if (!document) throw AppError.notFound('Share link tidak ditemukan')
		return { share, document }
	}

	private shareResponse(share: typeof shares.$inferSelect, documentTitle: string): CreateShareResponse {
		return {
			token: share.token,
			url: `/share/${share.token}`,
			documentId: share.document_id ?? '',
			documentTitle,
			access: share.access,
			role: share.role,
			createdAt: share.created_at.getTime(),
		}
	}

	private generateToken(): string {
		return randomBytes(16).toString('base64url')
	}
}
