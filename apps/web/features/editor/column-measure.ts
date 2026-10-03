import type { Node as PMNode } from '@tiptap/pm/model'
import { TableMap } from '@tiptap/pm/tables'
import type { EditorView } from '@tiptap/pm/view'
import { COLUMN_BREAK_NODE } from './column-break'
import { type ColumnItem, type ColumnSlot, resolveColumnSlots } from './column-flow'
import { PAGE_BREAK_NODE } from './page-break'
import { type PageGeometry, pageGeometry, type SheetGeometry, sameSheetSize } from './page-geometry'
import { KEEP_WITH_NEXT, paginationKey, REGION_SPACE_ATTRIBUTE } from './pagination'
import { columnRegions, SECTION_BREAK_NODE, type SectionColumns, sectionSpans } from './section-break'

/*
 * Pengukuran wilayah berkolom di DOM: tinggi tiap blok, letak barisnya, dan
 * geometri lembar tempat wilayah itu berada. Hasilnya masukan murni untuk
 * `flowColumns` (column-flow.ts).
 */

export const FALLBACK_COLUMN_GAP = 24

/** Blok yang boleh dipotong di batas baris (atau baris tabel). Sisanya pindah utuh. */
const SPLITTABLE = new Set([
	'paragraph',
	'heading',
	'blockquote',
	'bulletList',
	'orderedList',
	'taskList',
	'callout',
	'table',
])

/*
 * Wadah yang tidak boleh dibelah di tengah: baris tabel bersarang, blok kode
 * (isinya bisa tergulung), gambar, rumus blok, dan node view blok lain. Teks
 * di dalamnya dihitung sebagai satu "baris" setinggi kotak wadahnya.
 */
const BLOCK_ATOMS = 'tr, pre, .code-block, figure, .math-block, div.react-renderer'

/** Wadah baris untuk aturan yatim/janda. */
const TEXTBLOCKS = 'p, h1, h2, h3, h4, h5, h6, li'

/** Jumlah baris minimal di tiap sisi potongan dalam satu paragraf (yatim/janda, bawaan Word dan CSS). */
const MIN_LINES = 2

export interface MeasuredItem extends ColumnItem {
	nodeSize: number
	type: string
	element: HTMLElement
	/** Tabel: posisi naskah baris yang mengawali tiap titik potong (sejajar `cuts`). */
	rowStarts?: () => readonly number[]
}

export interface RegionMeasure {
	from: number
	to: number
	/** Puncak wilayah, koordinat badan naskah. */
	top: number
	/** Puncak area teks lembar tempat wilayah dimulai. */
	origin: number
	geometry: Pick<PageGeometry, 'contentHeight' | 'pageStride'>
	/** Kotak teks section relatif ke kiri badan naskah. */
	left: number
	width: number
	/** Lebar badan naskah - pasangan `left` untuk menghitung `right` posisi mutlak. */
	parentWidth: number
	slots: ColumnSlot[]
	columns: SectionColumns
	gap: number
	balance: boolean
	items: MeasuredItem[]
}

function px(value: string): number {
	const parsed = Number.parseFloat(value)
	return Number.isFinite(parsed) ? parsed : 0
}

export function collapsedMargin(own: number, padding: number, border: number, child: number): number {
	if (own !== 0 || padding !== 0 || border !== 0) return own
	return child
}

export function blockMargins(element: HTMLElement): { marginTop: number; marginBottom: number } {
	const style = getComputedStyle(element)
	const childMargin = (side: 'Top' | 'Bottom'): number => {
		const child = side === 'Top' ? element.firstElementChild : element.lastElementChild
		return child instanceof HTMLElement ? px(getComputedStyle(child)[`margin${side}`]) : 0
	}
	return {
		marginTop: collapsedMargin(
			px(style.marginTop),
			px(style.paddingTop),
			px(style.borderTopWidth),
			childMargin('Top'),
		),
		marginBottom: collapsedMargin(
			px(style.marginBottom),
			px(style.paddingBottom),
			px(style.borderBottomWidth),
			childMargin('Bottom'),
		),
	}
}

