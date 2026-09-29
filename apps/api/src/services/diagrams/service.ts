import { readFile } from 'node:fs/promises'
import { skillFilePath } from '@writer-hub/shared'
import { type ProviderConfig, providerConfig } from '@/services/drafts/generation'
import JobSubmissionService from '@/services/job-submission.service'
import { chartProblems } from './chart-check'
import { type DiagramDrawBody, diagramDrawSchema } from './dto'
import { buildDiagramMessages, repairMessage } from './prompt'
import { type SubAgentFailure, type SubAgentReply, streamCompletion } from './provider-call'
import { extractSvg, structuralProblems, svgReceipt } from './svg-output'

const SKILLS_DIR = new URL('../../../../../packages/shared/skills/', import.meta.url)
const SKILL = 'diagram-design'

/** Menggambar itu mekanis; suhu tinggi hanya melahirkan koordinat yang meleset. */
const TEMPERATURE = 0.2

/**
 * Batas satu panggilan: jeda tanpa satu potongan pun, dan panjang totalnya.
 *
 * Tanpa penalaran, Flash menggambar dalam 13-105 detik (diukur 28 Sep; yang
 * lambat karena OpenRouter merutekan ke penyedia yang lebih pelan). Batas lama
 * 90 detik untuk seluruh panggilan memotong 15 dari 46 gambar.
 */
const IDLE_MS = 60_000
const CALL_MS = 150_000

/**
 * Penalaran dimatikan. Diukur 28 Sep dengan Flash: bar chart 48 detik dengan
 * penalaran (86% token keluaran) dan 15 detik tanpanya; ERD dan flowchart
 * dengan penalaran - bahkan `effort: low` - tidak selesai dalam 280 detik,
 * sedangkan tanpanya selesai dalam 13-104 detik dan lolos semua pemeriksaan.
 */
const REASONING = false

type DrawFailure = SubAgentFailure | 'unusable'
type DrawResult = { svg: string } | { failure: DrawFailure; detail: string }

/** Status dan kalimat untuk tiap jenis kegagalan; kalimatnya sampai ke model. */
const FAILURE: Record<DrawFailure, { status: 422 | 502 | 504; message: (detail: string) => string }> = {
	timeout: { status: 504, message: (detail) => `Sub-agent penggambar tidak selesai (${detail}).` },
	rejected: { status: 502, message: (detail) => `Provider menolak permintaan gambar (${detail}).` },
	empty: { status: 502, message: () => 'Sub-agent tidak mengembalikan apa pun.' },
	unusable: { status: 422, message: (detail) => `Gambarnya tidak lolos pemeriksaan: ${detail}.` },
}

/**
 * Sub-agent penggambar diagram.
 *
 * Ia membalas **dua hal yang berbeda kepada dua pembaca**: SVG utuh ke klien,
 * yang menyisipkannya langsung ke dokumen, dan tanda terima pendek ke model
 * utama. Pemisahan itu adalah seluruh alasan sub-agent ini ada - kalau
 * gambarnya ikut kembali lewat hasil alat, ratusan baris koordinat mendarat di
 * percakapan dan dibayar lagi di setiap giliran sesudahnya.
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

			const drawn = await this.drawWithRepair(config, parsed.data, sources)
			if ('failure' in drawn) {
				const failure = FAILURE[drawn.failure]
				return this.error({ errors: [failure.message(drawn.detail)], status: failure.status })
			}

			const receipt = svgReceipt(drawn.svg)
			return this.success({ data: { svg: drawn.svg, ...receipt } })
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
	): Promise<DrawResult> {
		const messages = buildDiagramMessages(body, sources)

		const reply = await this.callProvider(config, messages)
		if (!reply.ok) return { failure: reply.failure, detail: reply.detail }
		const first = extractSvg(reply.content)
		if (!first) return { failure: 'unusable', detail: 'the reply held no <svg> element' }

		const problems = [...structuralProblems(first), ...chartProblems(first, body.type)]
		if (problems.length === 0) return { svg: first }

		/*
		 * Cacat sisa yang bisa ditolong penyaring di klien tetap lolos - gambar
		 * yang kehilangan satu ikon masih berguna. Dua yang tidak bisa ditolong
		 * siapa pun ditolak: viewBox yang tidak terbaca membuat gambarnya tidak
		 * bisa diukur, dan chart yang skalanya salah adalah data yang salah
		 * dengan tampilan yang meyakinkan. Lebih baik tidak ada gambar.
		 */
		const fatal = (svg: string, found: string[]) =>
			found.some((problem) => problem.includes('viewBox') || problem.includes('scale')) ||
			chartProblems(svg, body.type).length > 0

		const retry = await this.callProvider(config, [
			...messages,
			{ role: 'assistant', content: first },
			repairMessage(first, problems),
		])
		const repaired = retry.ok ? extractSvg(retry.content) : null
		// Perbaikan yang tidak datang: gambar pertama tetap dipakai bila cacatnya bisa ditolong.
		if (!repaired) {
			if (!fatal(first, problems)) return { svg: first }
			const missing = retry.ok ? '' : ` (the fix did not arrive: ${retry.detail})`
			return { failure: 'unusable', detail: `${problems.join('; ')}${missing}` }
		}

		const remaining = [...structuralProblems(repaired), ...chartProblems(repaired, body.type)]
		return fatal(repaired, remaining)
			? { failure: 'unusable', detail: remaining.join('; ') }
			: { svg: repaired }
	}

	private callProvider(
		config: ProviderConfig,
		messages: Array<{ role: string; content: string }>,
	): Promise<SubAgentReply> {
		return streamCompletion(config, messages, {
			temperature: TEMPERATURE,
			reasoning: REASONING,
			idleMs: IDLE_MS,
			totalMs: CALL_MS,
		})
	}
}
