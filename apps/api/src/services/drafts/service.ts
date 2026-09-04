import type { DraftHandoff, DraftOutput, DraftProgress, TabLayout } from '@writer-hub/shared'
import { env } from '@/config/env'
import type { Document, DocumentTab, Template } from '@/db/schemas'
import { AppError } from '@/lib/error'
import { findDocumentById, insertDocument } from '@/repository/document'
import { findTabsByDocument, insertTab } from '@/repository/document-tab'
import { findOrCreateDefaultProject, findProjectById } from '@/repository/project'
import { findTemplateBySlug } from '@/repository/template'
import JobSubmissionService from '@/services/job-submission.service'
import { snapshotIntervalTab } from '@/services/tabs/service'
import { templateDocumentLayout, templateTabLayout } from '@/services/templates/layout'
import { designCanvas, designLayout } from './design-layout'
import { type DraftRequest, draftRequestSchema } from './dto'
import { type ProviderConfig, providerConfig } from './generation'
import { headingTitle, markdownToDoc, type ProseMirrorDoc } from './markdown-doc'
import { pendingRenderErrors, resolveOutputs } from './output'
import { draftPercent, targetCharacters } from './progress'
import { buildDraftMessages } from './prompt'
import { recallDraftRequest, rememberDraftRequest } from './request-store'
import { startDraftGeneration } from './runner'
import { type DraftState, readDraftState } from './status'

/**
 * Menukar satu permintaan "buatkan …" dari klien eksternal dengan sebuah
 * dokumen WritingHub beserta tautannya.
 *
 * Dokumennya dibuat lebih dulu dan selalu utuh - punya id, judul, proyek, dan
 * satu tab - supaya tautannya bisa dibalas seketika. Kalau naskahnya masih
 * harus ditulis, itu berlangsung sesudah balasan dikirim (lihat `runner.ts`),
 * kemajuannya ditanyakan lewat `status()`, dan kegagalannya bisa diulang lewat
 * `retry()` tanpa pemanggil perlu menyimpan prompt aslinya.
 */

/** Bentuk dokumen kosong yang sama dengan yang dipakai DocumentsService. */
const EMPTY_CONTENT: ProseMirrorDoc = { type: 'doc', content: [{ type: 'paragraph' }] }

const TITLE_FROM_PROMPT_CHARS = 80
const FALLBACK_TITLE = 'Draf tanpa judul'

/**
 * Apakah jawaban model boleh berakhir sebagai blok rancangan.
 *
 * `document` menutupnya rapat - pemanggil sudah menyatakan ia mau prosa, dan
 * contoh HTML di dalam artikel teknis harus tetap jadi blok kode. Dua nilai
 * lainnya membukanya; deteksinya sendiri sempit (`singleHtmlBlock`), jadi
 * membuka pintu ini tidak berarti setiap pagar HTML berubah bentuk.
 */
function allowsDesign(request: DraftRequest): boolean {
	return request.kind !== 'document'
}