/** Faktor zoom kanvas (`transform: scale`) yang berlaku pada elemen ini. */
export function scaleOf(element: HTMLElement): number {
	const rect = element.getBoundingClientRect()
	if (element.offsetWidth > 0) return rect.width / element.offsetWidth || 1
	if (element.offsetHeight > 0) return rect.height / element.offsetHeight || 1
	return 1
}

export interface LineBox {
	top: number
	bottom: number
	/** Wadah baris - potongan yatim/janda dihitung per wadah. */
	group: Element
}

/**
 * Baris-baris sebuah blok, relatif ke puncak kotaknya (px tanpa zoom).
 *
 * Diambil dari `Range.getClientRects()` per simpul teks - satu kotak per
 * potongan baris - lalu digabung per baris. Teks di dalam wadah atomik
 * diganti kotak wadahnya sendiri, jadi wadah itu tidak pernah terbelah.
 */
export function lineBoxes(element: HTMLElement): LineBox[] {
	const base = element.getBoundingClientRect()
	const scale = scaleOf(element)
	const raw: LineBox[] = []
	const atoms = new Set<Element>()
	const range = document.createRange()
	const inside = (candidate: Element | null): Element | null =>
		candidate && candidate !== element && element.contains(candidate) ? candidate : null
	const push = (rect: DOMRect, group: Element) => {
		if (rect.height <= 0) return
		raw.push({ top: (rect.top - base.top) / scale, bottom: (rect.bottom - base.top) / scale, group })
	}
	const pushAtom = (atom: Element) => {
		if (atoms.has(atom)) return
		atoms.add(atom)
		push(atom.getBoundingClientRect(), atom)
	}

	const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
	for (let node = walker.nextNode(); node; node = walker.nextNode()) {
		const parent = node.parentElement
		if (!parent || !node.nodeValue) continue
		const atom = inside(parent.closest(BLOCK_ATOMS))
		if (atom) {
			pushAtom(atom)
			continue
		}
		const group = inside(parent.closest(TEXTBLOCKS)) ?? element
		range.selectNodeContents(node)
		for (const rect of range.getClientRects()) push(rect, group)
	}
	for (const image of element.querySelectorAll('img')) {
		const atom = inside(image.closest(BLOCK_ATOMS))
		if (atom) pushAtom(atom)
		else push(image.getBoundingClientRect(), inside(image.closest(TEXTBLOCKS)) ?? element)
	}

	raw.sort((a, b) => a.top - b.top || a.bottom - b.bottom)
	const lines: LineBox[] = []
	for (const box of raw) {
		const last = lines[lines.length - 1]
		if (last) {
			const overlap = Math.min(last.bottom, box.bottom) - Math.max(last.top, box.top)
			const smaller = Math.min(last.bottom - last.top, box.bottom - box.top)
			if (overlap > smaller / 2) {
				last.top = Math.min(last.top, box.top)
				last.bottom = Math.max(last.bottom, box.bottom)
				continue
			}
		}
		lines.push({ ...box })
	}
	return lines
}

/**
 * Titik potong sah dari baris-baris sebuah blok: di tengah celah antarbaris,
 * kecuali yang meninggalkan kurang dari dua baris paragraf di salah satu sisi.
 */
export function cutsFromLines(lines: readonly LineBox[], height: number): number[] {
	const counts = new Map<Element, number>()
	for (const line of lines) counts.set(line.group, (counts.get(line.group) ?? 0) + 1)
	const seen = new Map<Element, number>()
	const cuts: number[] = []

	lines.forEach((line, index) => {
		const before = seen.get(line.group) ?? 0
		seen.set(line.group, before + 1)
		if (index === 0) return
		const previous = lines[index - 1]
		if (previous.group === line.group) {
			const total = counts.get(line.group) ?? 0
			if (before < MIN_LINES || total - before < MIN_LINES) return
		}
		const cut = (previous.bottom + line.top) / 2
		if (cut > 0.5 && cut < height - 0.5 && (cuts.length === 0 || cut > cuts[cuts.length - 1] + 0.5))
			cuts.push(cut)
	})
	return cuts
}

interface TableCuts {
	cuts: number[]
	starts: number[]
	repeatHeader?: number
}

