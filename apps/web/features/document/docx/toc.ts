/**
 * Daftar isi: field `TOC` milik Word maupun yang diketik tangan.
 *
 * Keduanya diganti satu node `TocBlock` yang menyusun entrinya sendiri.
 * Hasil field yang lama - judul, titik-titik, dan nomor halaman yang sudah
 * basi - dibuang, karena nomor halamannya tidak mungkin masih benar.
 */
import type { JSONContent } from '@tiptap/core'
import { TOC_BLOCK, type TocListKind } from '@/features/editor/toc-block'
import { textOfNode } from './content'
import { attr, descendAll, tagName } from './xml'

/** Pengaman: field TOC tanpa penutup tidak boleh menelan seluruh dokumen. */
export const MAX_SWALLOWED = 500

/** Instruksi field `TOC` yang sedang terbuka pada rangkaian paragraf. */
export interface TocField {
	kind: TocListKind
	maxLevel?: number
}

/**
 * Selisih pembuka dan penutup field pada satu elemen.
 *
 * Daftar isi bawaan Word memakai switch `\h`, dan tiap entrinya adalah field
 * `PAGEREF`/`HYPERLINK` tersendiri lengkap dengan `begin`…`end` sendiri.
 * Menganggap `end` mana pun sebagai penutup membuat field TOC tertutup di
 * entri pertama - sisanya bocor sebagai paragraf basi. Kedalamanlah yang
 * menentukan, bukan keberadaan penutup.
 */
export function fieldDepthDelta(element: Element): number {
	let delta = 0
	for (const node of descendAll(element)) {
		if (tagName(node) !== 'fldChar') continue
		const type = attr(node, 'fldCharType')
		if (type === 'begin') delta += 1
		else if (type === 'end') delta -= 1
	}
	return delta
}

/** Gabungan instruksi + kedalaman field yang masih terbuka di ujung paragraf. */
export function tocFieldOf(paragraph: Element): (TocField & { depth: number }) | null {
	// Instruksi dikumpulkan per field: paragraf pembuka bisa memuat field lain
	// sebelum TOC-nya, dan menggabungkan semuanya jadi satu untai membuat
	// pemeriksaan "diawali TOC" meleset.
	const segments: string[] = []
	for (const node of descendAll(paragraph)) {
		const name = tagName(node)
		if (name === 'fldChar' && attr(node, 'fldCharType') === 'begin') segments.push('')
		else if (name === 'instrText' && segments.length > 0) {
			segments[segments.length - 1] += node.textContent ?? ''
		}
	}

	const instr = segments.find((segment) => segment.trim().startsWith('TOC'))
	if (instr === undefined) return null

	const kind: TocListKind = /\\c\s+"?(gambar|figure)/i.test(instr)
		? 'gambar'
		: /\\c\s+"?(tabel|table)/i.test(instr)
			? 'tabel'
			: 'isi'

	let maxLevel: number | undefined
	const outline = /\\o\s+"?(\d+)-(\d+)"?/.exec(instr)
	if (outline)
		maxLevel = Math.max(Number.parseInt(outline[1] as string, 10), Number.parseInt(outline[2] as string, 10))
	const styled = /\\t\s+"([^"]+)"/.exec(instr)
	if (styled) {
		const levels = (styled[1] as string)
			.split(',')
			.map((part, index, all) =>
				index % 2 === 1 && all[index - 1] !== undefined ? Number.parseInt(part, 10) : 0,
			)
			.filter((value) => Number.isFinite(value))
		const deepest = Math.max(0, ...levels)
		maxLevel = Math.max(maxLevel ?? 0, deepest)
	}

	return { kind, ...(maxLevel ? { maxLevel } : {}), depth: fieldDepthDelta(paragraph) }
}

export function tocBlockOf(field: TocField): JSONContent {
	return {
		type: TOC_BLOCK,
		attrs: {
			listKind: field.kind,
			...(field.maxLevel ? { maxLevel: Math.min(9, field.maxLevel), minLevel: 1 } : {}),
		},
	}
}

/** Baris TOC manual: "Judul <tab> 12" — pola daftar isi yang diketik tangan. */
const MANUAL_TOC_LINE = /^\t?\S[^\t]*\t\s*\d{1,4}$/

/**
 * Rangkaian baris daftar isi manual (≥3 baris "teks — tab — nomor halaman")
 * diganti satu node daftar isi yang hidup; sisa tab di luar pola dibiarkan.
 */
export function replaceManualToc(blocks: JSONContent[]): JSONContent[] {
	const out: JSONContent[] = []
	let run: JSONContent[] = []

	const flush = (): void => {
		if (run.length >= 3) out.push({ type: TOC_BLOCK, attrs: { listKind: 'isi' } })
		else out.push(...run)
		run = []
	}

	for (const block of blocks) {
		if (block.type === 'paragraph' && !block.attrs?._list && MANUAL_TOC_LINE.test(textOfNode(block).trim())) {
			run.push(block)
			continue
		}
		flush()
		out.push(block)
	}
	flush()

	return out
}
