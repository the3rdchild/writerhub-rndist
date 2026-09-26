/**
 * Semaian pertama brief dari template yang melahirkan dokumennya.
 *
 * Isian yang diketik penulis di galeri (judul, bidang, metode) masuk sebagai
 * miliknya - ia sendiri yang menulisnya. Yang datang dari spesifikasi template
 * (jenis karya, aturan format) ditandai `template`: penulis boleh mengubahnya,
 * dan tanda itu yang memberi tahu dari mana angkanya.
 *
 * Hanya template akademik dan makalah yang menyemai. Brief adalah konteks
 * penelitian; menyemai aturan format ke brosur hanya membuat AI menanyakan
 * pendekatan penelitian kepada pembuat brosur.
 */

import {
	BRIEF_LIMITS,
	type BriefEntry,
	type BriefKey,
	type CitationStyle,
	type DocumentMetadata,
	type HeadingScheme,
	PAGE_SIZES,
	type PageSizeId,
	type ResearchBrief,
	type TemplateSummary,
} from '@writer-hub/shared'
import { fontLabelOf, pxToCm } from './format-apply'

const WORK_TYPE_BY_SLUG: Record<string, string> = {
	'skripsi-s1': 'Skripsi',
	'tesis-s2': 'Tesis',
	'disertasi-s3': 'Disertasi',
	'proposal-penelitian': 'Proposal penelitian',
	'makalah-kuliah': 'Makalah',
	'artikel-jurnal-nasional': 'Artikel jurnal',
	'laporan-kerja-praktik': 'Laporan kerja praktik',
	'laporan-praktikum': 'Laporan praktikum',
	'unpad-ta1-elektro': 'Proposal tugas akhir',
	'ieee-conference': 'Makalah konferensi',
	'acm-sigconf': 'Makalah konferensi',
	'extended-abstract': 'Abstrak diperluas',
}

const CITATION_LABEL: Partial<Record<CitationStyle, string>> = {
	apa7: 'APA 7',
	ieee: 'IEEE',
	acm: 'ACM',
	vancouver: 'Vancouver',
}

const HEADING_LABEL: Record<HeadingScheme, string> = {
	'bab-romawi': 'BAB I, 1.1, 1.1.1',
	decimal: '1, 1.1, 1.1.1',
	'roman-section': 'I, A, 1',
	plain: 'Tanpa nomor',
}

const PAPER_LABEL: Partial<Record<PageSizeId, string>> = {
	a4: 'A4',
	folio: 'F4 / Folio',
	letter: 'Letter',
}

const SEEDING_CATEGORIES = new Set(['academic_id', 'paper'])

export function templateSeedsBrief(template: Pick<TemplateSummary, 'category'>): boolean {
	return SEEDING_CATEGORIES.has(template.category)
}

const cmText = (px: number): string => String(Math.round(pxToCm(px) * 10) / 10)

/**
 * Brief sesudah disemai, atau `null` bila tidak ada yang perlu berubah.
 * Isian yang sudah bernilai tidak pernah ditimpa: semaian mengisi yang kosong
 * saja, sekali, lalu menandai dirinya lewat `seededFrom`.
 */
export function seedBriefFromTemplate(
	brief: ResearchBrief,
	template: Pick<TemplateSummary, 'slug' | 'name' | 'category' | 'spec'>,
	metadata: DocumentMetadata | null,
	now: number,
): ResearchBrief | null {
	if (!templateSeedsBrief(template) || brief.seededFrom === template.slug) return null

	const entries = { ...brief.entries }
	const fill = (key: BriefKey, value: string | undefined, source: BriefEntry['source']) => {
		const text = value?.trim().slice(0, BRIEF_LIMITS.value)
		if (!text || entries[key]) return
		entries[key] = { value: text, source, at: now }
	}

	for (const field of template.spec.metadataFields ?? []) {
		if (field.briefKey) fill(field.briefKey, metadata?.[field.key], 'user')
	}

	const { spec } = template
	fill('jenisKarya', WORK_TYPE_BY_SLUG[template.slug], 'template')
	fill('pedoman', template.name, 'template')
	fill('sitasi', CITATION_LABEL[spec.format.citationStyle], 'template')
	fill('penomoranBab', HEADING_LABEL[spec.format.headingScheme], 'template')
	fill('bahasa', spec.format.language === 'en' ? 'Inggris' : 'Indonesia', 'template')
	if (spec.format.abstractWords) {
		fill('panjangAbstrak', `${spec.format.abstractWords[0]}-${spec.format.abstractWords[1]} kata`, 'template')
	}

	const { pageSetup, typography } = spec.layout
	fill('kertas', PAPER_LABEL[pageSetup.size] ?? PAGE_SIZES[pageSetup.size].label, 'template')
	fill('marginKiri', cmText(pageSetup.margins.left), 'template')
	fill('marginAtas', cmText(pageSetup.margins.top), 'template')
	fill('marginKanan', cmText(pageSetup.margins.right), 'template')
	fill('marginBawah', cmText(pageSetup.margins.bottom), 'template')
	if (typography) {
		fill('font', fontLabelOf(typography.baseFont.family), 'template')
		fill('ukuranFont', String(typography.baseFont.sizePt), 'template')
		fill('spasi', String(typography.lineHeight), 'template')
	}

	return { ...brief, entries, seededFrom: template.slug }
}