/** Titik potong tabel di batas baris yang tidak dilintasi sel ber-rowspan. */
function tableCuts(view: EditorView, table: PMNode, tablePos: number, element: HTMLElement): TableCuts {
	const map = TableMap.get(table)
	const crossed = new Set<number>()
	for (const cell of new Set(map.map)) {
		const rect = map.findCell(cell)
		for (let row = rect.top + 1; row < rect.bottom; row += 1) crossed.add(row)
	}

	const base = element.getBoundingClientRect()
	const scale = scaleOf(element)
	const headed = table.firstChild?.firstChild?.type.name === 'tableHeader'
	const cuts: number[] = []
	const starts: number[] = []
	let repeatHeader: number | undefined
	let index = 0
	table.forEach((_row, offset) => {
		const rowIndex = index
		index += 1
		const rowPos = tablePos + 1 + offset
		const dom = view.nodeDOM(rowPos)
		if (!(dom instanceof HTMLElement)) return
		const rect = dom.getBoundingClientRect()
		if (rowIndex === 0) {
			if (headed && table.attrs.repeatHeader !== false) repeatHeader = rect.height / scale
			return
		}
		if (crossed.has(rowIndex)) return
		/* Kepala tabel tidak boleh tertinggal sendirian di dasar kolom. */
		if (rowIndex === 1 && headed) return
		const cut = (rect.top - base.top) / scale
		if (cut > 0.5 && cut < element.offsetHeight - 0.5) {
			cuts.push(cut)
			starts.push(rowPos)
		}
	})
	return { cuts, starts, ...(repeatHeader !== undefined ? { repeatHeader } : {}) }
}

/**
 * Posisi naskah tempat baris pertama di bawah `offset` dimulai - awal potongan
 * lanjutan. Dicari biner atas `coordsAtPos`, yang tetap bekerja pada bagian
 * blok yang sedang dipangkas (tata letaknya tetap ada).
 *
 * Yang dibandingkan TENGAH kotak kursor, bukan puncaknya: dengan spasi baris
 * rapat, kotak isi baris berikutnya mulai sedikit di atas titik potong
 * (kotak-kotak itu bertumpang), sehingga puncaknya menunjuk satu baris terlalu
 * jauh.
 */
export function positionAtOffset(
	view: EditorView,
	element: HTMLElement,
	from: number,
	to: number,
	offset: number,
): number {
	const base = element.getBoundingClientRect()
	const scale = scaleOf(element)
	const yOf = (pos: number): number => {
		try {
			const coords = view.coordsAtPos(pos, 1)
			return ((coords.top + coords.bottom) / 2 - base.top) / scale
		} catch {
			return Number.NEGATIVE_INFINITY
		}
	}
	let low = from + 1
	let high = Math.max(low, to - 1)
	if (yOf(high) < offset - 0.5) return high
	while (low < high) {
		const middle = (low + high) >> 1
		if (yOf(middle) >= offset - 0.5) high = middle
		else low = middle + 1
	}
	return low
}

/** Posisi naskah awal potongan: baris tabel untuk tabel, pencarian baris untuk teks. */
export function fragmentStart(view: EditorView, item: MeasuredItem, offset: number): number {
	if (offset <= 0) return item.pos
	if (item.rowStarts && typeof item.cuts === 'function') {
		const index = item.cuts().findIndex((cut) => Math.abs(cut - offset) < 0.5)
		const start = index >= 0 ? item.rowStarts()[index] : undefined
		if (start !== undefined) return start
	}
	return positionAtOffset(view, item.element, item.pos, item.pos + item.nodeSize, offset)
}

/**
 * Puncak area teks lembar yang memuat puncak wilayah. Tanpa daftar lembar
 * (paginasi belum sempat berjalan) jatuh ke tebakan lembar seragam.
 */
function regionOrigin(
	top: number,
	sheets: readonly SheetGeometry[],
	base: PageGeometry,
	section: PageGeometry,
): number {
	let origin: number | null = null
	for (const sheet of sheets) {
		const contentTop = sheet.top + sheet.margins.top - base.margins.top
		if (contentTop <= top + 0.5) origin = contentTop
		else break
	}
	if (origin !== null) return origin
	const stride = section.pageStride || base.pageStride
	return stride > 0 ? Math.floor(top / stride) * stride : 0
}

