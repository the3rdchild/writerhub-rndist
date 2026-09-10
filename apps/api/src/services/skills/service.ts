import { readFile } from 'node:fs/promises'
import { skillFilePath } from '@writer-hub/shared'
import BaseService from '@/services/base.service'
import { skillReadSchema } from './dto'

/**
 * Direktori overlay skill, relatif terhadap berkas ini.
 *
 * API dijalankan langsung dari sumber (tidak dibundel), dan `Dockerfile`
 * menyalin `packages/shared` apa adanya - jadi jalur yang sama berlaku di
 * mesin pengembang maupun di dalam kontainer.
 */
const SKILLS_DIR = new URL('../../../../../packages/shared/skills/', import.meta.url)

/**
 * Menyajikan teks skill ke model.
 *
 * Isinya statis dan ada di repo ini, tapi tetap dilayani server karena putaran
 * alat berjalan di browser - dan berkasnya tidak ikut ke bundel web.
 */
export default class SkillsService extends BaseService {
	async read(): Promise<Response> {
		try {
			const body = skillReadSchema.safeParse(await this.context.req.json().catch(() => ({})))
			if (!body.success) {
				return this.error({ errors: body.error.issues.map((issue) => issue.message) })
			}

			const path = skillFilePath(body.data.name, body.data.file)
			if (!path) {
				return this.error({ errors: [`Skill "${body.data.name}" tidak ada di katalog.`], status: 404 })
			}

			const text = await readFile(new URL(path, SKILLS_DIR), 'utf8')
			return this.success({ data: { text } })
		} catch (error) {
			return this.failFromError(error)
		}
	}
}
