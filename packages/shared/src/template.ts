/**
 * Kontrak template dokumen: satu definisi yang dibaca dua pihak sekaligus -
 * manusia lewat galeri `/new`, dan AI lewat `aiRules` yang disuntik ke system
 * prompt. Rancangan lengkapnya ada di `docs/TEMPLATE-GALLERY-PLAN.md`.
 */

import type { PageFurniture, PageSetup } from './layout'

export type TemplateCategory = 'academic_id' | 'paper' | 'business' | 'marketing'

export type TemplateLocale = 'id' | 'en'

export type CitationStyle = 'apa7' | 'ieee' | 'acm' | 'vancouver' | 'none'

/**
 * Penomoran judul: "BAB I" (bab-romawi), "1.1" (decimal), "I."
 * (roman-section), atau tanpa nomor.
 */
export type HeadingScheme = 'bab-romawi' | 'decimal' | 'roman-section' | 'plain'

export interface TemplateStructureItem {
	heading: string
	level: number
	/** Dipakai pemeriksa kepatuhan format. */
	required: boolean
	hint?: string
}

export interface TemplateSpec {
	layout: {
		pageSetup: PageSetup
		furniture?: PageFurniture
		/** Kolom untuk seluruh badan naskah; diterapkan lewat section break. */
		columns?: { count: number; gap?: number }
		baseFont?: { family: string; sizePt: number }
		lineHeight?: number
	}
	format: {
		citationStyle: CitationStyle
		headingScheme: HeadingScheme
		/** Rentang jumlah kata abstrak, mis. [150, 250]. */
		abstractWords?: [number, number]
		language: TemplateLocale
	}
	/** Bagian yang membentuk kerangka, urut seperti di dokumen. */
	structure: TemplateStructureItem[]
	/** Instruksi bahasa Inggris yang disuntik ke system prompt AI Chat. */
	aiRules: string[]
	/** Catatan jujur untuk kartu galeri: bagian format yang belum otomatis. */
	caveats?: string[]
}

/**
 * Bentuk template di kawat, sama untuk daftar katalog maupun pengambilan per
 * slug. `content` selalu ikut: pratinjau kartu galeri dirender darinya, jadi
 * memisahkannya hanya akan menambah satu panggilan per kartu.
 */
export interface TemplateSummary {
	slug: string
	name: string
	description: string
	category: TemplateCategory
	locale: TemplateLocale
	spec: TemplateSpec
	builtin: boolean
	/** Kerangka ProseMirror hasil kompilasi Markdown. */
	content: Record<string, unknown>
}
