import { AppError } from '@/lib/error'
import type { NewDocumentTab } from '@/db/schemas'
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
import LoggerClient from '@/utils/logger'
import { createTabBodySchema, reorderTabsBodySchema, updateTabBodySchema } from './dto'
import type { TabDetail, TabSummary } from './dto'

const log = LoggerClient.getInstance()

/** Jarak minimal antar snapshot interval otomatis (10 menit). */
const INTERVAL_SNAPSHOT_MS = 10 * 60_000

/** Konten bawaan tab baru: dokumen Tiptap kosong. */
const EMPTY_CONTENT: Record<string, unknown> = { type: 'doc', content: [] }

/**
 * Snapshot `interval` otomatis sebuah tab: dibuat bila belum ada versi sama
 * sekali atau versi terakhir lebih tua dari `INTERVAL_SNAPSHOT_MS`, dan
 * dilewati bila konten identik dengan versi terakhir (PUT metadata tidak boleh
 * melahirkan versi kembar). Best-effort - kegagalan snapshot tidak boleh
 * menggagalkan autosave; cukup dicatat.
 *
 * Dipindah dari `DocumentsService` saat restrukturisasi (versi tetap per tab);
 * dipakai juga saat dokumen/tab baru dibuat supaya timeline tidak pernah kosong.
 */
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

/**
 * CRUD tab di dalam dokumen induk. Kepemilikan selalu diverifikasi lewat
 * dokumen induknya (`findTabById` join `documents`) - tab user lain tidak
 * pernah terlihat.
 */
export default class TabsService extends BaseService {
	/** Daftar tab sebuah dokumen, urut kiri-ke-kanan (`position`). */
	async list(): Promise<Response> {
		try {
			await this.ownedDocument()
			const rows = await findTabsByDocument(this.documentId())
			return this.success({ data: rows.map((row) => this.toSummary(row)) })
		} catch (error) {
			return this.failFromError(error)
		}
	}

	/** Tab baru di paling kanan; timeline versinya langsung punya snapshot awal. */
	async create(): Promise<Response> {
		try {
			const body = createTabBodySchema.safeParse(await this.context.req.json())
			if (!body.success) {
				return this.error({ errors: body.error.issues.map((issue) => issue.message) })
			}

			const document = await this.ownedDocument()
			const tab = await insertTab({
				document_id: document.id,
				owner_id: this.ownerId(),
				title: body.data.title ?? 'Untitled',
				content: body.data.content ?? EMPTY_CONTENT,
				emoji: body.data.emoji ?? null,
				language: body.data.language ?? null,
				position: await nextTabPosition(document.id),
			})
			if (!tab) throw AppError.internalServerError('Gagal menyimpan tab')

			// Versi interval pertama: timeline tidak pernah kosong.
			await snapshotIntervalTab(tab.id, tab.content, this.ownerId())
			await touchDocument(document.id)

			return this.success({ data: this.toDetail(tab), status: 201 })
		} catch (error) {
			return this.failFromError(error)
		}
	}

	/** Detail satu tab beserta kontennya. */
	async getById(): Promise<Response> {
		try {
			const tab = await this.ownedTab()
			return this.success({ data: this.toDetail(tab) })
		} catch (error) {
			return this.failFromError(error)
		}
	}

	/**
	 * Autosave tab: menimpa field yang dikirim saja, lalu memicu snapshot
	 * interval (penjaga 10 menit + konten identik + prune 50). Ini pengganti
	 * `PUT /documents/:id` lama.
	 */
	async update(): Promise<Response> {
		try {
			const body = updateTabBodySchema.safeParse(await this.context.req.json())
			if (!body.success) {
				return this.error({ errors: body.error.issues.map((issue) => issue.message) })
			}

			const existing = await this.ownedTab()
			const values: Partial<NewDocumentTab> = { ...body.data }
			// Patch kosong (field tak dikenal sudah di-strip zod) membuat drizzle
			// melempar "No values to set" - tangkap sebagai 400.
			if (Object.keys(values).length === 0) {
				return this.error({ errors: ['Tidak ada field yang bisa diubah (title/content/emoji/language)'] })
			}
			const tab = await updateTab(existing.id, values)
			if (!tab) throw AppError.internalServerError('Gagal menyimpan tab')

			await snapshotIntervalTab(tab.id, body.data.content ?? tab.content, this.ownerId())
			// Induk ikut naik di urutan "terbaru" Library saat salah satu tabnya
			// di-autosave.
			await touchDocument(tab.document_id)

			return this.success({ data: this.toDetail(tab) })
		} catch (error) {
			return this.failFromError(error)
		}
	}

	/**
	 * Hapus satu tab. Aturan minimal 1 tab per dokumen: menghapus tab TERAKHIR
	 * menghapus dokumen induknya sekalian (versi/share ikut sesuai aturan FK).
	 */
	async remove(): Promise<Response> {
		try {
			const tab = await this.ownedTab()
			const siblingCount = await countTabs(tab.document_id)

			const deleted = await deleteTab(tab.id)
			if (!deleted) throw AppError.internalServerError('Gagal menghapus tab')

			let documentDeleted = false
			if (siblingCount === 1) {
				await deleteDocument(tab.document_id, this.ownerId())
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

	/**
	 * Atur ulang urutan tab: `tabIds[0]` jadi paling kiri. Body harus memuat
	 * seluruh tab dokumen tepat sekali - reorder parsial ditolak supaya tidak
	 * ada tab yang kehilangan posisi.
	 */
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

	/** Dokumen induk milik user (dari route `/documents/:id/...`); 404 bila bukan. */
	private async ownedDocument() {
		const document = await findDocumentById(this.documentId(), this.ownerId())
		if (!document) throw AppError.notFound('Dokumen tidak ditemukan')
		return document
	}

	/** Tab milik user (dari route `/tabs/:tabId`); 404 bila bukan. */
	private async ownedTab() {
		const tab = await findTabById(this.tabId(), this.ownerId())
		if (!tab) throw AppError.notFound('Tab tidak ditemukan')
		return tab
	}

	private documentId(): string {
		const id = this.context.req.param('id')
		if (!id) throw AppError.badRequest('ID dokumen tidak ada')
		return id
	}

	private tabId(): string {
		const id = this.context.req.param('tabId')
		if (!id) throw AppError.badRequest('ID tab tidak ada')
		return id
	}

	private toSummary(tab: {
		id: string
		document_id: string
		title: string
		emoji: string | null
		language: string | null
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
			position: tab.position,
			updatedAt: tab.updated_at.getTime(),
			createdAt: tab.created_at.getTime(),
		}
	}
}
