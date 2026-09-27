import { describe, expect, test } from 'bun:test'
import type { JSONContent } from '@tiptap/core'
import { exportDocx } from '@/features/document/export-docx'
import { DEFAULT_PAGE_SETUP, pageGeometry } from '@/features/editor/page-geometry'
import { buildSchema } from '@/features/sync/serialize'
import { caseById, USE_CASES } from './cases'
import { type CaseResult, caseResult, checkCase, readinessReport } from './check'
import { blankPages, type CaseFacts, docxFacts, structureDamage } from './measure'

const PNG_1PX =
	'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

const heading = (level: number, text: string): JSONContent => ({
	type: 'heading',
	attrs: { level },
	content: [{ type: 'text', text }],
})
const paragraph = (text: string): JSONContent =>
	text ? { type: 'paragraph', content: [{ type: 'text', text }] } : { type: 'paragraph' }
const table = (text: string): JSONContent => ({
	type: 'table',
	content: [{ type: 'tableRow', content: [{ type: 'tableCell', content: [paragraph(text)] }] }],
})
const picture: JSONContent = {
	type: 'htmlBlock',
	attrs: {
		html: '<div>grafik</div>',
		height: 200,
		snapshot: PNG_1PX,
		snapshotWidth: 400,
		snapshotHeight: 200,
	},
}

/** DOCX sungguhan dari ekspor aplikasi, supaya pembacanya diuji terhadap keluaran yang sama. */
async function docx(content: JSONContent[]): Promise<Uint8Array> {
	const blob = await exportDocx(buildSchema().nodeFromJSON({ type: 'doc', content }), {
		title: 'uji',
		geometry: pageGeometry(DEFAULT_PAGE_SETUP),
		setup: DEFAULT_PAGE_SETUP,
	})
	return new Uint8Array(await blob.arrayBuffer())
}

const BODY =
	'Puji syukur penulis panjatkan ke hadirat Tuhan Yang Maha Esa. Laporan ini disusun untuk memenuhi tugas mata kuliah dan tidak akan selesai tanpa bantuan banyak pihak.'

describe('fakta DOCX', () => {
	test('blok tingkat atas berurutan, dengan tabel, gambar, dan kata', async () => {
		const facts = docxFacts(
			await docx([heading(1, 'Pendahuluan'), paragraph('Satu dua tiga.'), table('sel di tabel'), picture]),
		)

		expect(facts.blocks.map((block) => block.kind)).toEqual(['heading', 'paragraph', 'table', 'paragraph'])
		expect(facts.blocks[0]).toEqual({ kind: 'heading', level: 1, text: 'Pendahuluan' })
		expect(facts.tables).toBe(1)
		expect(facts.images).toBe(1)
		expect(facts.media).toBe(1)
		expect(facts.words).toBe(7)
		// Paragraf di dalam sel bukan blok tersendiri.
		expect(facts.blocks[2]).toMatchObject({ kind: 'table', text: 'sel di tabel' })
	})

	test('seksi dua kolom terbaca dari w:cols', async () => {
		const facts = docxFacts(
			await docx([
				paragraph('satu kolom'),
				{ type: 'sectionBreak', attrs: { pageSetup: null, columns: { count: 2 } } },
				paragraph('dua kolom'),
			]),
		)
		expect(facts.columnSections).toContain(2)
	})

	test('bukan DOCX: galat yang jelas', async () => {
		const { zipSync } = await import('fflate')
		expect(() => docxFacts(zipSync({ 'a.txt': new Uint8Array([1]) }))).toThrow('word/document.xml')
	})
})

