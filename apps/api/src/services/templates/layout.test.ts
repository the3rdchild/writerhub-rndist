import { describe, expect, test } from 'bun:test'
import {
	type DocumentTypography,
	headingBreakLevels,
	resolveHeadingStyle,
	type TemplateSpec,
} from '@writer-hub/shared'
import { BUILTIN_TEMPLATES } from './catalog'
import { compileTemplateContent } from './compile'
import { templateDocumentLayout, templateTabLayout } from './layout'

const pageSetup: TemplateSpec['layout']['pageSetup'] = {
	size: 'a4',
	orientation: 'portrait',
	margins: { top: 96, right: 96, bottom: 96, left: 96 },
	pageColor: null,
	pageless: false,
}

const furniture = { header: { default: { text: 'JUDUL PENDEK', align: 'left' as const } } }

const typography: DocumentTypography = {
	baseFont: { family: '"Times New Roman", Times, serif', sizePt: 12 },
	lineHeight: 1.5,
}

function spec(layout: Partial<TemplateSpec['layout']> = {}): TemplateSpec {
	return {
		layout: { pageSetup, ...layout },
		format: { citationStyle: 'none', headingScheme: 'plain', language: 'id' },
		structure: [{ heading: 'Isi', level: 1, required: true }],
		aiRules: ['Write in Indonesian.'],
	}
}

describe('tata letak dokumen', () => {
	test('membawa geometri halaman', () => {
		expect(templateDocumentLayout(spec())).toEqual({ pageSetup })
	})

	// Perabot tingkat dokumen tidak punya pembaca di sisi editor; menyimpannya
	// di sana hanya membuat basis data terlihat benar sementara headernya
	// tidak pernah muncul.
	test('tidak membawa perabot halaman', () => {
		expect(templateDocumentLayout(spec({ furniture }))).toEqual({ pageSetup })
	})

	// Tipografi sebaliknya: ia punya pembaca di tingkat dokumen, dan dulu
	// berhenti di sini - tercatat di katalog tapi tidak pernah sampai ke editor.
	test('membawa tipografi', () => {
		expect(templateDocumentLayout(spec({ typography }))).toEqual({ pageSetup, typography })
	})
})

describe('tata letak tab', () => {
	test('perabot halaman turun ke tab', () => {
		expect(templateTabLayout(spec({ furniture }))).toEqual({ furniture })
	})

	test('template tanpa perabot tidak meninggalkan penimpa kosong', () => {
		expect(templateTabLayout(spec())).toBeNull()
	})
})

describe('katalog bawaan', () => {
	test('setiap template berperabot menghasilkan penimpa tab', () => {
		const berperabot = BUILTIN_TEMPLATES.filter((template) => template.spec.layout.furniture)
		expect(berperabot.length).toBeGreaterThan(0)

		for (const template of berperabot) {
			expect(templateTabLayout(template.spec), `${template.slug} tanpa penimpa tab`).not.toBeNull()
		}
	})
})

describe('tipografi katalog bawaan', () => {
	// Penjaga bagi kekeliruan yang sudah pernah terjadi: `baseFont` dan
	// `lineHeight` terisi rapi di seluruh katalog, tapi tidak ada satu pun
	// pembacanya, jadi tiap dokumen tetap lahir memakai rupa bawaan editor.
	test('setiap template menyebutkan tipografinya', () => {
		for (const template of BUILTIN_TEMPLATES) {
			expect(template.spec.layout.typography, `${template.slug} tanpa tipografi`).toBeDefined()
		}
	})

	test('tipografi selalu ikut ke tata letak dokumen', () => {
		for (const template of BUILTIN_TEMPLATES) {
			const layout = templateDocumentLayout(template.spec)
			expect(layout.typography, `${template.slug} kehilangan tipografi`).toEqual(
				template.spec.layout.typography,
			)
		}
	})

	// Judul BAB skripsi sebesar badan naskah dan rata tengah - bukan tangga
	// judul ala web yang membuatnya tampil ~24pt.
	test('judul karya ilmiah Indonesia tetap 12pt dan rata tengah', () => {
		const akademik = BUILTIN_TEMPLATES.filter((template) => template.category === 'academic_id')
		expect(akademik.length).toBeGreaterThan(0)

		for (const template of akademik) {
			const spec = template.spec.layout.typography
			if (!spec) throw new Error(`${template.slug} tanpa tipografi`)

			const judul = resolveHeadingStyle(spec, 1)
			expect(judul.sizePt, `${template.slug} judul BAB`).toBe(12)
			expect(judul.align, `${template.slug} perataan judul BAB`).toBe('center')
			expect(spec.baseFont.sizePt, `${template.slug} badan naskah`).toBe(12)
		}
	})

	// Kebalikannya: flyer dan poster memang harus berjudul besar.
	test('cetakan marketing tetap berjudul besar', () => {
		const marketing = BUILTIN_TEMPLATES.filter((template) => template.category === 'marketing')

		const berjudulBesar = marketing.filter((template) => {
			const spec = template.spec.layout.typography
			return spec ? resolveHeadingStyle(spec, 1).sizePt >= 24 : false
		})
		expect(berjudulBesar.length).toBeGreaterThan(0)
	})
})

