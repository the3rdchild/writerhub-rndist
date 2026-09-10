/**
 * Kontrak template dokumen: satu definisi yang dibaca dua pihak sekaligus -
 * manusia lewat galeri `/new`, dan AI lewat `aiRules` yang disuntik ke system
 * prompt. Rancangan lengkapnya ada di `docs/TEMPLATE-GALLERY-PLAN.md`.
 */

import type { PageFurniture, PageSetup } from './layout'
import type { DocumentTypography } from './typography'

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

/**
 * Satu isian metadata dokumen.
 *
 * `placeholder` adalah teks contoh PERSIS yang ada di kerangka template dan
 * akan digantikan nilainya saat dokumen lahir - mis. `Judul Skripsi` atau
 * `1234567890`. Pencocokan literal, bukan pola: template ditulis manusia dan
 * ditinjau di PR yang sama dengan kodenya, jadi teks yang dijanjikan di sini
 * bisa dipastikan benar-benar ada di sana - dan uji katalog yang memastikannya.
 */
export interface TemplateMetadataField {
	key: string
	label: string
	/**
	 * Teks contoh yang digantikan. Tanpa ini, isiannya tidak pernah menyentuh
	 * naskah - ia hanya menjelaskan dokumennya kepada AI (mis. metodologi, yang
	 * tidak punya tempat tetap di sampul).
	 */
	placeholder?: string
	/** `multiline` untuk abstrak dan sejenisnya; bawaannya satu baris. */
	kind?: 'text' | 'multiline'
	hint?: string
	/** Contoh nilai, ditampilkan sebagai placeholder kolom isian. */
	example?: string
}

/**
 * Metadata yang sudah diisi pengguna, per dokumen. Kuncinya `key` dari
 * `TemplateMetadataField`.
 *
 * Dua nyawa yang sengaja berbeda umurnya: ia mengisi sampul SEKALI saat
 * dokumen lahir, lalu hidup terus sebagai penjelasan untuk AI - templatenya
 * memberi tahu AI *bagaimana* menulis lewat `aiRules`, metadata memberi tahu
 * *tentang apa*.
 */
export type DocumentMetadata = Record<string, string>

export interface TemplateSpec {
	layout: {
		pageSetup: PageSetup
		furniture?: PageFurniture
		/** Kolom untuk seluruh badan naskah; diterapkan lewat section break. */
		columns?: { count: number; gap?: number }
		/**
		 * Rupa huruf badan dan tiap tingkat judul. Ikut tersimpan ke
		 * `documents.layout` lewat `templateDocumentLayout`, jadi dokumen yang
		 * lahir dari template ini benar-benar tampil dengan format itu - bukan
		 * sekadar mencatatnya.
		 */
		typography?: DocumentTypography
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
	/**
	 * Isian yang ditawarkan sebelum dokumen dibuat. Template tanpa ini tidak
	 * menampilkan tombol metadata sama sekali.
	 */
	metadataFields?: TemplateMetadataField[]
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
	/** Kerangka ProseMirror hasil kompilasi Markdown. */
	content: Record<string, unknown>
}
