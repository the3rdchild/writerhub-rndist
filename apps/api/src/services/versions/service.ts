import { AppError } from '@/lib/error'
import { findDocumentById, updateDocument } from '@/repository/document'
import {
	findVersionById,
	findVersionsByDocument,
	insertVersion,
} from '@/repository/document-version'
import BaseService from '@/services/base.service'
import { createVersionBodySchema } from './dto'
import type { VersionDetail, VersionSummary } from './dto'

/**
 * Hitung jumlah kata dari JSON ProseMirror: rekursi seluruh node, jumlahkan
 * kata di tiap `node.text` (dipisah spasi). Helper murni — dipakai juga oleh
 * snapshot interval di `DocumentsService`.
 */
export function countWords(content: Record<string, unknown>): number {
	let count = 0
	const walk = (node: Record<string, unknown>): void => {
		if (typeof node.text === 'string' && node.text.trim()) {
			count += node.text.trim().split(/\s+/).length
		}
		if (Array.isArray(node.content)) {
			for (const child of node.content) walk(child as Record<string, unknown>)
		}
	}
	walk(content)
	return count
}

/**
 * Riwayat versi dokumen milik user. Semua operasi memverifikasi dulu bahwa
 * dokumennya milik user (via `findDocumentById`) — 404 bila bukan.
 */
export default class VersionsService extends BaseService {
	/** List metadata versi (tanpa konten), terbaru di atas. */
	async list(): Promise<Response> {
		try {
			await this.ownedDocument()
			const rows = await findVersionsByDocument(this.documentId())
			const result: VersionSummary[] = rows.map((row) => ({
				id: row.id,
				trigger: row.trigger,
				label: row.label,
				wordCount: row.wordCount,
				createdAt: row.createdAt.getTime(),
			}))
			return this.success({ data: result })
		} catch (error) {
			return this.failFromError(error)
		}
	}

	/** Detail satu versi beserta kontennya. */
	async getById(): Promise<Response> {
		try {
			await this.ownedDocument()
			const version = await findVersionById(this.versionId(), this.documentId())
			if (!version) throw AppError.notFound('Versi tidak ditemukan')
			return this.success({ data: this.toDetail(version) })
		} catch (error) {
			return this.failFromError(error)
		}
	}

	/** Snapshot manual: beku dari `documents.content` saat ini, label opsional. */
	async create(): Promise<Response> {
		try {
			const body = createVersionBodySchema.safeParse(await this.context.req.json())
			if (!body.success) {
				return this.error({ errors: body.error.issues.map((issue) => issue.message) })
			}

			const document = await this.ownedDocument()
			const version = await insertVersion({
				document_id: document.id,
				content: document.content,
				trigger: 'manual',
				label: body.data.label ?? null,
				word_count: countWords(document.content),
				created_by: this.ownerId(),
			})
			if (!version) throw AppError.internalServerError('Gagal menyimpan versi')

			return this.success({ data: this.toSummary(version), status: 201 })
		} catch (error) {
			return this.failFromError(error)
		}
	}

	/**
	 * Pulihkan dokumen ke versi lampau: beku dulu keadaan sekarang sebagai
	 * versi `pre_restore`, lalu timpa `documents.content` dengan konten versi.
	 * Idempoten — pengulangan menghasilkan pre_restore baru (tidak destructive).
	 */
	async restore(): Promise<Response> {
		try {
			const document = await this.ownedDocument()
			const version = await findVersionById(this.versionId(), document.id)
			if (!version) throw AppError.notFound('Versi tidak ditemukan')

			const preRestore = await insertVersion({
				document_id: document.id,
				content: document.content,
				trigger: 'pre_restore',
				word_count: countWords(document.content),
				created_by: this.ownerId(),
			})
			if (!preRestore) throw AppError.internalServerError('Gagal menyimpan versi pre-restore')

			const updated = await updateDocument(document.id, this.ownerId(), { content: version.content })
			if (!updated) throw AppError.internalServerError('Gagal memulihkan dokumen')

			return this.success({
				data: { restored: this.toSummary(version), preRestoreVersionId: preRestore.id },
			})
		} catch (error) {
			return this.failFromError(error)
		}
	}

	/** Dokumen milik user; 404 bila bukan. */
	private async ownedDocument() {
		const document = await findDocumentById(this.documentId(), this.ownerId())
		if (!document) throw AppError.notFound('Dokumen tidak ditemukan')
		return document
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

	private versionId(): string {
		const id = this.context.req.param('versionId')
		if (!id) throw AppError.badRequest('ID versi tidak ada')
		return id
	}

	private toSummary(version: {
		id: string
		trigger: VersionSummary['trigger']
		label: string | null
		word_count: number
		created_at: Date
	}): VersionSummary {
		return {
			id: version.id,
			trigger: version.trigger,
			label: version.label,
			wordCount: version.word_count,
			createdAt: version.created_at.getTime(),
		}
	}

	private toDetail(version: {
		id: string
		trigger: VersionSummary['trigger']
		label: string | null
		word_count: number
		created_at: Date
		content: Record<string, unknown>
	}): VersionDetail {
		return { ...this.toSummary(version), content: version.content }
	}
}
