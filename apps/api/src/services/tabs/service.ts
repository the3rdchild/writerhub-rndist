import type { TabLayoutOverride } from '@writer-hub/shared'
import type { NewDocumentTab } from '@/db/schemas'
import { AppError } from '@/lib/error'
import LoggerClient from '@/lib/logger'
import { deleteDocument, findDocumentById, touchDocument } from '@/repository/document'
import {
	countTabs,
	deleteTab,
	findTabById,
	findTabsByDocument,
	insertTab,
	nextTabPosition,
	reorderTabs,
	updateTab,
} from '@/repository/document-tab'
import {
	findLatestVersion,
	insertVersion,
	pruneIntervalVersions,
	versionContentEquals,
} from '@/repository/document-version'
import BaseService from '@/services/base.service'
import { countWords } from '@/services/versions/service'
import type { TabDetail, TabSummary } from './dto'
import { createTabBodySchema, reorderTabsBodySchema, updateTabBodySchema } from './dto'

const log = LoggerClient.getInstance()
const INTERVAL_SNAPSHOT_MS = 10 * 60_000
const EMPTY_CONTENT: Record<string, unknown> = { type: 'doc', content: [] }

export async function snapshotIntervalTab(
	tabId: string,
	content: Record<string, unknown>,
	createdBy: string,
): Promise<void> {
	try {
		const latest = await findLatestVersion(tabId)
		if (latest && Date.now() - latest.createdAt.getTime() <= INTERVAL_SNAPSHOT_MS) return
		if (latest && (await versionContentEquals(latest.id, content))) return

		await insertVersion({
			tab_id: tabId,
			content,
			trigger: 'interval',
			word_count: countWords(content),
			created_by: createdBy,
		})
		await pruneIntervalVersions(tabId)
	} catch (error) {
		log.error({ err: error, tabId }, 'Gagal membuat snapshot interval tab')
	}
}

export default class TabsService extends BaseService {
	async list(): Promise<Response> {
		try {
			await this.ownedDocument()
			const rows = await findTabsByDocument(this.documentId())
			return this.success({ data: rows.map((row) => this.toSummary(row)) })
		} catch (error) {
			return this.failFromError(error)
		}
	}
	async create(): Promise<Response> {
		try {
			const body = createTabBodySchema.safeParse(await this.context.req.json())
			if (!body.success) {
				return this.error({ errors: body.error.issues.map((issue) => issue.message) })
			}

			const document = await this.ownedDocument()
			const tab = await insertTab({
				document_id: document.id,
				title: body.data.title ?? 'Untitled',
				content: body.data.content ?? EMPTY_CONTENT,
				emoji: body.data.emoji ?? null,
				language: body.data.language ?? null,
				layout: body.data.layout ?? null,
				position: await nextTabPosition(document.id),
			})
			if (!tab) throw AppError.internalServerError('Gagal menyimpan tab')
			await snapshotIntervalTab(tab.id, tab.content, this.ownerId())
			await touchDocument(document.id)

			return this.success({ data: this.toDetail(tab), status: 201 })
		} catch (error) {
			return this.failFromError(error)
		}
	}
	async getById(): Promise<Response> {
		try {
			const tab = await this.ownedTab()
			return this.success({ data: this.toDetail(tab) })
		} catch (error) {
			return this.failFromError(error)
		}
	}
	async update(): Promise<Response> {
		try {
			const body = updateTabBodySchema.safeParse(await this.context.req.json())
			if (!body.success) {
				return this.error({ errors: body.error.issues.map((issue) => issue.message) })
			}

			const existing = await this.ownedTab()
			const values: Partial<NewDocumentTab> = { ...body.data }
			if (Object.keys(values).length === 0) {
				return this.error({
					errors: ['Tidak ada field yang bisa diubah (title/content/emoji/language/layout)'],
				})
			}
			const tab = await updateTab(existing.id, values)
			if (!tab) throw AppError.internalServerError('Gagal menyimpan tab')

			await snapshotIntervalTab(tab.id, body.data.content ?? tab.content, this.ownerId())
			await touchDocument(tab.document_id)

			return this.success({ data: this.toDetail(tab) })
		} catch (error) {
			return this.failFromError(error)
		}
	}
	async remove(): Promise<Response> {
		try {
			const tab = await this.ownedTab()
			const siblingCount = await countTabs(tab.document_id)

			const deleted = await deleteTab(tab.id)
			if (!deleted) throw AppError.internalServerError('Gagal menghapus tab')

			let documentDeleted = false
			if (siblingCount === 1) {
				await deleteDocument(tab.document_id, await this.identityId())
				documentDeleted = true
			} else {
				await touchDocument(tab.document_id)
			}

			return this.success({
				data: { id: tab.id, documentId: tab.document_id, documentDeleted },
			})
		} catch (error) {
			return this.failFromError(error)
		}
	}
	async reorder(): Promise<Response> {
		try {
			const body = reorderTabsBodySchema.safeParse(await this.context.req.json())
			if (!body.success) {
				return this.error({ errors: body.error.issues.map((issue) => issue.message) })
			}

			const document = await this.ownedDocument()
			const existing = await findTabsByDocument(document.id)
			const existingIds = new Set(existing.map((tab) => tab.id))
			const requested = body.data.tabIds

			if (requested.length !== existingIds.size || !requested.every((id) => existingIds.has(id))) {
				throw AppError.badRequest('tabIds harus memuat seluruh tab dokumen ini tepat sekali')
			}

			await reorderTabs(requested)
			const rows = await findTabsByDocument(document.id)
			return this.success({ data: rows.map((row) => this.toSummary(row)) })
		} catch (error) {
			return this.failFromError(error)
		}
	}

	private ownerId(): string {
		const userId = this.context.get('userId')
		if (!userId) throw AppError.unauthorized('User tidak dikenal')
		return userId
	}
	private async ownedDocument() {
		const document = await findDocumentById(this.documentId(), await this.identityId())
		if (!document) throw AppError.notFound('Dokumen tidak ditemukan')
		return document
	}
	private async ownedTab() {
		const tab = await findTabById(this.tabId(), await this.identityId())
		if (!tab) throw AppError.notFound('Tab tidak ditemukan')
		return tab
	}

	private documentId(): string {
		return this.uuidParam('id', 'ID dokumen')
	}

	private tabId(): string {
		return this.uuidParam('tabId', 'ID tab')
	}

	private toSummary(tab: {
		id: string
		document_id: string
		title: string
		emoji: string | null
		language: string | null
		layout: TabLayoutOverride | null
		position: number
		updated_at: Date
		created_at: Date
	}): TabSummary {
		return {
			id: tab.id,
			documentId: tab.document_id,
			title: tab.title,
			emoji: tab.emoji,
			language: tab.language,
			layout: tab.layout,
			position: tab.position,
			updatedAt: tab.updated_at.getTime(),
			createdAt: tab.created_at.getTime(),
		}
	}

	private toDetail(tab: {
		id: string
		document_id: string
		title: string
		content: Record<string, unknown>
		emoji: string | null
		language: string | null
		layout: TabLayoutOverride | null
		position: number
		updated_at: Date
		created_at: Date
	}): TabDetail {
		return {
			id: tab.id,
			documentId: tab.document_id,
			title: tab.title,
			content: tab.content,
			emoji: tab.emoji,
			language: tab.language,
			layout: tab.layout,
			position: tab.position,
			updatedAt: tab.updated_at.getTime(),
			createdAt: tab.created_at.getTime(),
		}
	}
}
