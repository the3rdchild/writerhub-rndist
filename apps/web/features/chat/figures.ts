import type { Node as PMNode } from '@tiptap/pm/model'
import type { Transaction } from '@tiptap/pm/state'
import { HTML_BLOCK } from '@/features/editor/html-block'

/**
 * Gambar di naskah - diagram, gambar biasa, blok rancangan HTML - di mata AI.
 *
 * Diagram tersimpan sebagai blok kode berisi SVG, dan dulu alat baca
 * mengirim SVG itu apa adanya. Uji use case 27 Sep memperlihatkan akibatnya:
 * model melihat dua ratus baris `<rect …>` di tengah bab, menyimpulkan
 * diagramnya "masih berupa kode", lalu mengubahnya menjadi blok HTML, menyalin
 * markup-nya ke paragraf keterangan, atau membuangnya saat meringkas bab. Di
 * UC1, UC2, dan UC8 tidak satu pun gambar sampai ke DOCX.
 *
 * Maka bagi model, gambar adalah satu baris `[Figure: diagram "Judul"]`. Baris
 * itu juga pegangannya saat menulis: `write_section` dan `replace_text`
 * menaruh gambarnya di tempat baris itu, dan gambar yang barisnya tidak
 * ditulis tetap disimpan di akhir bagian. Suntingan teks tidak pernah
 * menghapus gambar diam-diam; menghapus harus disebut dengan
 * `[Delete figure: …]`.
 */

export interface Figure {
	kind: 'diagram' | 'mermaid diagram' | 'design' | 'full-page design' | 'image'
	title: string
}

const SVG_TITLE = /<title\b[^>]*>([\s\S]*?)<\/title\s*>/i
const HTML_TITLE = /<(title|h[1-3])\b[^>]*>([\s\S]*?)<\/\1\s*>/i
const MERMAID_TITLE = /^\s*title:?\s+(.+)$/im
const MAX_TITLE = 60

