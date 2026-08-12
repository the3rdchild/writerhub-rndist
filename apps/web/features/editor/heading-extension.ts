import Heading from '@tiptap/extension-heading'
import { mergeAttributes } from '@tiptap/core'

/**
 * Heading sampai 9 tingkat (PRD EDITOR-AI-UPGRADE §A4).
 *
 * HTML hanya punya `<h1>`–`<h6>`, jadi tingkat 7–9 dirender sebagai
 * `<div class="heading" role="heading" aria-level data-level>` - tetap dibaca
 * pembaca layar sebagai judul dan tetap satu tangga gaya di bawah tingkat
 * sebelumnya (lihat globals.css).
 *
 * Markdown tidak mengenal lebih dari enam tingkat, jadi ekspornya menurunkan
 * 7–9 ke `######` (teks utuh); impor tetap `#{1,6}`.
 */

/** Tingkat yang didukung skema ini. */
export const HEADING_LEVELS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const

/** Batas tingkat yang tampil di toolbar/menu Format (Judul 1–5). */
export const VISIBLE_HEADING_LEVELS = [1, 2, 3, 4, 5] as const

/** Apakah tingkat dirender sebagai tag HTML native (h1–h6). */
function isNativeLevel(level: number): boolean {
	return level >= 1 && level <= 6
}

export const HeadingLevels = Heading.extend({
	addOptions() {
		return {
			// Tipe resmi `Level` hanya 1–6; skema kita menerima 9, jadi dilewati
			// pemeriksa tipe - tingkat 7–9 tetap diverifikasi di render/parse.
			levels: HEADING_LEVELS as unknown as 1[],
			HTMLAttributes: {},
		}
	},

	parseHTML() {
		const native = [1, 2, 3, 4, 5, 6].map((level) => ({
			tag: `h${level}`,
			attrs: { level },
		}))
		// Tingkat 7–9 dipulihkan dari div.heading[data-level] (hasil render kita).
		const extended = [7, 8, 9].map((level) => ({
			tag: `div.heading[data-level="${level}"]`,
			attrs: { level },
		}))
		return [...native, ...extended]
	},

	renderHTML({ node, HTMLAttributes }) {
		const level = (node.attrs.level as number) ?? 1
		if (isNativeLevel(level)) {
			return [`h${level}`, mergeAttributes(this.options.HTMLAttributes, HTMLAttributes), 0]
		}
		// 7–9: div berperan heading supaya aksesibilitas tetap utuh.
		return [
			'div',
			mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
				class: 'heading',
				role: 'heading',
				'aria-level': String(level),
				'data-level': String(level),
			}),
			0,
		]
	},

	// Markdown tidak punya penanda di atas 6 tingkat - turunkan 7–9 ke ######.
	renderMarkdown: (node, h) => {
		const level = node.attrs?.level ? parseInt(node.attrs.level, 10) : 1
		const clamped = Math.min(6, Math.max(1, level))
		const headingChars = '#'.repeat(clamped)
		if (!node.content) return ''
		return `${headingChars} ${h.renderChildren(node.content)}`
	},
})

export default HeadingLevels