function measureItem(view: EditorView, node: PMNode, pos: number, element: HTMLElement): MeasuredItem {
	const type = node.type.name
	const height = element.offsetHeight
	const item: MeasuredItem = {
		pos,
		nodeSize: node.nodeSize,
		type,
		element,
		height,
		...blockMargins(element),
		keepWithNext: KEEP_WITH_NEXT.has(type),
		...(type === PAGE_BREAK_NODE ? { isBreak: true } : {}),
		...(type === COLUMN_BREAK_NODE ? { columnBreak: true } : {}),
	}
	if (type === 'table') {
		let known: TableCuts | null = null
		const resolve = () => {
			known ??= tableCuts(view, node, pos, element)
			return known
		}
		item.cuts = () => resolve().cuts
		item.rowStarts = () => resolve().starts
		const header = resolve().repeatHeader
		if (header !== undefined) item.repeatHeader = header
	} else if (SPLITTABLE.has(type)) {
		item.cuts = () => cutsFromLines(lineBoxes(element), height)
	}
	return item
}

export function measureRegions(view: EditorView): { regions: RegionMeasure[]; elements: HTMLElement[] } {
	const pagination = paginationKey.getState(view.state)
	const setup = pagination?.setup
	const elements: HTMLElement[] = []
	if (!pagination || !setup) return { regions: [], elements }
	const regions = columnRegions(view.state.doc, setup)
	if (regions.length === 0) return { regions: [], elements }

	const base = pagination.geometry
	const sheets = pagination.sheets
	const spans = sectionSpans(view.state.doc, setup)
	const canvasWidth = Math.max(base.width, ...sheets.map((sheet) => sheet.width))
	const parentWidth = view.dom.clientWidth
	const measured: RegionMeasure[] = []

	for (const region of regions) {
		const columns = region.span.columns
		if (!columns || columns.count < 2) continue
		const placeholder = view.dom.querySelector(`[${REGION_SPACE_ATTRIBUTE}="${region.from}"]`)
		const first = view.nodeDOM(region.from)
		const anchor =
			placeholder instanceof HTMLElement ? placeholder : first instanceof HTMLElement ? first : null
		if (!anchor) continue

		const section = pageGeometry(region.span.setup)
		const left = (canvasWidth - section.width) / 2 + section.margins.left - base.margins.left
		const width = section.contentWidth
		if (!(width > 0)) continue

		const count = Math.max(2, columns.count)
		const gap = typeof columns.gap === 'number' && columns.gap >= 0 ? columns.gap : FALLBACK_COLUMN_GAP
		const slots = resolveColumnSlots(width, count, gap, columns.widths ?? null, columns.gaps ?? null)
		if (slots.length === 0) continue

		const spanIndex = spans.findIndex((span) => span.pos === region.span.pos)
		const next = spans[spanIndex + 1]
		const closing = next ? view.state.doc.nodeAt(next.pos) : null
		/* Word menyeimbangkan kolom hanya bila section sesudahnya menerus (atau
		 * naskah habis); pembatas "next page" membiarkan kolom terisi berurutan. */
		const balance =
			!next ||
			closing?.type.name !== SECTION_BREAK_NODE ||
			(closing.attrs.continuous === true && sameSheetSize(region.span.setup, next.setup))

		const items: MeasuredItem[] = []
		view.state.doc.forEach((node, offset) => {
			if (offset < region.from || offset >= region.to) return
			const element = view.nodeDOM(offset)
			if (!(element instanceof HTMLElement)) return
			elements.push(element)
			items.push(measureItem(view, node, offset, element))
		})
		if (items.length === 0) continue

		const top = anchor.offsetTop
		measured.push({
			from: region.from,
			to: region.to,
			top,
			origin: regionOrigin(top, sheets, base, section),
			geometry: section,
			left,
			width,
			parentWidth,
			slots,
			columns,
			gap,
			balance,
			items,
		})
	}

	return { regions: measured, elements }
}
