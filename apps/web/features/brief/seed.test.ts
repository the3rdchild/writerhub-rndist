import { describe, expect, test } from 'bun:test'
import { EMPTY_BRIEF, type ResearchBrief, type TemplateSummary } from '@writer-hub/shared'
import { seedBriefFromTemplate } from './seed'

const skripsi = {
	slug: 'skripsi-s1',
	name: 'Skripsi S1',
	category: 'academic_id',
	spec: {
		layout: {
			pageSetup: {
				size: 'a4',
				orientation: 'portrait',
				margins: { top: 113, right: 113, bottom: 113, left: 151 },
				pageColor: null,
				pageless: false,
			},
			typography: { baseFont: { family: '"Times New Roman", Times, serif', sizePt: 12 }, lineHeight: 1.5 },
		},
		format: { citationStyle: 'apa7', headingScheme: 'bab-romawi', abstractWords: [150, 250], language: 'id' },
		structure: [],
		aiRules: [],
		metadataFields: [
			{ key: 'judul', label: 'Judul', placeholder: 'Judul Skripsi', briefKey: 'judul' },
			{ key: 'nama', label: 'Nama', placeholder: 'Nama', personal: true },
			{ key: 'topik', label: 'Bidang', briefKey: 'bidang' },
		],
	},
} as Pick<TemplateSummary, 'slug' | 'name' | 'category' | 'spec'>

describe('semaian dari template', () => {
	test('isian galeri jadi milik penulis, spesifikasi template ditandai template', () => {
		const seeded = seedBriefFromTemplate(EMPTY_BRIEF, skripsi, { judul: 'Literasi', nama: 'Budi' }, 7)
		expect(seeded?.entries.judul).toEqual({ value: 'Literasi', source: 'user', at: 7 })
		expect(seeded?.entries.jenisKarya).toEqual({ value: 'Skripsi', source: 'template', at: 7 })
		expect(seeded?.entries).toMatchObject({
			sitasi: { value: 'APA 7' },
			kertas: { value: 'A4' },
			marginKiri: { value: '4' },
			marginAtas: { value: '3' },
			font: { value: 'Times New Roman' },
			ukuranFont: { value: '12' },
			spasi: { value: '1.5' },
			penomoranBab: { value: 'BAB I, 1.1, 1.1.1' },
			panjangAbstrak: { value: '150-250 kata' },
		})
		expect(seeded?.seededFrom).toBe('skripsi-s1')
	})

	test('data pribadi tidak pernah masuk brief', () => {
		const seeded = seedBriefFromTemplate(EMPTY_BRIEF, skripsi, { nama: 'Budi' }, 7)
		expect(JSON.stringify(seeded)).not.toContain('Budi')
	})

	test('isian yang sudah ada tidak ditimpa', () => {
		const brief: ResearchBrief = {
			...EMPTY_BRIEF,
			entries: { sitasi: { value: 'IEEE', source: 'user', at: 1 } },
		}
		expect(seedBriefFromTemplate(brief, skripsi, null, 7)?.entries.sitasi?.value).toBe('IEEE')
	})

	test('sekali saja - isian yang dikosongkan penulis tidak kembali', () => {
		const seeded = seedBriefFromTemplate(EMPTY_BRIEF, skripsi, null, 7) as ResearchBrief
		const cleared = { ...seeded, entries: {} }
		expect(seedBriefFromTemplate(cleared, skripsi, null, 8)).toBeNull()
	})

	test('template non-akademik tidak menyemai brief penelitian', () => {
		expect(seedBriefFromTemplate(EMPTY_BRIEF, { ...skripsi, category: 'marketing' }, null, 7)).toBeNull()
	})
})
