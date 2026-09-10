import { readFile } from 'node:fs/promises'
import { skillFilePath } from '@writer-hub/shared'
import { type ProviderConfig, providerConfig } from '@/services/drafts/generation'
import JobSubmissionService from '@/services/job-submission.service'
import { type DiagramDrawBody, diagramDrawSchema } from './dto'
import { buildDiagramMessages, repairMessage } from './prompt'
import { extractSvg, structuralProblems, svgReceipt } from './svg-output'

const SKILLS_DIR = new URL('../../../../../packages/shared/skills/', import.meta.url)
const SKILL = 'diagram-design'

/** Menggambar itu mekanis; suhu tinggi hanya melahirkan koordinat yang meleset. */
const TEMPERATURE = 0.2

/**
 * Satu gambar tidak pernah selama satu draf. Batas ini ada supaya permintaan
 * yang menggantung tidak menahan koneksinya, bukan sebagai target.
 */
const REQUEST_TIMEOUT_MS = 90_000

/**
 * Sub-agent penggambar diagram.
 *
 * Ia membalas **dua hal yang berbeda kepada dua pembaca**: SVG utuh ke klien,
 * yang menyisipkannya langsung ke dokumen, dan tanda terima pendek ke model
 * utama. Pemisahan itu adalah seluruh alasan sub-agent ini ada - kalau
 * gambarnya ikut kembali lewat hasil alat, ratusan baris koordinat mendarat di
 * percakapan dan dibayar lagi di setiap giliran sesudahnya.
 *
 * Rancangan: `docs/CHAT-SUBAGENT-PLAN.md`.
 */
export default class DiagramsService extends JobSubmissionService {
	async draw(): Promise<Response> {
		try {
			const parsed = diagramDrawSchema.safeParse(await this.context.req.json().catch(() => ({})))
			if (!parsed.success) {
				return this.error({ errors: parsed.error.issues.map((issue) => issue.message) })
			}

			const provider = await this.authorizeAndResolveProvider()
			const config = providerConfig(provider, parsed.data.model)
			if (!config) {
				return this.error({ errors: ['Provider AI belum dikonfigurasi.'], status: 503 })
			}

			const sources = await this.grammarFor(parsed.data.type)
			if (!sources) {
				return this.error({ errors: [`Tipe diagram "${parsed.data.type}" tidak dikenal.`], status: 404 })
			}

			const svg = await this.drawWithRepair(config, parsed.data, sources)
			if (!svg) {
				return this.error({
					errors: ['Sub-agent tidak menghasilkan gambar yang bisa dipakai.'],
					status: 502,
				})
			}

			const receipt = svgReceipt(svg)
			return this.success({ data: { svg, ...receipt } })
		} catch (error) {
			return this.failFromError(error)
		}
	}

	private async grammarFor(type: string): Promise<{ skill: string; grammar: string } | null> {
		const skillPath = skillFilePath(SKILL)
		const grammarPath = skillFilePath(SKILL, type)
		if (!skillPath || !grammarPath) return null

		const [skill, grammar] = await Promise.all([
			readFile(new URL(skillPath, SKILLS_DIR), 'utf8'),
			readFile(new URL(grammarPath, SKILLS_DIR), 'utf8'),
		])
		return { skill, grammar }
	}

	/**
	 * Satu percobaan, lalu satu perbaikan kalau hasilnya cacat.
	 *
	 * Bukan lebih. Model yang gagal dua kali pada keluhan yang sama tidak akan
	 * berhasil pada percobaan ketiga, dan penulis sudah menunggu satu menit -
	 * kegagalan yang jujur lebih murah daripada putaran ketiga yang mahal.
	 */
	private async drawWithRepair(
		config: ProviderConfig,
		body: DiagramDrawBody,
		sources: { skill: string; grammar: string },
	): Promise<string | null> {
		const messages = buildDiagramMessages(body, sources)

		const first = extractSvg(await this.callProvider(config, messages))
		if (!first) return null

		const problems = structuralProblems(first)
		if (problems.length === 0) return first

		const repaired = extractSvg(
			await this.callProvider(config, [
				...messages,
				{ role: 'assistant', content: first },
				repairMessage(first, problems),
			]),
		)
		if (!repaired) return null

		/*
		 * Perbaikan yang masih cacat tetap dikembalikan kalau cacatnya bukan soal
		 * ukuran: penyaring di klien akan membuang bentuk terlarangnya, dan
		 * gambar yang kehilangan satu ikon masih lebih berguna daripada tidak ada
		 * gambar sama sekali. Yang tidak bisa ditolong penyaring adalah viewBox -
		 * tanpa itu gambarnya tidak bisa diukur, jadi ia ditolak di sini.
		 */
		return structuralProblems(repaired).some((problem) => problem.includes('viewBox')) ? null : repaired
	}

	private async callProvider(
		{ baseUrl, apiKey, model }: ProviderConfig,
		messages: Array<{ role: string; content: string }>,
	): Promise<string> {
		const response = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
			method: 'POST',
			headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
			body: JSON.stringify({ model, temperature: TEMPERATURE, messages }),
			signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
		})

		if (!response.ok) return ''
		const payload = (await response.json().catch(() => null)) as {
			choices?: Array<{ message?: { content?: string } }>
		} | null
		return payload?.choices?.[0]?.message?.content ?? ''
	}
}
