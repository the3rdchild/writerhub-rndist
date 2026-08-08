import { AppError } from '@/lib/error'
import {
	deleteDocument,
	findDocumentById,
	findDocumentsByOwner,
	insertDocument,
	updateDocument,
} from '@/repository/document'
import BaseService from '@/services/base.service'
import { createDocumentBodySchema, updateDocumentBodySchema } from './dto'
import type { DocumentDetail, DocumentSummary } from './dto'

/**
 * CRUD dokumen milik user. Semua operasi diskop ke `userId` dari context
 * (diisi `authMiddleware`; dev lokal memakai fallback 'local-dev').
 */
export default class DocumentsService extends BaseService {
	/** List metadata dokumen milik user, terbaru di atas. */
	async list(): Promise<Response> {
		try {
			const rows = await findDocumentsByOwner(this.ownerId())
			const result: DocumentSummary[] = rows.map((row) => ({
				id: row.id,
				title: row.title,
				emoji: row.emoji,
				language: row.language,
				updatedAt: row.updatedAt.getTime(),
				createdAt: row.createdAt.getTime(),
			}))
			return this.success({ data: result })
		} catch (error) {
			return this.failFromError(error)
		}
	}

	/** Detail satu dokumen beserta kontennya. */
	async getById(): Promise<Response> {
		try {
			const document = await findDocumentById(this.documentId(), this.ownerId())
			if (!document) throw AppError.notFound('Dokumen tidak ditemukan')
			return this.success({ data: this.toDetail(document) })
		} catch (error) {
			return this.failFromError(error)
		}
	}

	/** Buat dokumen baru (misalnya saat "Simpan ke cloud" pertama kali). */
	async create(): Promise<Response> {
		try {
			const body = createDocumentBodySchema.safeParse(await this.context.req.json())
			if (!body.success) {
				return this.error({ errors: body.error.issues.map((issue) => issue.message) })
			}

			const document = await insertDocument({ ...body.data, owner_id: this.ownerId() })
			if (!document) throw AppError.internalServerError('Gagal menyimpan dokumen')

			return this.success({ data: this.toDetail(document), status: 201 })
		} catch (error) {
			return this.failFromError(error)
		}
	}

	/** Autosave: menimpa field yang dikirim saja. */
	async update(): Promise<Response> {
		try {
			const body = updateDocumentBodySchema.safeParse(await this.context.req.json())
			if (!body.success) {
				return this.error({ errors: body.error.issues.map((issue) => issue.message) })
			}

			const document = await updateDocument(this.documentId(), this.ownerId(), body.data)
			if (!document) throw AppError.notFound('Dokumen tidak ditemukan')

			return this.success({ data: this.toDetail(document) })
		} catch (error) {
			return this.failFromError(error)
		}
	}

	/** Hard delete; share link terkait tetap hidup lewat snapshot-nya. */
	async remove(): Promise<Response> {
		try {
			const document = await deleteDocument(this.documentId(), this.ownerId())
			if (!document) throw AppError.notFound('Dokumen tidak ditemukan')
			return this.success({ data: { id: document.id } })
		} catch (error) {
			return this.failFromError(error)
		}
	}

	private ownerId(): string {
		const userId = this.context.get('userId')
		if (!userId) throw AppError.unauthorized('User tidak dikenal')
		return userId
	}

	private documentId(): string {
		const id = this.context.req.param('id')
		if (!id) throw AppError.badRequest('ID dokumen tidak ada')
		return id
	}

	private toDetail(document: {
		id: string
		title: string
		content: Record<string, unknown>
		emoji: string | null
		language: string | null
		updated_at: Date
		created_at: Date
	}): DocumentDetail {
		return {
			id: document.id,
			title: document.title,
			content: document.content,
			emoji: document.emoji,
			language: document.language,
			updatedAt: document.updated_at.getTime(),
			createdAt: document.created_at.getTime(),
		}
	}
}
