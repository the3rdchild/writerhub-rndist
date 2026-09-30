import type { Document, NewDocument, Template } from '@/db/schemas'
import { AppError } from '@/lib/error'
import {
	type DocumentCursor,
	deleteDocument,
	findDocumentById,
	findDocumentsByOwner,
	insertDocument,
	updateDocument,
} from '@/repository/document'
import { findTabsByDocument, insertTab } from '@/repository/document-tab'
import { findOrCreateDefaultProject, findProjectById } from '@/repository/project'
import { findTemplateBySlug } from '@/repository/template'
import BaseService from '@/services/base.service'
import { snapshotIntervalTab } from '@/services/tabs/service'
import { templateDocumentLayout, templateTabLayout } from '@/services/templates/layout'
import { applyTemplateMetadata } from '@/services/templates/metadata'
import {
	DEFAULT_DOCUMENT_PAGE,
	decodeDocumentCursor,
	encodeDocumentCursor,
	MAX_DOCUMENT_PAGE,
} from './cursor'
import type { DocumentDetail, DocumentSummary, TabRow, TabSummary } from './dto'
import { createDocumentBodySchema, updateDocumentBodySchema } from './dto'

const EMPTY_CONTENT: Record<string, unknown> = { type: 'doc', content: [] }

export default class DocumentsService extends BaseService {
	/**
	 * Daftar dokumen, terbaru lebih dulu.
	 *
	 * Tanpa `limit`/`cursor` jawabannya seluruh daftar, sama seperti
	 * sebelumnya. Dengan salah satunya, jawabannya satu halaman, dan kursor
	 * halaman berikutnya dikirim di header `X-Next-Cursor` (tidak ada berarti
	 * sudah habis). Badannya tetap larik biasa, jadi bentuk kawatnya tidak
	 * berubah untuk pemanggil lama.
	 */
	async list(): Promise<Response> {
		try {
			const page = this.pageQuery()
			const rows = await findDocumentsByOwner(
				await this.identityId(),
				this.optionalUuidQuery('projectId', 'ID proyek'),
				page ?? undefined,
			)
			const visible = page ? rows.slice(0, page.limit) : rows
			const last = visible.at(-1)
			if (page && rows.length > page.limit && last) {
				this.context.header('X-Next-Cursor', encodeDocumentCursor({ updatedAt: last.updatedAt, id: last.id }))
			}

			const result: DocumentSummary[] = visible.map((row) => ({
				id: row.id,
				title: row.title,
				projectId: row.projectId,
				templateSlug: row.templateSlug,
				layout: row.layout,
				metadata: row.metadata,
				brief: row.brief,
				tabCount: Number(row.tabCount),
				updatedAt: row.updatedAt.getTime(),
				createdAt: row.createdAt.getTime(),
			}))
			return this.success({ data: result })
		} catch (error) {
			return this.failFromError(error)
		}
	}
	private pageQuery(): { limit: number; after?: DocumentCursor } | null {
		const rawLimit = this.context.req.query('limit')
		const rawCursor = this.context.req.query('cursor')
		if (!rawLimit && !rawCursor) return null

		const limit = rawLimit ? Number(rawLimit) : DEFAULT_DOCUMENT_PAGE
		if (!Number.isInteger(limit) || limit < 1 || limit > MAX_DOCUMENT_PAGE) {
			throw AppError.badRequest(`limit harus bilangan bulat 1-${MAX_DOCUMENT_PAGE}`)
		}
		if (!rawCursor) return { limit }

		const after = decodeDocumentCursor(rawCursor)
		if (!after) throw AppError.badRequest('cursor tidak sah')
		return { limit, after }
	}
	async getById(): Promise<Response> {
		try {
			const document = await findDocumentById(this.documentId(), await this.identityId())
			if (!document) throw AppError.notFound('Dokumen tidak ditemukan')

			const tabs = await findTabsByDocument(document.id)
			return this.success({ data: this.toDetail(document, tabs) })
		} catch (error) {
			return this.failFromError(error)
		}
	}
	async create(): Promise<Response> {
		try {
			const body = createDocumentBodySchema.safeParse(await this.context.req.json())
			if (!body.success) {
				return this.error({ errors: body.error.issues.map((issue) => issue.message) })
			}

			const { content, emoji, language, layout, metadata, brief, tabLayout, templateSlug, projectId, title } =
				body.data
			const identityId = await this.identityId()

			// Template menentukan judul, isi, dan tata letak bawaannya; nilai yang
			// dikirim pemanggil tetap menang bila keduanya ada.
			let template: Template | null = null
			if (templateSlug) {
				template = await findTemplateBySlug(templateSlug)
				if (!template) throw AppError.badRequest(`Template "${templateSlug}" tidak dikenal`)
			}

			const resolvedTitle = title ?? template?.name
			if (!resolvedTitle) throw AppError.badRequest('Judul wajib diisi')

			let targetProjectId: string
			if (projectId) {
				await this.ownedProject(projectId)
				targetProjectId = projectId
			} else {
				targetProjectId = (await findOrCreateDefaultProject(identityId)).id
			}

			const document = await insertDocument({
				title: resolvedTitle,
				project_id: targetProjectId,
				template_slug: template?.slug ?? null,
				layout: layout ?? (template && templateDocumentLayout(template.spec)) ?? null,
				metadata: metadata ?? null,
				brief: brief ?? null,
			})
			if (!document) throw AppError.internalServerError('Gagal menyimpan dokumen')

			const tab = await insertTab({
				document_id: document.id,
				title: resolvedTitle,
				/*
				 * Metadata mengganti teks contoh di kerangka - sekali, di sini. Isi
				 * yang dikirim pemanggil tidak disentuh: ia bukan kerangka template,
				 * jadi tidak ada teks contoh yang boleh diasumsikan ada di dalamnya.
				 */
				content:
					content ??
					(template
						? applyTemplateMetadata(template.content, template.spec.metadataFields, metadata)
						: EMPTY_CONTENT),
				emoji: emoji ?? null,
				language: language ?? null,
				layout: tabLayout ?? (template && templateTabLayout(template.spec)) ?? null,
				position: 0,
			})
			if (!tab) throw AppError.internalServerError('Gagal menyimpan tab pertama')
			await snapshotIntervalTab(tab.id, tab.content, this.ownerId())

			return this.success({ data: this.toDetail(document, [tab]), status: 201 })
		} catch (error) {
			return this.failFromError(error)
		}
	}
	async update(): Promise<Response> {
		try {
			const body = updateDocumentBodySchema.safeParse(await this.context.req.json())
			if (!body.success) {
				return this.error({ errors: body.error.issues.map((issue) => issue.message) })
			}

			const { projectId, ...rest } = body.data
			const values: Partial<NewDocument> = { ...rest }
			if (projectId !== undefined) {
				await this.ownedProject(projectId)
				values.project_id = projectId
			}
			if (Object.keys(values).length === 0) {
				return this.error({ errors: ['Tidak ada field yang bisa diubah (title/projectId/layout)'] })
			}

			const document = await updateDocument(this.documentId(), await this.identityId(), values)
			if (!document) throw AppError.notFound('Dokumen tidak ditemukan')

			const tabs = await findTabsByDocument(document.id)
			return this.success({ data: this.toDetail(document, tabs) })
		} catch (error) {
			return this.failFromError(error)
		}
	}
	async remove(): Promise<Response> {
		try {
			const document = await deleteDocument(this.documentId(), await this.identityId())
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
	private async ownedProject(projectId: string): Promise<void> {
		const project = await findProjectById(projectId, await this.identityId())
		if (!project) throw AppError.badRequest('Proyek tidak ditemukan')
	}

	private documentId(): string {
		return this.uuidParam('id', 'ID dokumen')
	}

	private toDetail(document: Document, tabs: TabRow[]): DocumentDetail {
		const tabSummaries: TabSummary[] = tabs.map((tab) => ({
			id: tab.id,
			documentId: tab.document_id,
			title: tab.title,
			emoji: tab.emoji,
			language: tab.language,
			layout: tab.layout,
			position: tab.position,
			updatedAt: tab.updated_at.getTime(),
			createdAt: tab.created_at.getTime(),
		}))
		return {
			id: document.id,
			title: document.title,
			projectId: document.project_id,
			templateSlug: document.template_slug,
			layout: document.layout,
			metadata: document.metadata,
			brief: document.brief,
			tabCount: tabSummaries.length,
			tabs: tabSummaries,
			updatedAt: document.updated_at.getTime(),
			createdAt: document.created_at.getTime(),
		}
	}
}
