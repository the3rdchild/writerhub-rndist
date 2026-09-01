import type { DraftHandoff, DraftStatus } from '@writer-hub/shared'
import { env } from '@/config/env'
import type { Document, DocumentTab } from '@/db/schemas'
import { AppError } from '@/lib/error'
import { findDocumentById, insertDocument } from '@/repository/document'
import { findTabsByDocument, insertTab } from '@/repository/document-tab'
import { findOrCreateDefaultProject, findProjectById } from '@/repository/project'
import JobSubmissionService from '@/services/job-submission.service'
import { snapshotIntervalTab } from '@/services/tabs/service'
import { type DraftRequest, draftRequestSchema } from './dto'
import { providerConfig } from './generation'
import { headingTitle, markdownToDoc, type ProseMirrorDoc } from './markdown-doc'
import { buildDraftMessages } from './prompt'
import { runDraftGeneration } from './runner'
import { markGenerating, readDraftState } from './status'

/**
 * Menukar satu permintaan "buatkan …" dari klien eksternal dengan sebuah
 * dokumen WritingHub beserta tautannya.
 *
 * Dokumennya dibuat lebih dulu dan selalu utuh - punya id, judul, proyek, dan
 * satu tab - supaya tautannya bisa dibalas seketika. Kalau naskahnya masih
 * harus ditulis, itu berlangsung sesudah balasan dikirim (lihat `runner.ts`)
 * dan kemajuannya ditanyakan lewat `status()`.
 */

/** Bentuk dokumen kosong yang sama dengan yang dipakai DocumentsService. */
const EMPTY_CONTENT: ProseMirrorDoc = { type: 'doc', content: [{ type: 'paragraph' }] }

const TITLE_FROM_PROMPT_CHARS = 80
const FALLBACK_TITLE = 'Draf tanpa judul'

export default class DraftsService extends JobSubmissionService {
	async create(): Promise<Response> {
		try {
			const parsed = draftRequestSchema.safeParse(await this.context.req.json().catch(() => ({})))
			if (!parsed.success) {
				return this.error({ errors: parsed.error.issues.map((issue) => issue.message) })
			}

			const body = parsed.data
			const identityId = await this.identityId()
			const projectId = await this.resolveProjectId(body.projectId, identityId)

			return body.content
				? await this.parkReadyDraft(body, body.content, projectId)
				: await this.startGeneratedDraft(body, projectId, identityId)
		} catch (error) {
			return this.failFromError(error)
		}
	}

	async status(): Promise<Response> {
		try {
			const documentId = this.uuidParam('documentId', 'ID dokumen')
			const document = await findDocumentById(documentId, await this.identityId())
			if (!document) throw AppError.notFound('Dokumen tidak ditemukan')

			const [tab] = await findTabsByDocument(documentId)
			if (!tab) throw AppError.notFound('Dokumen ini tidak punya tab')

			const state = await readDraftState(documentId)
			return this.success({
				data: this.toHandoff(document, tab.id, state.status, state.error),
			})
		} catch (error) {
			return this.failFromError(error)
		}
	}

	/** Naskah sudah jadi di sisi pemanggil - tinggal disimpan sebagai dokumen. */
	private async parkReadyDraft(body: DraftRequest, markdown: string, projectId: string): Promise<Response> {
		const title = body.title ?? headingTitle(markdown) ?? this.promptTitle(body.prompt) ?? FALLBACK_TITLE
		const content = markdownToDoc(markdown)
		const { document, tab } = await this.createDocument(title, content, projectId)

		await snapshotIntervalTab(tab.id, content, this.ownerId())

		return this.success({
			data: this.toHandoff(document, tab.id, 'ready'),
			status: 201,
		})
	}

	/** Dokumen dibuat kosong dulu; naskahnya menyusul di latar belakang. */
	private async startGeneratedDraft(
		body: DraftRequest,
		projectId: string,
		identityId: string,
	): Promise<Response> {
		const provider = await this.authorizeAndResolveProvider()
		const config = providerConfig(provider)
		if (!config) {
			return this.error({ errors: ['Provider AI belum dikonfigurasi untuk penulisan draf.'], status: 503 })
		}

		const title = body.title ?? this.promptTitle(body.prompt) ?? FALLBACK_TITLE
		const { document, tab } = await this.createDocument(title, EMPTY_CONTENT, projectId)

		await markGenerating(document.id)
		runDraftGeneration({
			documentId: document.id,
			tabId: tab.id,
			ownerId: identityId,
			createdBy: this.ownerId(),
			provider: config,
			messages: buildDraftMessages(body, await this.styleMemory()),
			// Judul dari prompt hanya penambal sampai naskahnya punya heading
			// sendiri; judul yang ditentukan pemanggil tidak boleh ditimpa.
			titleFromHeading: !body.title,
		})

		return this.success({
			data: this.toHandoff(document, tab.id, 'generating'),
			status: 202,
		})
	}

	private async createDocument(
		title: string,
		content: ProseMirrorDoc,
		projectId: string,
	): Promise<{ document: Document; tab: DocumentTab }> {
		const document = await insertDocument({ title, project_id: projectId })
		if (!document) throw AppError.internalServerError('Gagal menyimpan dokumen')

		const tab = await insertTab({ document_id: document.id, title, content, position: 0 })
		if (!tab) throw AppError.internalServerError('Gagal menyimpan tab pertama')

		return { document, tab }
	}

	private async resolveProjectId(projectId: string | undefined, identityId: string): Promise<string> {
		if (!projectId) return (await findOrCreateDefaultProject(identityId)).id

		const project = await findProjectById(projectId, identityId)
		if (!project) throw AppError.badRequest('Proyek tidak ditemukan')
		return project.id
	}

	private ownerId(): string {
		const userId = this.context.get('userId')
		if (!userId) throw AppError.unauthorized('User tidak dikenal')
		return userId
	}

	/** Baris pertama permintaan, dipotong sependek judul yang masih enak dibaca. */
	private promptTitle(prompt: string | undefined): string | null {
		const line = prompt
			?.split('\n')
			.map((part) => part.trim())
			.find(Boolean)
		if (!line) return null

		return line.length > TITLE_FROM_PROMPT_CHARS
			? `${line.slice(0, TITLE_FROM_PROMPT_CHARS).trimEnd()}…`
			: line
	}

	private toHandoff(document: Document, tabId: string, status: DraftStatus, error?: string): DraftHandoff {
		return {
			documentId: document.id,
			tabId,
			title: document.title,
			status,
			url: `${env.WEB_URL.replace(/\/$/, '')}/d/${document.id}`,
			statusUrl: `${env.SERVICE_URL}/api/v1/drafts/${document.id}`,
			...(error ? { error } : {}),
		}
	}
}
