import type { TemplateCategory, TemplateLocale, TemplateSpec } from '@writer-hub/shared'

/**
 * Definisi template bawaan, ditulis sebagai kode supaya aturan format ikut
 * ter-review dalam PR yang sama dengan kodenya (`docs/TEMPLATE-GALLERY-PLAN.md`
 * §2). Baris tabelnya hanyalah salinan hasil kompilasi - sumber kebenarannya
 * di sini.
 */
export interface BuiltinTemplateDefinition {
	slug: string
	name: string
	/** Satu kalimat untuk kartu galeri. */
	description: string
	category: TemplateCategory
	locale: TemplateLocale
	/** Urutan di dalam kategorinya. */
	position: number
	/** Kerangka dalam Markdown; dikompilasi `compileTemplateContent`. */
	markdown: string
	spec: TemplateSpec
	/**
	 * Untuk template berkolom: teks heading persis tempat badan berkolom
	 * dimulai (section break disisipkan tepat sebelumnya). Tanpa ini, seluruh
	 * dokumen menjadi satu section berkolom.
	 */
	columnsBeforeHeading?: string
}
