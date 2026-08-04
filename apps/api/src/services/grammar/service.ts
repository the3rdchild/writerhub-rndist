import { GRAMMAR_MODELS, type GrammarModel } from '@writer-hub/shared'
import { env } from '@/config/env'
import { baseMimeType } from '@/constants/mime'
import { uploadDocument } from '@/lib/file'
import QueueClient from '@/lib/queue'
import JobSubmissionService from '@/services/job-submission.service'
import { grammarBodySchema } from './dto'

/**
 * Produksi memaksa tier `ai` (`GRAMMAR_FORCE_MODEL=ai`) karena provider LLM
 * berasal dari admin-ppe. Dengan variabel itu dikosongkan - seperti pada
 * pengembangan lokal - pilihan model dari klien dipakai apa adanya, dan
 * `standard`/`advanced` berjalan penuh di engine pure-Python tanpa LLM.
 */
function resolveModel(requested: GrammarModel): GrammarModel {
	const forced = env.GRAMMAR_FORCE_MODEL
	return GRAMMAR_MODELS.includes(forced as GrammarModel) ? (forced as GrammarModel) : requested
}

/** `POST /api/v1/grammar` - terima teks atau dokumen, antrekan job grammar check. */
export default class GrammarService extends JobSubmissionService {
	async create(): Promise<Response> {
		try {
			const parsed = grammarBodySchema.safeParse(await this.context.req.parseBody({ all: true }))
			if (!parsed.success) {
				return this.error({ errors: parsed.error.issues.map((e) => e.message) })
			}
			const body = parsed.data

			const provider = await this.authorizeAndResolveProvider()
			const model = resolveModel(body.model)
			const jobId = crypto.randomUUID()

			const upload = body.file
				? {
						filename: body.file.name,
						mimeType: baseMimeType(body.file.type),
						storagePath: (await uploadDocument(body.file)).downloadUrl,
					}
				: null

			const requestId = await this.createPoolRequest(jobId, provider, {
				title: body.title ?? upload?.filename ?? 'Untitled document',
				model,
				...(body.text ? { text: body.text } : {}),
				...(upload ? { filename: upload.filename, mime_type: upload.mimeType } : {}),
			})

			await QueueClient.enqueueGrammarJob(jobId, {
				request_id: requestId,
				text: body.text ?? null,
				storage_path: upload?.storagePath ?? null,
				mime_type: upload?.mimeType ?? null,
				filename: upload?.filename ?? null,
				model,
				...this.providerPayload(provider),
			})

			return this.accepted(jobId, provider)
		} catch (error) {
			return this.failFromError(error)
		}
	}
}
