import type { UseCase } from './cases'
import { type Block, type CaseFacts, type StructureDamage, structureDamage } from './measure'

/**
 * Menilai berkas hasil satu use case terhadap syaratnya, dan merangkum banyak
 * case menjadi tabel "Kriteria AI Chat siap produksi" di
 * `docs/usulan-perbaikan.md`.
 */

export interface Check {
	id: string
	label: string
	ok: boolean
	detail: string
}

/** Angka dari penggerak UI - tidak bisa dibaca dari berkas hasil. */
export interface DriverStats {
	status?: string
	model?: string
	/** Pesan "lanjutkan" yang diketik penguji. */
	nudges?: number
	/** Lanjutan yang dilakukan aplikasi sendiri - bukan dorongan manual. */
	autoContinues?: number
	/** Kartu pertanyaan AI yang dijawab penguji. */
	questions?: number
	calls?: number
	tokensIn?: number
	tokensOut?: number
	costUsd?: number
	/** Token chat × tarif - tanpa sub-agent penggambar, yang tidak lewat stream chat. */
	costEstimateUsd?: number
	/** `tagihan`: selisih pemakaian provider; `tarif`: token × tarif. */
	costSource?: 'tagihan' | 'tarif'
	minutes?: number
}

export interface CaseResult {
	case: string
	title: string
	files: { pdf: string | null; docx: string }
	facts: {
		pages: number | null
		blankPages: number[]
		tables: number
		images: number
		columnSections: number[]
		words: number
		headings: string[]
	}
	damage: StructureDamage
	checks: Check[]
	passed: boolean
	driver?: DriverStats
}

const listed = (items: readonly string[]) => items.map((item) => `"${item}"`).join(', ')

/** Pola bagian sebagai sebutan yang terbaca: "^bab i\\b" menjadi "bab i". */
const patternName = (source: string) => source.replace(/\\b|\^|\$/g, '').replace(/\|/g, ' / ')

/** Paragraf pendek yang berdiri sebagai judul: tanpa titik penutup kalimat. */
const titleLike = (text: string) => text.length > 0 && text.length <= 80 && !/[.!?,;]$/.test(text)

/*
 * Bagian yang diminta, berurutan: tiap pola dicari sesudah bagian sebelumnya.
 * Tiga keadaan dilaporkan terpisah - Pendahuluan sesudah Daftar Pustaka (N5)
 * bukan bagian yang hilang, dan judul yang ditulis sebagai paragraf biasa
 * (tidak masuk daftar isi, tidak terbaca ATS) bukan bagian yang tidak ditulis.
 */
function sectionCheck(
	patterns: readonly string[],
	headings: readonly string[],
	blocks: readonly Block[],
): Check {
	const missing: string[] = []
	const misplaced: string[] = []
	const plain: string[] = []
	let cursor = -1
	for (const source of patterns) {
		const pattern = new RegExp(source, 'i')
		const after = headings.findIndex((text, index) => index > cursor && pattern.test(text))
		if (after !== -1) {
			cursor = after
			continue
		}
		const anywhere = headings.find((text) => pattern.test(text))
		const paragraph = blocks.find(
			(block) => block.kind === 'paragraph' && titleLike(block.text) && pattern.test(block.text),
		)
		if (anywhere) misplaced.push(anywhere)
		else if (paragraph) plain.push(paragraph.text)
		else missing.push(patternName(source))
	}
	const problems = [
		missing.length > 0 && `tidak ada: ${listed(missing)}`,
		misplaced.length > 0 && `urutan salah: ${listed(misplaced)}`,
		plain.length > 0 && `bukan heading: ${listed(plain)}`,
	].filter(Boolean)
	return {
		id: 'bagian',
		label: 'Bagian wajib ada dan berurutan',
		ok: problems.length === 0,
		detail: problems.length === 0 ? `${patterns.length} bagian berurutan` : problems.join('; '),
	}
}