/** Naskah yang seluruhnya satu blok rancangan - lihat `markdownToDoc`. */
function isDesignDoc(content: ProseMirrorDoc): boolean {
	return content.content.length === 1 && content.content[0].type === 'htmlBlock'
}

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
			const template = body.templateSlug ? await this.requireTemplate(body.templateSlug) : null

			return body.content
				? await this.parkReadyDraft(body, body.content, projectId, template)
				: await this.startGeneratedDraft(body, projectId, template)
		} catch (error) {
			return this.failFromError(error)
		}
	}

	async status(): Promise<Response> {
		try {
			const { document, tab } = await this.ownedDraft()
			const state = await readDraftState(document.id)
			// Keluaran yang diminta ikut tersimpan bersama permintaannya, jadi
			// jawaban status membawa daftar yang sama dengan jawaban pembuatnya -
			// pemanggil yang hanya memegang `statusUrl` tidak kehilangan apa pun.
			const request = await recallDraftRequest(document.id)

			return this.success({
				data: this.toHandoff(document, tab.id, state, request ? resolveOutputs(request) : []),
			})
		} catch (error) {
			return this.failFromError(error)
		}
	}

	/**
	 * Menulis ulang draf yang gagal, ke dalam dokumen yang sama. Permintaan
	 * aslinya diambil dari simpanan, jadi penulis yang cuma memegang tautan pun
	 * bisa mencoba lagi - ia tidak pernah melihat prompt yang menghasilkannya.
	 */
	async retry(): Promise<Response> {
		try {
			const { document, tab } = await this.ownedDraft()

			const current = await readDraftState(document.id)
			if (current.status === 'generating') {
				throw AppError.conflict('Draf ini masih ditulis - tunggu sampai selesai sebelum mencoba lagi.')
			}

			const request = await recallDraftRequest(document.id)
			if (!request?.prompt) {
				throw AppError.cantProcess(
					'Permintaan aslinya sudah tidak tersimpan. Kirim ulang permintaannya lewat POST /api/v1/drafts.',
				)
			}

			const config = await this.resolveGenerationProvider(request.model)
			if (!config) return this.providerUnavailable()

			await this.beginGeneration(document.id, tab.id, request, config)

			return this.success({
				data: this.toHandoff(document, tab.id, await readDraftState(document.id), resolveOutputs(request)),
				status: 202,
			})
		} catch (error) {
			return this.failFromError(error)
		}
	}

	/** Naskah sudah jadi di sisi pemanggil - tinggal disimpan sebagai dokumen. */
	private async parkReadyDraft(
		body: DraftRequest,
		markdown: string,
		projectId: string,
		template: Template | null,
	): Promise<Response> {
		const title = body.title ?? headingTitle(markdown) ?? this.promptTitle(body.prompt) ?? FALLBACK_TITLE
		const content = markdownToDoc(markdown, {
			allowHtmlBlock: allowsDesign(body),
			canvas: designCanvas(body.prompt),
		})
		// Naskahnya sudah ada, jadi bentuknya sudah pasti di sini - lembarnya bisa
		// langsung disetel saat dokumen dibuat, tanpa perlu diperbaiki menyusul.
		const layout = isDesignDoc(content) ? designLayout(body.prompt) : null
		const { document, tab } = await this.createDocument(title, content, projectId, template, layout)

		await snapshotIntervalTab(tab.id, content, this.ownerId())

		return this.success({
			data: this.toHandoff(document, tab.id, { status: 'ready' }, resolveOutputs(body)),
			status: 201,
		})
	}

	/**
	 * Dokumen dibuat dulu - dengan kerangka template bila ada, supaya yang
	 * membukanya selama penulisan melihat bentuk akhirnya; naskahnya menyusul
	 * di latar belakang dan menggantikan kerangka itu.
	 */
	private async startGeneratedDraft(
		body: DraftRequest,
		projectId: string,
		template: Template | null,
	): Promise<Response> {
		const config = await this.resolveGenerationProvider(body.model)
		if (!config) return this.providerUnavailable()

		const title = body.title ?? template?.name ?? this.promptTitle(body.prompt) ?? FALLBACK_TITLE
		const initial = template ? (template.content as ProseMirrorDoc) : EMPTY_CONTENT
		const { document, tab } = await this.createDocument(title, initial, projectId, template)

		await this.beginGeneration(document.id, tab.id, body, config)

		return this.success({
			data: this.toHandoff(document, tab.id, await readDraftState(document.id), resolveOutputs(body)),
			status: 202,
		})
	}

	/**
	 * Satu-satunya jalan masuk ke penulisan latar belakang, dipakai permintaan
	 * baru maupun percobaan ulang - keduanya harus meninggalkan jejak yang sama:
	 * permintaan tersimpan, status `generating` tercatat.
	 */
	private async beginGeneration(
		documentId: string,
		tabId: string,
		request: DraftRequest,
		provider: ProviderConfig,
	): Promise<void> {
		await rememberDraftRequest(documentId, request)
		const template = await this.findTemplate(request.templateSlug)
		await startDraftGeneration({
			documentId,
			tabId,
			ownerId: await this.identityId(),
			createdBy: this.ownerId(),
			provider,
			messages: buildDraftMessages(request, await this.styleMemory(), template?.spec.aiRules),
			columns: template?.spec.layout.columns,
			// Judul dari prompt hanya penambal sampai naskahnya punya heading
			// sendiri; judul yang ditentukan pemanggil tidak boleh ditimpa.
			titleFromHeading: !request.title,
			words: request.words,
			allowHtmlBlock: allowsDesign(request),
			// Dihitung dari permintaan di sini karena hanya service yang
			// memegangnya; runner memakainya cuma kalau jawabannya ternyata
			// benar-benar sebuah rancangan.
			designLayout: designLayout(request.prompt),
			canvas: designCanvas(request.prompt),
		})
	}

	/** Template wajib ada saat permintaan dibuat - slug asing membalas 400. */
	private async requireTemplate(slug: string): Promise<Template> {
		const template = await findTemplateBySlug(slug, await this.identityId())
		if (!template) throw AppError.badRequest(`Template "${slug}" tidak dikenal`)
		return template
	}

	/**
	 * Template untuk penulisan latar belakang. Template yang dihapus di antara
	 * permintaan dan percobaan ulang dilewati diam-diam - drafnya tetap ditulis.
	 */
	private async findTemplate(slug?: string): Promise<Template | null> {
		if (!slug) return null
		try {
			return await findTemplateBySlug(slug, await this.identityId())
		} catch {
			return null
		}
	}

	private async resolveGenerationProvider(requestedModel?: string): Promise<ProviderConfig | null> {
		return providerConfig(await this.authorizeAndResolveProvider(), requestedModel)
	}

	private providerUnavailable(): Response {
		return this.error({ errors: ['Provider AI belum dikonfigurasi untuk penulisan draf.'], status: 503 })
	}

	/** Dokumen milik pemanggil beserta tab pertamanya - bentuk yang dipakai status dan retry. */
	private async ownedDraft(): Promise<{ document: Document; tab: DocumentTab }> {
		const documentId = this.uuidParam('documentId', 'ID dokumen')
		const document = await findDocumentById(documentId, await this.identityId())
		if (!document) throw AppError.notFound('Dokumen tidak ditemukan')

		const [tab] = await findTabsByDocument(documentId)
		if (!tab) throw AppError.notFound('Dokumen ini tidak punya tab')

		return { document, tab }
	}

	private async createDocument(
		title: string,
		content: ProseMirrorDoc,
		projectId: string,
		template: Template | null,
		/** Menimpa tata letak template; dipakai rancangan satu halaman. */
		layout: TabLayout | null = null,
	): Promise<{ document: Document; tab: DocumentTab }> {
		const document = await insertDocument({
			title,
			project_id: projectId,
			template_slug: template?.slug ?? null,
			layout: layout ?? (template ? templateDocumentLayout(template.spec) : null),
		})
		if (!document) throw AppError.internalServerError('Gagal menyimpan dokumen')

		const tab = await insertTab({
			document_id: document.id,
			title,
			content,
			layout: template ? templateTabLayout(template.spec) : null,
			position: 0,
		})
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

	/**
	 * `outputs` kosong berarti tidak ada berkas yang diminta, dan jawabannya
	 * tidak menyebut unduhan sama sekali - bentuk yang persis sama dengan
	 * sebelum medan `output` ada.
	 */
	private toHandoff(
		document: Document,
		tabId: string,
		state: DraftState,
		outputs: readonly DraftOutput[] = [],
	): DraftHandoff {
		return {
			documentId: document.id,
			tabId,
			title: document.title,
			status: state.status,
			url: `${env.WEB_URL.replace(/\/$/, '')}/d/${document.id}`,
			statusUrl: `${env.SERVICE_URL}/api/v1/drafts/${document.id}`,
			...(state.status === 'generating' ? { progress: toProgress(state) } : {}),
			...(state.error ? { error: state.error } : {}),
			...(state.errorCode ? { errorCode: state.errorCode } : {}),
			// Statusnya tetap apa adanya: dokumennya siap, hanya berkasnya yang
			// belum ada. Lihat `pendingRenderErrors`.
			...(outputs.length ? { downloads: [], renderErrors: pendingRenderErrors(outputs) } : {}),
		}
	}
}

/**
 * Catatan status yang belum sempat dilengkapi - misalnya dibaca tepat sesudah
 * `generating` ditulis - tetap harus menghasilkan kemajuan yang masuk akal,
 * bukan bidang kosong yang harus ditebak pembacanya.
 */
function toProgress(state: DraftState): DraftProgress {
	const phase = state.phase ?? 'preparing'
	const characters = state.characters ?? 0
	const target = state.targetCharacters ?? targetCharacters(undefined)

	return { phase, characters, targetCharacters: target, percent: draftPercent(phase, characters, target) }
}