describe('kerusakan struktur', () => {
	test('heading yang berisi paragraf isi (T3)', async () => {
		const { blocks } = docxFacts(
			await docx([heading(1, `Kata Pengantar ${BODY}`), heading(1, 'BAB I PENDAHULUAN')]),
		)
		expect(structureDamage(blocks).headingsWithBody).toEqual([`Kata Pengantar ${BODY}`])
	})

	test('judul panjang satu kalimat bukan heading berisi paragraf', () => {
		const title =
			'Rancang Bangun Sistem Informasi Inventaris Laboratorium Komputer Berbasis Web (Studi Kasus: Politeknik Contoh)'
		expect(structureDamage([{ kind: 'heading', level: 1, text: title }]).headingsWithBody).toEqual([])
	})

	test('heading ganda tingkat 1-2, dan bagian kosong (N5)', () => {
		const damage = structureDamage([
			{ kind: 'heading', level: 1, text: 'Pendahuluan' },
			{ kind: 'paragraph', text: 'isi', images: 0 },
			{ kind: 'heading', level: 1, text: 'Pembahasan' },
			{ kind: 'paragraph', text: '', images: 0 },
			{ kind: 'heading', level: 1, text: 'Daftar Pustaka' },
			{ kind: 'paragraph', text: 'Rujukan.', images: 0 },
			{ kind: 'heading', level: 1, text: 'PENDAHULUAN' },
			{ kind: 'paragraph', text: 'isi lagi', images: 0 },
		])
		expect(damage.duplicateHeadings).toEqual(['Pendahuluan (2×)'])
		expect(damage.emptySections).toEqual(['Pembahasan'])
	})

	test('bab yang langsung dibuka subbab tidak kosong; gambar dan tabel dihitung isi', () => {
		const damage = structureDamage([
			{ kind: 'heading', level: 1, text: 'BAB I' },
			{ kind: 'heading', level: 2, text: '1.1 Latar' },
			{ kind: 'paragraph', text: '', images: 1 },
			{ kind: 'heading', level: 2, text: '1.2 Tabel' },
			{ kind: 'table', text: '', images: 0 },
		])
		expect(damage.emptySections).toEqual([])
	})

	test('daftar isi/tabel/gambar kosong dan heading yang isinya menempel tidak dihitung ulang', () => {
		const damage = structureDamage([
			{ kind: 'heading', level: 1, text: 'DAFTAR GAMBAR' },
			{ kind: 'heading', level: 1, text: `Pendahuluan ${BODY}` },
			{ kind: 'heading', level: 1, text: 'Metode' },
			{ kind: 'paragraph', text: 'isi', images: 0 },
		])
		expect(damage.emptySections).toEqual([])
		expect(damage.headingsWithBody).toHaveLength(1)
	})
})

describe('halaman kosong PDF', () => {
	test('potongan sesudah \\f terakhir bukan halaman', () => {
		expect(blankPages('satu\fdua\f', 2)).toEqual([])
	})

	test('halaman tanpa teks sama sekali dihitung, bernomor mulai 1', () => {
		expect(blankPages('flyer\f   \n \f', 2)).toEqual([2])
	})
})

function facts(
	blocks: CaseFacts['docx']['blocks'],
	extra: Partial<CaseFacts['docx']> = {},
	pages = 3,
): CaseFacts {
	const text = blocks.map((block) => block.text).join('\n')
	return {
		docx: { blocks, tables: 0, images: 0, media: 0, columnSections: [], words: 0, text, ...extra },
		pdf: { pages, blankPages: [], text },
	}
}