export function checkCase(
	useCase: UseCase,
	facts: CaseFacts,
	damage = structureDamage(facts.docx.blocks),
): Check[] {
	const { expect } = useCase
	const { docx, pdf } = facts
	const checks: Check[] = []
	const text = `${docx.text}\n${pdf?.text ?? ''}`.toLowerCase()
	const headings = docx.blocks.flatMap((block) => (block.kind === 'heading' ? [block.text] : []))

	if (expect.pages) {
		const [low, high] = expect.pages
		const slack = expect.pageSlack ?? 1
		const target = low === high ? `${low}` : `${low}-${high}`
		checks.push({
			id: 'halaman',
			label: `Jumlah halaman ${target}${slack ? ` (±${slack})` : ''}`,
			ok: pdf !== null && pdf.pages >= low - slack && pdf.pages <= high + slack,
			detail: pdf ? `${pdf.pages} halaman` : 'PDF tidak diukur',
		})
	}
	checks.push({
		id: 'halaman-kosong',
		label: 'Tanpa halaman kosong',
		ok: pdf !== null && pdf.blankPages.length === 0,
		detail: !pdf
			? 'PDF tidak diukur'
			: pdf.blankPages.length === 0
				? 'tidak ada'
				: `halaman ${pdf.blankPages.join(', ')}`,
	})
	if (expect.minTables !== undefined) {
		checks.push({
			id: 'tabel',
			label: `Minimal ${expect.minTables} tabel`,
			ok: docx.tables >= expect.minTables,
			detail: `${docx.tables} tabel`,
		})
	}
	if (expect.maxTables !== undefined) {
		checks.push({
			id: 'tanpa-tabel',
			label: expect.maxTables === 0 ? 'Tanpa tabel' : `Maksimal ${expect.maxTables} tabel`,
			ok: docx.tables <= expect.maxTables,
			detail: `${docx.tables} tabel`,
		})
	}
	if (expect.minImages !== undefined) {
		checks.push({
			id: 'gambar',
			label: `Minimal ${expect.minImages} gambar di DOCX`,
			ok: docx.images >= expect.minImages,
			detail: `${docx.images} gambar`,
		})
	}
	if (expect.labels?.length) {
		const absent = expect.labels.filter((label) => !text.includes(label.toLowerCase()))
		checks.push({
			id: 'label',
			label: 'Label tabel/gambar disebut',
			ok: absent.length === 0,
			detail: absent.length === 0 ? `${expect.labels.length} label ada` : `tidak ada: ${listed(absent)}`,
		})
	}
	if (expect.sections?.length) checks.push(sectionCheck(expect.sections, headings, docx.blocks))
	if (expect.present?.length) {
		const absent = expect.present
			.filter((source) => !headings.some((heading) => new RegExp(source, 'i').test(heading)))
			.map(patternName)
		checks.push({
			id: 'bagian-lain',
			label: 'Bagian pelengkap ada',
			ok: absent.length === 0,
			detail: absent.length === 0 ? `${expect.present.length} bagian ada` : `tidak ada: ${listed(absent)}`,
		})
	}
	if (expect.twoColumns) {
		checks.push({
			id: 'dua-kolom',
			label: 'Ada seksi dua kolom',
			ok: docx.columnSections.includes(2),
			detail:
				docx.columnSections.length > 0
					? `seksi ${docx.columnSections.join('/')} kolom`
					: 'tanpa seksi berkolom',
		})
	}

	checks.push(
		{
			id: 'heading-berisi',
			label: 'Tidak ada heading berisi paragraf',
			ok: damage.headingsWithBody.length === 0,
			detail:
				damage.headingsWithBody.length === 0
					? 'tidak ada'
					: listed(damage.headingsWithBody.map((heading) => `${heading.slice(0, 60)}…`)),
		},
		{
			id: 'heading-ganda',
			label: 'Tidak ada heading ganda',
			ok: damage.duplicateHeadings.length === 0,
			detail: damage.duplicateHeadings.length === 0 ? 'tidak ada' : listed(damage.duplicateHeadings),
		},
		{
			id: 'bagian-kosong',
			label: 'Tidak ada bagian kosong',
			ok: damage.emptySections.length === 0,
			detail: damage.emptySections.length === 0 ? 'tidak ada' : listed(damage.emptySections),
		},
	)
	checks.push(...(expect.custom?.(facts) ?? []))
	return checks
}

