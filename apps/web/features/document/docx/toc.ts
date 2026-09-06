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
import type { DocxStyles } from './properties'
import { attr, descend, descendAll, tagName, val } from './xml'

/** Pengaman: field TOC tanpa penutup tidak boleh menelan seluruh dokumen. */
export const MAX_SWALLOWED = 500

/** Instruksi field `TOC` yang sedang terbuka pada rangkaian paragraf. */
export interface TocField {
	kind: TocListKind
	maxLevel?: number
}

/** Awalan teks judul yang menandai caption - sinyal jenis daftar (V5). */
const FIGURE_CAPTION = /^\s*(?:gambar|figure|fig\.|gbr\.?)/i
const TABLE_CAPTION = /^\s*(?:tabel|table|tbl\.)/i

/*
 * Kalimat penanda field TOC yang belum pernah di-update (§6.3): hasil
 * tersimpannya (antara `separate` dan `end`) berisi kalimat perintah, bukan
 * entri. Google Docs menulis versi Indonesianya saat menolak mengembangkan
 * field; Word menulis versi Inggrisnya pada TOC segar tanpa entri.
 */
const STALE_TOC_HINT =
	/(klik kanan|right-click|update field|no table of contents entries|tidak ada entri daftar isi)/i

export function isStaleTocStoredText(text: string): boolean {
	const trimmed = text.trim()
	return trimmed.length === 0 || STALE_TOC_HINT.test(trimmed)
}

function elementTextOf(element: Element): string {
	let text = ''
	for (const node of descendAll(element, 't')) text += node.textContent ?? ''
	return text
}

/*
 * Contoh teks paragraf per nama style (V5).
 *
 * Field `TOC \t "Gaya,tingkat"` membangun daftar dari gaya bernama, dan jenis
 * daftarnya - gambar atau tabel - tidak ada di instruksinya; yang tahu hanya
 * isi paragraf bergaya itu. `\t` memakai NAMA style (`w:name`) sementara
 * paragraf menyimpan ID (`w:pStyle`), jadi keduanya dijembatani lewat tabel
 * gaya. Word tidak konsisten kapitalisasi namanya ("Heading 5" lawan
 * "heading 5"), cocoknya case-insensitive.
 */
export function styleTextSamplerOf(
	body: Element,
	styles: DocxStyles,
): (styleName: string) => string | undefined {
	const textsOfId = new Map<string, string>()
	for (const paragraph of descendAll(body, 'p')) {
		const styleId = val(descend(paragraph, 'pPr', 'pStyle'))
		if (!styleId) continue
		const current = textsOfId.get(styleId)
		if (current !== undefined && current.length >= 80) continue
		textsOfId.set(styleId, `${current ?? ''} ${elementTextOf(paragraph)}`)
	}

	const idOfName = new Map<string, string>()
	for (const definition of styles.byId.values()) {
		const key = definition.name.trim().toLowerCase()
		if (!idOfName.has(key)) idOfName.set(key, definition.id)
	}

	return (styleName) => {
		const id = idOfName.get(styleName.trim().toLowerCase())
		return id === undefined ? undefined : textsOfId.get(id)
	}
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
export function tocFieldOf(
	paragraph: Element,
	sampleOf?: (styleName: string) => string | undefined,
): (TocField & { depth: number }) | null {
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

	let kind: TocListKind = /\\c\s+"?(gambar|figure)/i.test(instr)
		? 'gambar'
		: /\\c\s+"?(tabel|table)/i.test(instr)
			? 'tabel'
			: 'isi'

	let maxLevel: number | undefined
	const outline = /\\o\s+"?(\d+)-(\d+)"?/.exec(instr)
	if (outline)
		maxLevel = Math.max(Number.parseInt(outline[1] as string, 10), Number.parseInt(outline[2] as string, 10))
	const styled = /\\t\s+"([^"]+)"/.exec(instr)
	/*
	 * V5: daftar bergaya (`\t`) tidak membawa jenisnya di instruksi. Contoh
	 * teks judul pada gaya yang dirujuk yang membedakan daftar gambar/tabel
	 * dari daftar isi - sinyalnya ada di dokumen, bukan tebakan.
	 */
	if (kind === 'isi' && styled && sampleOf) {
		const parts = (styled[1] as string).split(',')
		for (let index = 0; index < parts.length; index += 2) {
			const sample = sampleOf(parts[index] as string)
			if (sample === undefined) continue
			if (FIGURE_CAPTION.test(sample)) {
				kind = 'gambar'
				break
			}
			if (TABLE_CAPTION.test(sample)) {
				kind = 'tabel'
				break
			}
		}
	}
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
	/*
	 * Angka pada `\\o`/`\\t` adalah tingkat TAMPILAN daftar milik Word, bukan
	 * tingkat judul Writer Hub - `"Heading 5,1"` berarti gaya Heading 5 tampil
	 * di lekukan tingkat 1. Untuk daftar gambar/tabel entrinya caption, yang
	 * di Writer Hub hidup di tingkat 7-9 (ekspor menulisnya sebagai Heading 6
	 * + outline), jadi rentang tampilannya tidak berlaku dan dipakai rentang
	 * caption saja; selebihnya seperti biasa.
	 */
	const caption = field.kind !== 'isi'
	return {
		type: TOC_BLOCK,
		attrs: {
			listKind: field.kind,
			...(caption
				? { minLevel: 7, maxLevel: 9 }
				: field.maxLevel
					? { maxLevel: Math.min(9, field.maxLevel), minLevel: 1 }
					: {}),
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
