import { AppError } from '@/lib/error'
import type { NewDocument } from '@/db/schemas'
import {
	deleteDocument,
	findDocumentById,
	findDocumentsByOwner,
	insertDocument,
	updateDocument,
} from '@/repository/document'
import { findTabsByDocument, insertTab } from '@/repository/document-tab'
import { findProjectById } from '@/repository/project'
import BaseService from '@/services/base.service'
import { snapshotIntervalTab } from '@/services/tabs/service'
import { createDocumentBodySchema, updateDocumentBodySchema } from './dto'
import type { DocumentDetail, DocumentSummary, TabSummary } from './dto'

/** Konten bawaan tab pertama: dokumen Tiptap kosong. */
const EMPTY_CONTENT: Record<string, unknown> = { type: 'doc', content: [] }

/**
 * CRUD dokumen INDUK milik user (judul + proyek; naskahnya tinggal di tab —
 * lihat docs/DOCUMENT-TABS-RESTRUCTURE-PLAN.md). Semua operasi diskop ke
 * `userId` dari context (diisi `authMiddleware`; dev lokal memakai fallback
 * 'local-dev').
 */
export default class DocumentsService extends BaseService {
	/** List metadata dokumen milik user, terbaru di atas. Query `projectId`
	 * menyaring per proyek; nilai `'none'` berarti yang belum berproyek. */
	async list(): Promise<Response> {
		try {
			const rows = await findDocumentsByOwner(this.ownerId(), this.context.req.query('projectId'))
			const result: DocumentSummary[] = rows.map((row) => ({
				id: row.id,
				title: row.title,
				projectId: row.projectId,
				tabCount: Number(row.tabCount),
				updatedAt: row.updatedAt.getTime(),
				createdAt: row.createdAt.getTime(),
			}))
			return this.success({ data: result })
		} catch (error) {
			return this.failFromError(error)
		}
	}

	/** Detail satu dokumen induk beserta daftar tabnya (urut `position`). */
	async getById(): Promise<Response> {
		try {
			const document = await findDocumentById(this.documentId(), this.ownerId())
			if (!document) throw AppError.notFound('Dokumen tidak ditemukan')

			const tabs = await findTabsByDocument(document.id)
			return this.success({ data: this.toDetail(document, tabs) })
		} catch (error) {
			return this.failFromError(error)
		}
	}

	/**
	 * Buat dokumen baru beserta satu tab awal (misalnya saat "Simpan ke cloud"
	 * pertama kali). `content`/`emoji`/`language` di body menjadi milik tab
	 * pertama; timeline versi tab langsung punya snapshot awal.
	 */
	async create(): Promise<Response> {
		try {
			const body = createDocumentBodySchema.safeParse(await this.context.req.json())
			if (!body.success) {
				return this.error({ errors: body.error.issues.map((issue) => issue.message) })
			}

			const { content, emoji, language, projectId, title } = body.data
			if (projectId) await this.ownedProject(projectId)

			const document = await insertDocument({
				owner_id: this.ownerId(),
				title,
				project_id: projectId ?? null,
			})
			if (!document) throw AppError.internalServerError('Gagal menyimpan dokumen')

			const tab = await insertTab({
				document_id: document.id,
				owner_id: this.ownerId(),
				title,
				content: content ?? EMPTY_CONTENT,
				emoji: emoji ?? null,
				language: language ?? null,
				position: 0,
			})
			if (!tab) throw AppError.internalServerError('Gagal menyimpan tab pertama')

			// Versi interval pertama: timeline tidak pernah kosong.
			await snapshotIntervalTab(tab.id, tab.content, this.ownerId())

			return this.success({ data: this.toDetail(document, [tab]), status: 201 })
		} catch (error) {
			return this.failFromError(error)
		}
	}

	/** Ubah dokumen induk: judul dan/atau keanggotaan proyek. Autosave naskah
	 * tidak lagi lewat sini — pakai `PUT /tabs/:tabId`. */
	async update(): Promise<Response> {
		try {
			const body = updateDocumentBodySchema.safeParse(await this.context.req.json())
			if (!body.success) {
				return this.error({ errors: body.error.issues.map((issue) => issue.message) })
			}

			const { projectId, ...rest } = body.data
			const values: Partial<NewDocument> = { ...rest }
			if (projectId !== undefined) {
				// `null` = keluarkan dari proyek; selain itu proyek tujuan harus
				// benar-benar milik user ini.
				if (projectId !== null) await this.ownedProject(projectId)
				values.project_id = projectId
			}

			// Field tak dikenal sudah di-strip zod; patch kosong berarti tidak
			// ada yang bisa diupdate (drizzle melempar "No values to set").
			if (Object.keys(values).length === 0) {
				return this.error({ errors: ['Tidak ada field yang bisa diubah (title/projectId)'] })
			}

			const document = await updateDocument(this.documentId(), this.ownerId(), values)
			if (!document) throw AppError.notFound('Dokumen tidak ditemukan')

			const tabs = await findTabsByDocument(document.id)
			return this.success({ data: this.toDetail(document, tabs) })
		} catch (error) {
			return this.failFromError(error)
		}
	}

	/**
	 * Hard delete dokumen induk: seluruh tab ikut terhapus lewat ON DELETE
	 * CASCADE, dan versi/share/pool_request mengikuti aturan FK masing-masing
	 * (share link tetap hidup lewat snapshot-nya).
	 */
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

	/** Proyek tujuan harus milik user; 400 bila bukan. */
	private async ownedProject(projectId: string): Promise<void> {
		const project = await findProjectById(projectId, this.ownerId())
		if (!project) throw AppError.badRequest('Proyek tidak ditemukan')
	}

	private documentId(): string {
		const id = this.context.req.param('id')
		if (!id) throw AppError.badRequest('ID dokumen tidak ada')
		return id
	}

	private toDetail(
		document: {
			id: string
			title: string
			project_id: string | null
			updated_at: Date
			created_at: Date
		},
		tabs: {
			id: string
			document_id: string
			title: string
			emoji: string | null
			language: string | null
			position: number
			updated_at: Date
			created_at: Date
		}[],
	): DocumentDetail {
		const tabSummaries: TabSummary[] = tabs.map((tab) => ({
			id: tab.id,
			documentId: tab.document_id,
			title: tab.title,
			emoji: tab.emoji,
			language: tab.language,
			position: tab.position,
			updatedAt: tab.updated_at.getTime(),
			createdAt: tab.created_at.getTime(),
		}))
		return {
			id: document.id,
			title: document.title,
			projectId: document.project_id,
			tabCount: tabSummaries.length,
			tabs: tabSummaries,
			updatedAt: document.updated_at.getTime(),
			createdAt: document.created_at.getTime(),
		}
	}
}