export function caseResult(
	useCase: UseCase,
	facts: CaseFacts,
	files: CaseResult['files'],
	driver?: DriverStats,
): CaseResult {
	const damage = structureDamage(facts.docx.blocks)
	const checks = checkCase(useCase, facts, damage)
	return {
		case: useCase.id,
		title: useCase.title,
		files,
		facts: {
			pages: facts.pdf?.pages ?? null,
			blankPages: facts.pdf?.blankPages ?? [],
			tables: facts.docx.tables,
			images: facts.docx.images,
			columnSections: facts.docx.columnSections,
			words: facts.docx.words,
			headings: facts.docx.blocks.flatMap((block) =>
				block.kind === 'heading' ? [`H${block.level} ${block.text.slice(0, 80)}`] : [],
			),
		},
		damage,
		checks,
		passed: checks.every((check) => check.ok),
		...(driver ? { driver } : {}),
	}
}

const usd = (value: number) => `US$${value.toFixed(2).replace('.', ',')}`

/**
 * Tabel kriteria siap produksi dan rincian per case, sebagai Markdown.
 * Patokan yang butuh penggerak UI (dorongan, biaya) ditulis "belum diukur"
 * bila hasilnya tidak membawa angka itu - bukan nol.
 */
export function readinessReport(results: readonly CaseResult[], title = 'Hasil uji use case'): string {
	const damageCount = (result: CaseResult) =>
		result.damage.headingsWithBody.length +
		result.damage.duplicateHeadings.length +
		result.damage.emptySections.length
	const byCheck = (id: string) =>
		results.flatMap((result) =>
			result.checks.filter((check) => check.id === id).map((check) => ({ result, check })),
		)

	const images = byCheck('gambar')
	const pages = byCheck('halaman')
	const nudges = results.flatMap((result) =>
		result.driver?.nudges === undefined ? [] : [result.driver.nudges],
	)
	const autos = results.flatMap((result) =>
		result.driver?.autoContinues === undefined ? [] : [result.driver.autoContinues],
	)
	const costs = results.flatMap((result) =>
		result.driver?.costUsd === undefined ? [] : [result.driver.costUsd],
	)
	const damaged = results.filter((result) => damageCount(result) > 0)

	const rows = [
		[
			'Dokumen yang memenuhi semua syaratnya',
			`${results.filter((result) => result.passed).length} dari ${results.length}`,
			'≥ 8 dari 9',
		],
		[
			'Dorongan manual "lanjutkan" per dokumen',
			nudges.length === 0
				? 'belum diukur'
				: `${Math.min(...nudges)}–${Math.max(...nudges)} (${nudges.length} dokumen)`,
			'0',
		],
		[
			'Lanjutan otomatis oleh aplikasi (bukan dorongan manual)',
			autos.length === 0
				? 'belum diukur'
				: `${autos.reduce((sum, value) => sum + value, 0)} kali di ${autos.filter((value) => value > 0).length} dokumen`,
			'-',
		],
		[
			'Elemen visual yang diminta ada sebagai gambar di DOCX',
			`${images.filter(({ check }) => check.ok).length} dari ${images.length} dokumen`,
			'Semua',
		],
		[
			'Kerusakan struktur (isi di heading, heading ganda, bagian kosong, urutan)',
			`${results.reduce((sum, result) => sum + damageCount(result), 0)} temuan di ${damaged.length} dokumen; urutan salah di ${byCheck('bagian').filter(({ check }) => check.detail.includes('urutan salah')).length} dokumen`,
			'0',
		],
		[
			'Jumlah halaman dalam rentang yang diminta (±1)',
			`${pages.filter(({ check }) => check.ok).length} dari ${pages.length} dokumen bertarget halaman`,
			`≥ ${Math.max(0, pages.length - 1)} dari ${pages.length}`,
		],
		[
			'Biaya rata-rata per dokumen',
			costs.length === 0 ? 'belum diukur' : usd(costs.reduce((sum, cost) => sum + cost, 0) / costs.length),
			'Tetap atau turun',
		],
	]

	const lines = [
		`## ${title}`,
		'',
		'| Patokan | Hasil | Target |',
		'|---|---|---|',
		...rows.map((row) => `| ${row.join(' | ')} |`),
		'',
		'| Case | Lolos | Syarat yang belum terpenuhi |',
		'|---|---|---|',
		...results.map((result) => {
			const failed = result.checks.filter((check) => !check.ok)
			const detail = failed.map((check) => `${check.label}: ${check.detail}`).join('<br>') || '-'
			return `| ${result.case} ${result.title} | ${result.passed ? 'ya' : 'tidak'} | ${detail.replace(/\|/g, '\\|')} |`
		}),
	]
	return lines.join('\n')
}
