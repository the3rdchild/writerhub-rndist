import { DOMSerializer, type Node as PMNode } from '@tiptap/pm/model'
import type { EditorView } from '@tiptap/pm/view'
import { FOOTNOTE_REF, type FootnoteEntry, footnoteEntries, footnoteParagraph } from './footnote'

/*
 * Tata letak catatan kaki di kaki halaman (TKS-1). Paginator (`pagination.ts`)
 * memesan ruang di dasar tiap lembar seukuran catatan yang rujukannya jatuh di
 * lembar itu, lalu menggambar area catatannya di dalam spacer pemenggal
 * halaman - tepat di atas batas lembar. Di sini: ukuran tiap catatan
 * (diukur di luar naskah, selebar area isi), penempelan rujukan ke blok yang
 * diukur paginator, dan DOM area catatannya.
 */

export const FOOTNOTE_AREA_CLASS = 'footnote-area'

export interface FootnoteSizes {
	/** Tinggi tiap catatan, menurut posisi rujukannya. */
	heights: Map<number, number>
	/** Tinggi garis pemisah di atas catatan pertama sebuah lembar. */
	separator: number
}

export interface PageNotes {
	/** Posisi rujukan yang catatannya tampil di lembar ini, menurut urutan. */
	refs: number[]
	/** Tinggi area catatan. */
	height: number
	/** Jarak dari awal spacer sampai area catatan - mendorongnya ke dasar lembar. */
	before: number
	/** Tanda tangan isi catatannya (`notesSignature`). */
	signature?: string
}

/** Tinggi area catatan untuk sekumpulan rujukan; nol bila tidak ada catatan. */
export function notesHeight(refs: readonly number[], sizes: FootnoteSizes | undefined): number {
	if (!sizes || refs.length === 0) return 0
	let height = sizes.separator
	for (const ref of refs) height += sizes.heights.get(ref) ?? 0
	return height
}

/**
 * Rujukan → blok terukur yang memuatnya: blok terakhir yang posisinya tidak
 * melewati rujukan. Ukuran paginator urut menurut posisi dan menutupi
 * rentang yang bersambung (blok, anak kontainer, baris tabel), jadi itulah
 * blok yang memuatnya.
 */
export function assignFootnotes<T extends { pos: number; footnotes?: number[] }>(
	blocks: readonly T[],
	refs: readonly number[],
): void {
	let index = 0
	for (const ref of refs) {
		while (index + 1 < blocks.length && blocks[index + 1].pos <= ref) index += 1
		const block = blocks[index]
		if (!block || block.pos > ref) continue
		if (block.footnotes) block.footnotes.push(ref)
		else block.footnotes = [ref]
	}
}

export function footnoteRefPositions(doc: PMNode): number[] {
	const positions: number[] = []
	doc.descendants((node, pos) => {
		if (node.type.name === FOOTNOTE_REF) {
			positions.push(pos)
			return false
		}
		return true
	})
	return positions
}

function serializeEntry(doc: PMNode, entry: FootnoteEntry): HTMLElement {
	const item = document.createElement('div')
	item.className = 'footnote-item'
	if (entry.id) item.setAttribute('data-footnote-id', entry.id)
	item.setAttribute('data-footnote-pos', String(entry.pos))

	const number = document.createElement('span')
	number.className = 'footnote-number'
	number.textContent = String(entry.number)
	item.appendChild(number)

	const text = document.createElement('span')
	text.className = 'footnote-text'
	if (entry.content.length === 0) {
		text.classList.add('footnote-text--empty')
		text.textContent = 'Footnote text'
	} else {
		const paragraph = footnoteParagraph(doc.type.schema, entry.content)
		text.appendChild(DOMSerializer.fromSchema(doc.type.schema).serializeFragment(paragraph.content))
	}
	item.appendChild(text)
	return item
}

/** Area catatan satu lembar: garis pemisah lalu catatannya menurut urutan. */
export function renderFootnoteArea(doc: PMNode, refs: readonly number[]): HTMLElement {
	const area = document.createElement('div')
	area.className = FOOTNOTE_AREA_CLASS
	area.contentEditable = 'false'
	const separator = document.createElement('div')
	separator.className = 'footnote-separator'
	area.appendChild(separator)

	const wanted = new Set(refs)
	for (const entry of footnoteEntries(doc)) {
		if (wanted.has(entry.pos)) area.appendChild(serializeEntry(doc, entry))
	}
	return area
}

/** Tanda tangan isi area - kunci dekorasi, supaya area digambar ulang saat isinya berubah. */
export function notesSignature(doc: PMNode, refs: readonly number[]): string {
	const wanted = new Set(refs)
	return footnoteEntries(doc)
		.filter((entry) => wanted.has(entry.pos))
		.map((entry) => `${entry.number}:${JSON.stringify(entry.content)}`)
		.join('|')
}

let cached: { key: string; sizes: FootnoteSizes } | null = null

/**
 * Ukur tiap catatan di wadah tersembunyi selebar area isi, dengan kelas yang
 * sama dengan area aslinya - jadi tinggi yang dipesan sama dengan yang
 * digambar. Hasilnya disimpan selama isi dan lebarnya tidak berubah.
 */
export function measureFootnotes(view: EditorView): FootnoteSizes | undefined {
	const entries = footnoteEntries(view.state.doc)
	if (entries.length === 0) return undefined
	const host = view.dom.parentElement
	if (!host) return undefined

	const style = getComputedStyle(view.dom)
	const width =
		view.dom.clientWidth - Number.parseFloat(style.paddingLeft) - Number.parseFloat(style.paddingRight)
	const key = `${Math.round(width)}|${entries.map((entry) => `${entry.pos}:${entry.number}:${JSON.stringify(entry.content)}`).join('|')}`
	if (cached?.key === key) return cached.sizes

	const probe = document.createElement('div')
	probe.className = `${view.dom.className} footnote-probe`
	probe.setAttribute('aria-hidden', 'true')
	probe.style.cssText = `position:absolute;left:0;top:0;width:${width}px;visibility:hidden;pointer-events:none;padding:0;min-height:0;height:auto`
	const area = renderFootnoteArea(
		view.state.doc,
		entries.map((entry) => entry.pos),
	)
	probe.appendChild(area)
	host.appendChild(probe)

	const items = [...area.querySelectorAll<HTMLElement>('.footnote-item')]
	const heights = new Map<number, number>()
	let itemsHeight = 0
	for (const item of items) {
		const style = getComputedStyle(item)
		const height =
			item.offsetHeight + Number.parseFloat(style.marginTop) + Number.parseFloat(style.marginBottom)
		heights.set(Number(item.getAttribute('data-footnote-pos')), height)
		itemsHeight += height
	}
	const separator = Math.max(0, area.offsetHeight - itemsHeight)
	probe.remove()

	const sizes = { heights, separator }
	cached = { key, sizes }
	return sizes
}
