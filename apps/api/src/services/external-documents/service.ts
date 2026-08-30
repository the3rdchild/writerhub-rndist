import { randomBytes } from 'node:crypto'
import { env } from '@/config/env'
import { AppError } from '@/lib/error'
import { insertDocument } from '@/repository/document'
import { insertTab } from '@/repository/document-tab'
import { findOrCreateDefaultProject } from '@/repository/project'
import { insertShare } from '@/repository/share'
import { pickModel } from '@/services/chat/service'
import JobSubmissionService from '@/services/job-submission.service'
import { snapshotIntervalTab } from '@/services/tabs/service'
import { generateMarkdownDocument } from './completion'
import type { CreateExternalDocumentBody, ExternalDocumentResponse } from './dto'
import { createExternalDocumentBodySchema } from './dto'
import { markdownToDocument } from './markdown-content'

/**
 * Orkestrasi satu permintaan "buatkan dokumen" dari klien eksternal:
 * (mode prompt) buatkan draf lewat LLM, simpan sebagai dokumen + tab pertama,
 * lalu terbitkan share link dan balas dengan URL absolutnya.
 */
export default class ExternalDocumentsService extends JobSubmissionService {
	async create(): Promise<Response> {
		try {
			const body = createExternalDocumentBodySchema.safeParse(await this.context.req.json())
			if (!body.success) {
				return this.error({ errors: body.error.issues.map((issue) => issue.message) })
			}

			const { prompt, title, tone } = body.data
			let markdown = body.data.markdown
			if (markdown === undefined) {
				// Refine skema sudah menjamin prompt ada saat markdown kosong;
				// penjaga ini hanya supaya tipe TypeScript ikut yakin.
				if (!prompt) throw AppError.badRequest('Isi tepat salah satu dari markdown atau prompt, bukan keduanya')
				markdown = await this.generateDraft(prompt, tone)
			}

			const userId = this.context.get('userId')
			if (!userId) throw AppError.unauthorized('User tidak dikenal')
			const identityId = await this.identityId()

			const project = await findOrCreateDefaultProject(identityId)
			const document = await insertDocument({ title, project_id: project.id })
			if (!document) throw AppError.internalServerError('Gagal menyimpan dokumen')

			const content = markdownToDocument(markdown)
			const tab = await insertTab({
				document_id: document.id,
				title,
				content,
				emoji: null,
				language: null,
				position: 0,
			})
			if (!tab) throw AppError.internalServerError('Gagal menyimpan tab pertama')
			await snapshotIntervalTab(tab.id, content, userId)

			// Selalu anyone+viewer: penerima tautan cukup bisa membaca. Diperluas
			// hanya kalau PPE AI Chat benar-benar membutuhkannya.
			const share = await insertShare({
				document_id: document.id,
				token: randomBytes(16).toString('base64url'),
				access: 'anyone',
				role: 'viewer',
				created_by: userId,
			})
			if (!share) throw AppError.internalServerError('Gagal membuat share link')

			const result: ExternalDocumentResponse = {
				documentId: document.id,
				title: document.title,
				token: share.token,
				url: `${env.WEB_APP_URL}/share/${share.token}`,
			}
			return this.success({ data: result, status: 201 })
		} catch (error) {
			return this.failFromError(error)
		}
	}

	/**
	 * Mode prompt: draf dibuatkan LLM lewat jalur otorisasi dan kredensial yang
	 * sama dengan chat - provider admin-ppe didahulukan, env jadi cadangan.
	 */
	private async generateDraft(prompt: string, tone: CreateExternalDocumentBody['tone']): Promise<string> {
		const provider = await this.authorizeAndResolveProvider()

		const baseUrl = provider?.baseUrl || env.AI_BASE_URL
		const apiKey = provider?.apiKey || env.AI_API_KEY
		if (!baseUrl || !apiKey) {
			throw new AppError(503, 'Provider AI belum dikonfigurasi untuk pembuatan dokumen.')
		}

		return generateMarkdownDocument(
			{ baseUrl, apiKey, model: pickModel(undefined, provider?.modelId || env.AI_MODEL, baseUrl) },
			prompt,
			tone,
		)
	}
}