describe('hentian halaman per bab', () => {
	function typographyOf(slug: string): DocumentTypography {
		const template = BUILTIN_TEMPLATES.find((item) => item.slug === slug)
		const typography = template?.spec.layout.typography
		if (!typography) throw new Error(`${slug} tanpa tipografi`)
		return typography
	}

	// Di karya ilmiah yang tingkat 1 bukan cuma BAB - Abstrak, Daftar Isi, dan
	// Daftar Pustaka juga - dan semuanya memang berhalaman sendiri.
	test('karya ilmiah membuka lembar baru di tiap judul tingkat 1', () => {
		const akademik = BUILTIN_TEMPLATES.filter((template) => template.category === 'academic_id')
		expect(akademik.length).toBeGreaterThan(0)

		for (const template of akademik) {
			const typography = typographyOf(template.slug)
			expect(headingBreakLevels(typography), `${template.slug}`).toEqual([1])
			expect(resolveHeadingStyle(typography, 2).pageBreakBefore, `${template.slug} subbab`).toBe(false)
		}
	})

	// Laporan panjang ikut; memo, surat, notulen, dan CV tidak - memecah CV per
	// bagian mengubah dua halaman menjadi enam.
	test('hanya template bisnis berbentuk laporan yang ikut', () => {
		const laporan = ['proposal-proyek', 'laporan-bulanan', 'laporan-kuartalan', 'sop', 'rencana-bisnis']
		for (const slug of laporan) {
			expect(headingBreakLevels(typographyOf(slug)), slug).toEqual([1])
		}

		const menyambung = ['notulen-rapat', 'memo-internal', 'surat-resmi', 'surat-lamaran-kerja', 'cv-ats']
		for (const slug of menyambung) {
			expect(headingBreakLevels(typographyOf(slug)), slug).toEqual([])
		}
	})

	// Paper dua kolom mengalir menerus; halaman baru tiap bagian merusaknya.
	test('paper dan cetakan marketing tidak ikut', () => {
		const lain = BUILTIN_TEMPLATES.filter(
			(template) => template.category === 'paper' || template.category === 'marketing',
		)
		for (const template of lain) {
			expect(headingBreakLevels(typographyOf(template.slug)), template.slug).toEqual([])
		}
	})

	test('dokumen tanpa aturan itu tidak memecah apa pun', () => {
		const polos: DocumentTypography = {
			baseFont: { family: 'serif', sizePt: 11 },
			lineHeight: 1.5,
		}
		expect(headingBreakLevels(polos)).toEqual([])
	})
})

/* Surat lamaran (uji UC7 28 Sep): blok-blok surat sempat melebur jadi satu kalimat. */
describe('surat lamaran kerja', () => {
	const surat = BUILTIN_TEMPLATES.find((template) => template.slug === 'surat-lamaran-kerja')
	const blocks = surat ? compileTemplateContent(surat).content : []
	const types = (node: { content?: { type: string }[] }) => (node.content ?? []).map((child) => child.type)

	test('blok tujuan dan tanda tangan satu paragraf dengan pindah baris', () => {
		const tujuan = blocks.find((node) => JSON.stringify(node).includes('Kepada Yth.'))
		expect(types(tujuan ?? {}).filter((type) => type === 'hardBreak')).toHaveLength(3)
		const ttd = blocks.at(-1)
		expect(JSON.stringify(ttd)).toContain('Hormat saya,')
		expect(types(ttd ?? {}).filter((type) => type === 'hardBreak').length).toBeGreaterThanOrEqual(3)
	})

	test('blok data: enam baris, satu tab per baris, tab stop muat untuk label terpanjang', () => {
		const data = blocks.find((node) => node.attrs?.tabStops)
		expect(types(data ?? {}).filter((type) => type === 'tab')).toHaveLength(6)
		// "Tempat, Tanggal Lahir" dalam Times 12 pt ±115 pt: tab stop di bawah itu melompat ke kelipatan berikutnya.
		const stops = (data?.attrs?.tabStops ?? []) as { posPt: number }[]
		expect(stops[0]?.posPt ?? 0).toBeGreaterThanOrEqual(130)
	})
})

describe('template desain satu halaman', () => {
	test('flyer dan poster meminta desain disisipkan sebagai tulisan pertama (UC5)', () => {
		for (const slug of ['flyer-a4', 'flyer-a5', 'poster-a3']) {
			const rules = BUILTIN_TEMPLATES.find((template) => template.slug === slug)?.spec.aiRules ?? []
			expect(rules.some((rule) => rule.includes('very first edit'))).toBe(true)
		}
	})
})