/** Teks polos satu baris, aman di dalam tanda kutip baris gambar. */
function titleText(markup: string): string {
	const text = markup
		.replace(/<[^>]*>/g, ' ')
		.replace(/&[a-z0-9#]+;/gi, ' ')
		.replace(/["\]]/g, "'")
		.replace(/\s+/g, ' ')
		.trim()
	return text.length > MAX_TITLE ? `${text.slice(0, MAX_TITLE - 1)}…` : text
}

/** Blok ini gambar, bukan teks; null untuk blok biasa. */
export function figureOf(node: PMNode): Figure | null {
	switch (node.type.name) {
		case 'codeBlock': {
			const language = String(node.attrs.language ?? '')
			if (language === 'diagram') {
				return { kind: 'diagram', title: titleText(SVG_TITLE.exec(node.textContent)?.[1] ?? '') }
			}
			if (language === 'mermaid') {
				return { kind: 'mermaid diagram', title: titleText(MERMAID_TITLE.exec(node.textContent)?.[1] ?? '') }
			}
			return null
		}
		case HTML_BLOCK:
			return {
				kind: node.attrs.fit === 'page' ? 'full-page design' : 'design',
				title: titleText(HTML_TITLE.exec(String(node.attrs.html ?? ''))?.[2] ?? ''),
			}
		case 'image':
			return { kind: 'image', title: titleText(String(node.attrs.alt || node.attrs.title || '')) }
		default:
			return null
	}
}

export function figureLine(figure: Figure): string {
	return `[Figure: ${figure.kind}${figure.title ? ` "${figure.title}"` : ''}]`
}

/**
 * Teks rentang dokumen seperti `textBetween(from, to, '\n', ' ')`, dengan
 * gambar sebagai satu baris - atau dilewati sama sekali untuk menghitung kata.
 */
export function readableText(
	doc: PMNode,
	from = 0,
	to = doc.content.size,
	figures: 'line' | 'omit' = 'line',
): string {
	let text = ''
	let first = true
	const separate = () => {
		if (first) first = false
		else text += '\n'
	}
	doc.nodesBetween(from, to, (node, pos) => {
		const figure = figureOf(node)
		if (figure) {
			if (figures === 'line') {
				separate()
				text += figureLine(figure)
			}
			return false
		}
		const nodeText = node.isText
			? (node.text ?? '').slice(Math.max(from, pos) - pos, to - pos)
			: node.isLeaf
				? ' '
				: ''
		if (node.isBlock && (node.isTextblock || (node.isLeaf && nodeText))) separate()
		text += nodeText
		return true
	})
	return text
}

interface FigureRequest {
	remove: boolean
	kind: string
	title: string
}

const FIGURE_LINE = /^\s*\[(delete\s+)?figure:\s*([^"\]]*?)\s*(?:"([^"\]]*)")?\s*\]\s*$/i

export function parseFigureLine(line: string): FigureRequest | null {
	const match = FIGURE_LINE.exec(line)
	if (!match) return null
	return { remove: Boolean(match[1]), kind: match[2].trim(), title: (match[3] ?? '').trim() }
}

interface PlacedFigure {
	node: PMNode
	pos: number
	figure: Figure
}

/** Gambar yang seluruhnya berada di dalam rentang, termasuk yang di dalam tabel atau kolom. */
export function figuresBetween(doc: PMNode, from: number, to: number): PlacedFigure[] {
	const found: PlacedFigure[] = []
	doc.nodesBetween(from, to, (node, pos) => {
		const figure = figureOf(node)
		if (!figure) return true
		if (pos >= from && pos + node.nodeSize <= to) found.push({ node, pos, figure })
		return false
	})
	return found
}

/** Posisi ini ada di dalam teks sebuah gambar - di dalam sumber SVG diagram. */
export function insideFigure(doc: PMNode, pos: number): boolean {
	const $pos = doc.resolve(pos)
	for (let depth = $pos.depth; depth > 0; depth -= 1) {
		if (figureOf($pos.node(depth))) return true
	}
	return false
}

const same = (a: string, b: string) =>
	a.trim().toLowerCase().replace(/\s+/g, ' ') === b.trim().toLowerCase().replace(/\s+/g, ' ')

/** Gambar mana yang dimaksud satu baris: judul yang sama dulu, lalu urutan jenisnya. */
function matchFigure(
	inside: readonly PlacedFigure[],
	used: ReadonlySet<number>,
	asked: FigureRequest,
): number {
	const free = inside.map((_, index) => index).filter((index) => !used.has(index))
	const kindFits = (index: number) => !asked.kind || same(inside[index].figure.kind, asked.kind)
	if (asked.title) {
		const titled = free.find((index) => kindFits(index) && same(inside[index].figure.title, asked.title))
		if (titled !== undefined) return titled
	}
	return free.find(kindFits) ?? -1
}

export interface FigureSlot {
	marker: string
	node: PMNode
}

export interface FigurePlan {
	/** Markdown dengan penanda di tempat gambar yang dipertahankan. */
	markdown: string
	slots: FigureSlot[]
	/** Gambar yang dihapus atas permintaan `[Delete figure: …]`. */
	removed: number
	/** Baris gambar yang tidak menunjuk gambar mana pun di rentang ini - dibuang. */
	ignored: number
	/** Gambar yang barisnya tidak ditulis, disimpan di akhir. */
	appended: number
}

/** Paragraf pengganti sementara; dipakai lalu ditukar `placeFigures`. */
export function figureMarker(index: number): string {
	return `⟦wh-figure-${index}⟧`
}

/**
 * Menyiapkan penggantian rentang `from`-`to` dengan Markdown ini tanpa
 * kehilangan gambar di dalamnya.
 *
 * Baris gambar di Markdown menjadi penanda paragraf tersendiri; gambar yang
 * tidak disebut ditambahkan di akhir. `counter` dibagi antar-suntingan dalam
 * satu transaksi supaya penandanya tidak bertabrakan.
 */
export function keepFigures(
	doc: PMNode,
	from: number,
	to: number,
	markdown: string,
	counter: { next: number } = { next: 0 },
): FigurePlan {
	const inside = figuresBetween(doc, from, to)
	const used = new Set<number>()
	const slots: FigureSlot[] = []
	let removed = 0
	let ignored = 0
	let fenced = false

	const slot = (node: PMNode) => {
		const marker = figureMarker(counter.next)
		counter.next += 1
		slots.push({ marker, node })
		return `\n${marker}\n`
	}

	const lines = markdown
		.replace(/\r\n/g, '\n')
		.split('\n')
		.map((line) => {
			if (line.trim().startsWith('```')) fenced = !fenced
			if (fenced) return line
			const asked = parseFigureLine(line)
			if (!asked) return line
			const at = matchFigure(inside, used, asked)
			if (at === -1) {
				ignored += 1
				return ''
			}
			used.add(at)
			if (asked.remove) {
				removed += 1
				return ''
			}
			return slot(inside[at].node)
		})

	const rest = inside.filter((_, index) => !used.has(index))
	for (const figure of rest) lines.push(slot(figure.node))

	// Tanpa gambar, Markdown-nya tidak disentuh sama sekali: spasi di tepi
	// pengganti sebaris `replace_text` memang bagian dari suntingannya.
	const touched = slots.length > 0 || removed > 0 || ignored > 0
	return {
		markdown: touched
			? lines
					.join('\n')
					.replace(/\n{3,}/g, '\n\n')
					.trim()
			: markdown,
		slots,
		removed,
		ignored,
		appended: rest.length,
	}
}

/** Kalimat untuk hasil alat: apa yang terjadi pada gambar di rentangnya. */
export function figureNote(plans: readonly FigurePlan[]): string {
	const total = (key: 'removed' | 'ignored' | 'appended') => plans.reduce((sum, plan) => sum + plan[key], 0)
	const notes = [
		total('appended') > 0 &&
			`kept ${total('appended')} figure(s) you did not place at the end of the passage - repeat a [Figure: …] line where a figure belongs`,
		total('removed') > 0 && `deleted ${total('removed')} figure(s)`,
		total('ignored') > 0 &&
			`ignored ${total('ignored')} [Figure: …] line(s) that name no figure in this passage - figures cannot be copied or moved between sections`,
	].filter(Boolean)
	return notes.length > 0 ? ` Figures: ${notes.join('; ')}.` : ''
}

/**
 * Menukar penanda dengan gambarnya, sesudah Markdown diterapkan.
 *
 * Penanda yang ditulis di paragrafnya sendiri diganti utuh. Penanda yang
 * tertempel di paragraf lain - Markdown tanpa baris kosong - dihapus dari
 * teksnya dan gambarnya berdiri sesudah paragraf itu.
 */
export function placeFigures(tr: Transaction, slots: readonly FigureSlot[]): void {
	if (slots.length === 0) return
	const hits: { pos: number; node: PMNode; block: PMNode; blockPos: number; marker: string }[] = []
	tr.doc.descendants((node, pos) => {
		if (!node.isText) return true
		for (const slot of slots) {
			const at = (node.text ?? '').indexOf(slot.marker)
			if (at === -1) continue
			const $pos = tr.doc.resolve(pos + at)
			hits.push({
				pos: pos + at,
				node: slot.node,
				block: $pos.parent,
				blockPos: $pos.before(),
				marker: slot.marker,
			})
		}
		return false
	})

	// Dari belakang: menukar satu penanda tidak menggeser posisi yang di depannya.
	for (const hit of hits.sort((a, b) => b.pos - a.pos)) {
		const blockEnd = hit.blockPos + hit.block.nodeSize
		if (hit.block.textContent.trim() === hit.marker) {
			tr.replaceWith(hit.blockPos, blockEnd, hit.node)
			continue
		}
		// Sisipan di belakang penanda lebih dulu, supaya posisi penandanya tetap.
		tr.insert(blockEnd, hit.node)
		tr.delete(hit.pos, hit.pos + hit.marker.length)
	}
}

const SVG_TAG =
	/<\/?(svg|g|rect|line|polyline|polygon|circle|ellipse|path|text|tspan|defs|lineargradient|marker)\b[^>]*>/gi

/**
 * Markup SVG di luar pagar kode: Markdown akan mencetaknya sebagai teks.
 * Contoh kode yang dipagari tetap boleh - naskah tutorial memang memuatnya.
 */
export function svgInProse(markdown: string): boolean {
	let fenced = false
	const prose = markdown
		.replace(/\r\n/g, '\n')
		.split('\n')
		.filter((line) => {
			if (line.trim().startsWith('```')) {
				fenced = !fenced
				return false
			}
			return !fenced
		})
		.join('\n')
		// Isi kode sebaris juga contoh, bukan gambar.
		.replace(/`[^`\n]*`/g, '')
	return /<svg[\s>]/i.test(prose) || (prose.match(SVG_TAG) ?? []).length >= 3
}

export const SVG_IN_PROSE =
	'Not carried out: the text holds SVG markup, which would print as code in the middle of the prose. A figure is not text: draw it with draw_diagram, change one with redraw_diagram, and keep an existing figure by writing its [Figure: …] line exactly as read_section shows it.'