describe('penilaian per case', () => {
	test('UC9: angka dan total sama persis dengan data', () => {
		const data = 'Januari 120 Februari 135 Maret 128 April 150 Mei 162 Juni 158 Juli 175 Agustus 168'
		const all = `${data} September 190 Oktober 205 November 198 Desember 230. Total 2.019. Tabel 1.1 Gambar 1.1 Gambar 1.2`
		const checks = checkCase(
			caseById('uc9'),
			facts([{ kind: 'paragraph', text: all, images: 0 }], { tables: 1, images: 2 }),
		)
		expect(checks.filter((check) => !check.ok)).toEqual([])

		const short = checkCase(
			caseById('uc9'),
			facts([{ kind: 'paragraph', text: `${data} Total 2.000`, images: 0 }], { tables: 1, images: 2 }),
		)
		expect(short.find((check) => check.id === 'angka-data')?.detail).toBe('hilang: 190, 205, 198, 230')
		expect(short.find((check) => check.id === 'total-setahun')?.ok).toBe(false)
	})

	test('bagian: urutan salah dan judul yang cuma paragraf dilaporkan terpisah dari yang hilang', () => {
		const section = (level: number, text: string) => ({ kind: 'heading' as const, level, text })
		const body = (text: string) => ({ kind: 'paragraph' as const, text, images: 0 })
		const result = checkCase(
			caseById('uc7'),
			facts([
				section(2, 'Pengalaman Kerja'),
				body('isi'),
				section(2, 'Ringkasan Profil'),
				body('isi'),
				body('Pendidikan'),
				body('Keahlian teknis saya meliputi Go, Rust, dan SQL.'),
			]),
		).find((check) => check.id === 'bagian')

		expect(result?.ok).toBe(false)
		expect(result?.detail).toBe(
			'tidak ada: "keahlian", "sertifikasi"; urutan salah: "Pengalaman Kerja"; bukan heading: "Pendidikan"',
		)
	})

	test('halaman ±1 untuk dokumen bertarget, tepat untuk flyer', () => {
		const pages = (id: string, count: number) =>
			checkCase(caseById(id), facts([], {}, count)).find((check) => check.id === 'halaman')?.ok
		expect([pages('uc1', 7), pages('uc1', 13), pages('uc1', 14)]).toEqual([true, true, false])
		expect([pages('uc5', 1), pages('uc5', 2)]).toEqual([true, false])
	})
})

describe('laporan kriteria siap produksi', () => {
	const result = (id: string, passed: boolean, nudges?: number): CaseResult => ({
		...caseResult(caseById(id), facts([]), { pdf: null, docx: `${id}.docx` }),
		passed,
		...(nudges === undefined ? {} : { driver: { nudges, costUsd: 0.1 } }),
	})

	test('angka dari penggerak yang tidak ada ditulis "belum diukur", bukan nol', () => {
		const report = readinessReport([result('uc1', false), result('uc2', true)])
		expect(report).toContain('| Dokumen yang memenuhi semua syaratnya | 1 dari 2 |')
		expect(report).toContain('| Dorongan manual "lanjutkan" per dokumen | belum diukur |')
		expect(report).toContain('| Biaya rata-rata per dokumen | belum diukur |')
	})

	test('dorongan dan biaya dirangkum bila ada', () => {
		const report = readinessReport([result('uc1', false, 0), result('uc2', false, 6)])
		expect(report).toContain('| 0–6 (2 dokumen) |')
		expect(report).toContain('US$0,10')
	})
})

describe('definisi case', () => {
	test('sembilan case, id unik, pola bagian valid, prompt meminta outline dulu', () => {
		expect(USE_CASES).toHaveLength(9)
		expect(new Set(USE_CASES.map((item) => item.id)).size).toBe(9)
		for (const item of USE_CASES) {
			for (const source of [...(item.expect.sections ?? []), ...(item.expect.present ?? [])]) {
				expect(() => new RegExp(source, 'i')).not.toThrow()
			}
			expect(item.prompt).toContain('outline')
		}
	})

	test('pola BAB tidak saling tertukar', () => {
		const [first, second, , fourth, fifth] = caseById('uc2').expect.sections ?? []
		expect(new RegExp(first, 'i').test('BAB II TINJAUAN PUSTAKA')).toBe(false)
		expect(new RegExp(second, 'i').test('BAB II TINJAUAN PUSTAKA')).toBe(true)
		expect(new RegExp(fourth, 'i').test('BAB V PENUTUP')).toBe(false)
		expect(new RegExp(fifth, 'i').test('BAB V, PENUTUP')).toBe(true)
	})
})
