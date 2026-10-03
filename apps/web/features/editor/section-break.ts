import { type CommandProps, Extension, mergeAttributes, Node } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import {
	type EditorState,
	NodeSelection,
	Plugin,
	Selection,
	TextSelection,
	type Transaction,
} from '@tiptap/pm/state'
import { insertBreak } from './break-insert'
import { DEFAULT_PAGE_SETUP, type PageSetup } from './page-geometry'
export const SECTION_BREAK_NODE = 'sectionBreak'

/**
 * Tata letak kolom sebuah section - bentuk yang sama dengan `w:cols` Word.
 *
 * `gap` adalah jarak tunggal untuk semua celah (`w:cols/@w:space`); `gaps`
 * jarak per celah (`w:col/@w:space`, panjang `count - 1`) dan menang atasnya.
 * `widths` adalah lebar per kolom dalam px pada saat impor - dipakai sebagai
 * PROPORSI, bukan ukuran mutlak, karena lebar kolom teks di sini bisa berbeda
 * dari lebar di berkas asalnya. Ketiganya opsional: tanpa mereka kolomnya
 * sama lebar, persis perilaku sebelum lebar tak-sama ikut terbawa.
 */
export interface SectionColumns {
	count: number
	gap?: number
	widths?: number[]
	gaps?: number[]
}

export interface SectionBreakAttrs {
	pageSetup: Partial<PageSetup> | null
	columns: SectionColumns | null
	continuous?: boolean
}

export interface SectionSpan {
	pos: number
	setup: PageSetup
	columns: SectionColumns | null
}

declare module '@tiptap/core' {
	interface Commands<ReturnType> {
		sectionBreak: {
			setSectionBreak: (attrs?: Partial<SectionBreakAttrs>) => ReturnType
			applySectionSetup: (
				patch: Partial<PageSetup>,
				range: { from: number; to?: number },
				baseSetup?: PageSetup,
			) => ReturnType
			applySectionColumns: (
				columns: SectionBreakAttrs['columns'],
				range: { from: number; to?: number; startsPage?: boolean },
				baseSetup?: PageSetup,
			) => ReturnType
			setSectionColumns: (count: number) => ReturnType
			unsetSectionColumns: () => ReturnType
		}
	}
}

function parseJsonAttribute<T>(element: HTMLElement, name: string): T | null {
	const raw = element.getAttribute(name)
	if (!raw) return null
	try {
		return JSON.parse(raw) as T
	} catch {
		return null
	}
}

/*
 * Pembatas section di naskah tak terlihat sebagai baris dan mudah terhapus
 * tanpa sengaja (KOL-8): Backspace di awal paragraf sesudahnya, Delete di
 * ujung paragraf sebelumnya, atau panah atas yang memilihnya lalu satu
 * ketukan huruf. Penjaga ini membuat penghapusan menjadi dua langkah yang
 * terlihat - tekanan pertama hanya MEMILIH pembatasnya (tersorot), tekanan
 * kedua menghapusnya - dan huruf yang diketik saat pembatas terpilih masuk
 * ke paragraf sesudahnya, tidak menggantikan pembatas.
 */

/** Backspace di awal blok tingkat atas yang tepat didahului pembatas: pilih pembatasnya. */
export function selectSectionBreakBackward(
	state: EditorState,
	dispatch?: (tr: Transaction) => void,
): boolean {
	const { selection, doc } = state
	if (!selection.empty || !(selection instanceof TextSelection)) return false
	const $pos = selection.$from
	if ($pos.depth < 1 || $pos.parentOffset !== 0) return false
	for (let depth = 1; depth < $pos.depth; depth += 1) if ($pos.index(depth) !== 0) return false
	const index = $pos.index(0)
	if (index === 0) return false
	const before = doc.child(index - 1)
	if (before.type.name !== SECTION_BREAK_NODE) return false
	if (dispatch) dispatch(state.tr.setSelection(NodeSelection.create(doc, $pos.before(1) - before.nodeSize)))
	return true
}

/** Delete di ujung blok tingkat atas yang tepat diikuti pembatas: pilih pembatasnya. */
export function selectSectionBreakForward(state: EditorState, dispatch?: (tr: Transaction) => void): boolean {
	const { selection, doc } = state
	if (!selection.empty || !(selection instanceof TextSelection)) return false
	const $pos = selection.$from
	if ($pos.depth < 1 || $pos.parentOffset !== $pos.parent.content.size) return false
	for (let depth = 1; depth < $pos.depth; depth += 1) {
		if ($pos.index(depth) !== $pos.node(depth).childCount - 1) return false
	}
	const index = $pos.index(0)
	if (index + 1 >= doc.childCount) return false
	if (doc.child(index + 1).type.name !== SECTION_BREAK_NODE) return false
	if (dispatch) dispatch(state.tr.setSelection(NodeSelection.create(doc, $pos.after(1))))
	return true
}

/** Huruf yang diketik saat pembatas terpilih: masuk ke paragraf sesudahnya (atau sebelumnya). */
export function typeBesideSectionBreak(state: EditorState, text: string): Transaction | null {
	const { selection } = state
	if (!(selection instanceof NodeSelection) || selection.node.type.name !== SECTION_BREAK_NODE) return null
	const target =
		Selection.findFrom(state.doc.resolve(selection.to), 1, true) ??
		Selection.findFrom(state.doc.resolve(selection.from), -1, true)
	if (!target) return null
	return state.tr.setSelection(target).insertText(text)
}

const SectionBreakGuard = Extension.create({
	name: 'sectionBreakGuard',

	/* Di atas papan tik inti TipTap, yang menghapus atom sebelum kursor. */
	priority: 1000,

	addKeyboardShortcuts() {
		return {
			Backspace: ({ editor }) => selectSectionBreakBackward(editor.state, editor.view.dispatch),
			Delete: ({ editor }) => selectSectionBreakForward(editor.state, editor.view.dispatch),
		}
	},

	addProseMirrorPlugins() {
		const breaksIn = (doc: PMNode) => {
			let count = 0
			doc.forEach((node) => {
				if (node.type.name === SECTION_BREAK_NODE) count += 1
			})
			return count
		}
		return [
			new Plugin({
				props: {
					handleTextInput(view, _from, _to, text) {
						const tr = typeBesideSectionBreak(view.state, text)
						if (!tr) return false
						view.dispatch(tr.scrollIntoView())
						return true
					},
				},
				/*
				 * Pembatas pembuka yang dihapus meninggalkan penutupnya yatim - pembatas
				 * menerus yang tidak lagi mengubah apa pun, tapi tetap jebakan
				 * Backspace berikutnya. Ia ikut dibuang dalam langkah urung yang sama.
				 */
				appendTransaction(transactions, oldState, newState) {
					if (!transactions.some((tr) => tr.docChanged)) return null
					if (breaksIn(newState.doc) >= breaksIn(oldState.doc)) return null
					const tr = newState.tr
					removeIdleBreaks(tr, 0, newState.doc.content.size)
					return tr.docChanged ? tr : null
				},
			}),
		]
	},
})

export const SectionBreak = Node.create({
	name: SECTION_BREAK_NODE,

	group: 'block',
	atom: true,
	selectable: true,

	addExtensions() {
		return [SectionBreakGuard]
	},

	addAttributes() {
		return {
			pageSetup: {
				default: null,
				parseHTML: (element) => parseJsonAttribute<Partial<PageSetup>>(element, 'data-page-setup'),
				renderHTML: (attributes) =>
					attributes.pageSetup === null ? {} : { 'data-page-setup': JSON.stringify(attributes.pageSetup) },
			},
			columns: {
				default: null,
				parseHTML: (element) => parseJsonAttribute<SectionBreakAttrs['columns']>(element, 'data-columns'),
				renderHTML: (attributes) =>
					attributes.columns === null ? {} : { 'data-columns': JSON.stringify(attributes.columns) },
			},
			continuous: {
				default: false,
				parseHTML: (element) => element.getAttribute('data-continuous') === 'true',
				renderHTML: (attributes) => (attributes.continuous ? { 'data-continuous': 'true' } : {}),
			},
		}
	},

	parseHTML() {
		return [{ tag: 'div[data-section-break]' }]
	},

	renderHTML({ node, HTMLAttributes }) {
		return [
			'div',
			mergeAttributes(HTMLAttributes, {
				'data-section-break': '',
				class: node.attrs.continuous ? 'section-break section-break-continuous' : 'section-break',
				'aria-label': node.attrs.continuous ? 'Continuous section break' : 'Section break',
			}),
		]
	},

	addCommands() {
		return {
			setSectionBreak:
				(attrs) =>
				({ state, tr, dispatch }) =>
					insertBreak(state, tr, dispatch, state.schema.nodes[this.name], {
						pageSetup: attrs?.pageSetup ?? null,
						columns: attrs?.columns ?? null,
						continuous: attrs?.continuous ?? false,
					}),
			applySectionSetup:
				(patch, range, baseSetup = DEFAULT_PAGE_SETUP) =>
				({ tr, dispatch, state }) =>
					encloseSection({ tr, dispatch, state }, range, baseSetup, (before) => ({
						open: { pageSetup: patch, columns: before.columns ?? null },
						close: { pageSetup: before.setup, columns: before.columns ?? null },
					})),
			/*
			 * Kolom untuk rentang tertentu ("This page", alat AI). Bergabung dengan
			 * wilayah berkolom yang sudah ada - tidak menumpuk pembatas (KOL-3) -
			 * dan pembatas pembukanya menerus, jadi halaman tempat rentang itu
			 * dimulai tidak dikosongkan (KOL-4).
			 */
			applySectionColumns:
				(columns, range) =>
				({ tr, dispatch }) => {
					if (!dispatch) return true
					return applyColumnsToRange(tr, range, columns)
				},

			setSectionColumns:
				(count) =>
				({ state, tr, dispatch }) =>
					setSectionColumnsCommand(state, tr, dispatch, count),

			unsetSectionColumns:
				() =>
				({ state, tr, dispatch }) =>
					unsetSectionColumnsCommand(state, tr, dispatch),
		}
	},
})

function encloseSection(
	{ tr, dispatch, state }: Pick<CommandProps, 'tr' | 'dispatch' | 'state'>,
	range: { from: number; to?: number },
	baseSetup: PageSetup,
	attrs: (before: SectionSpan) => { open: SectionBreakAttrs; close: SectionBreakAttrs },
): boolean {
	const type = state.schema.nodes[SECTION_BREAK_NODE]
	if (!type) return false

	const spans = sectionSpans(state.doc, baseSetup)
	const before = spans.filter((span) => span.pos <= range.from).pop() ?? spans[0]
	const { open, close } = attrs(before)

	if (!dispatch) return true
	if (range.to !== undefined && range.to < state.doc.content.size) {
		tr.insert(range.to, type.create(close))
	}
	tr.insert(range.from, type.create(open))

	return true
}

/** Kolom yang benar-benar berlaku: kurang dari dua kolom berarti satu kolom (null). */
function effectiveColumns(columns: SectionColumns | null | undefined): SectionColumns | null {
	return columns && columns.count >= 2 ? columns : null
}

export function sameColumns(
	a: SectionColumns | null | undefined,
	b: SectionColumns | null | undefined,
): boolean {
	const one = effectiveColumns(a)
	const two = effectiveColumns(b)
	if (!one || !two) return one === two
	const list = (value: number[] | undefined) => JSON.stringify(value ?? null)
	return (
		one.count === two.count &&
		(one.gap ?? null) === (two.gap ?? null) &&
		list(one.widths) === list(two.widths) &&
		list(one.gaps) === list(two.gaps)
	)
}

/** Kolom yang berlaku untuk isi di posisi `pos` (batas blok tingkat atas). */
function columnsAt(doc: PMNode, pos: number): SectionColumns | null {
	let columns: SectionColumns | null = null
	doc.forEach((node, offset) => {
		if (offset >= pos) return
		if (node.type.name === SECTION_BREAK_NODE)
			columns = effectiveColumns(node.attrs.columns as SectionColumns | null)
	})
	const at = doc.nodeAt(pos)
	if (at?.type.name === SECTION_BREAK_NODE)
		columns = effectiveColumns(at.attrs.columns as SectionColumns | null)
	return columns
}

/** Posisi tingkat atas terdekat: awal (`side` -1) atau ujung (`side` 1) blok terluar yang memuat `pos`. */
function topBoundary(doc: PMNode, pos: number, side: -1 | 1): number {
	const clamped = Math.max(0, Math.min(pos, doc.content.size))
	const $pos = doc.resolve(clamped)
	if ($pos.depth === 0) return clamped
	return side < 0 ? $pos.before(1) : $pos.after(1)
}

/**
 * Menerapkan tata letak kolom ke rentang blok tingkat atas `[from, to)`
 * (`to` kosong = sampai ujung naskah), menyatu dengan pembatas yang sudah
 * ada:
 *
 * - pembatas tepat sebelum rentang dipakai ulang sebagai pembukanya (kolomnya
 *   diganti), bukan ditumpuk pembatas baru;
 * - pembatas di dalam rentang yang hanya membawa kolom dibuang; yang membawa
 *   setelan halaman dipertahankan dengan kolom yang sama;
 * - pembatas penutup (menerus) mengembalikan kolom yang berlaku sesudah
 *   rentang, kecuali di sana sudah ada pembatas;
 * - pembatas yang tidak mengubah apa pun dibersihkan.
 *
 * Pembatas baru menerus: menerapkan kolom tidak memaksa halaman baru, jadi
 * halaman 1 tidak pernah dikosongkan (KOL-4). Satu pengecualian: rentang
 * "This page" (`startsPage`) di halaman 2 dan seterusnya dibuka di halamannya
 * sendiri. Rentang di dalam wilayah berkolom memecah wilayah itu, persis Word.
 */
export function applyColumnsToRange(
	tr: Transaction,
	range: { from: number; to?: number; startsPage?: boolean },
	columns: SectionColumns | null,
): boolean {
	const doc = tr.doc
	const type = doc.type.schema.nodes[SECTION_BREAK_NODE]
	if (!type) return false
	const wanted = effectiveColumns(columns)
	const size = doc.content.size
	let from = topBoundary(doc, range.from, -1)
	let to = range.to === undefined ? size : topBoundary(doc, range.to, 1)
	if (to < from) [from, to] = [to, from]

	const atFrom = doc.nodeAt(from)
	const beforeFrom = doc.resolve(from).nodeBefore
	const openPos = atFrom?.type === type ? from : beforeFrom?.type === type ? from - beforeFrom.nodeSize : null
	const after = columnsAt(doc, to)
	const before = openPos === null ? columnsAt(doc, from) : columnsAt(doc, openPos)

	/* Dari belakang ke depan supaya posisi di depannya tetap sah. */
	if (to < size && doc.nodeAt(to)?.type !== type && !sameColumns(after, wanted)) {
		tr.insert(to, type.create({ pageSetup: null, columns: after, continuous: true }))
	}
	const inner: { pos: number; node: PMNode }[] = []
	doc.forEach((node, offset) => {
		if (node.type === type && offset > from && offset < to && offset !== openPos)
			inner.push({ pos: offset, node })
	})
	for (const { pos, node } of inner.reverse()) {
		if (node.attrs.pageSetup) tr.setNodeMarkup(pos, undefined, { ...node.attrs, columns: wanted })
		else tr.delete(pos, pos + node.nodeSize)
	}
	if (openPos !== null) {
		const open = doc.nodeAt(openPos)
		if (open) tr.setNodeMarkup(openPos, undefined, { ...open.attrs, columns: wanted })
	} else if (!sameColumns(before, wanted)) {
		/* "This page" di halaman 2 dan seterusnya: wilayahnya mulai di halaman
		 * itu. Menerus, isi halaman itu akan menyusul ke dasar halaman
		 * sebelumnya (yang tadinya kosong karena paragrafnya tidak muat). */
		const continuous = !(range.startsPage && from > 0)
		tr.insert(from, type.create({ pageSetup: null, columns: wanted, continuous }))
	}

	removeIdleBreaks(tr, tr.mapping.map(from, -1) - 1, tr.mapping.map(to, 1) + 1)
	return true
}

/**
 * Membuang pembatas yang tidak mengubah apa pun di rentang `[from, to]`:
 * menerus, tanpa setelan halaman, dan kolomnya sama dengan yang sudah berlaku.
 * Pembatas semacam itu sisa suntingan (penutup yang pembukanya dihapus, dua
 * wilayah yang menyatu) dan hanya menjadi jebakan Backspace.
 */
export function removeIdleBreaks(tr: Transaction, from: number, to: number): void {
	const idle: { pos: number; size: number }[] = []
	let current: SectionColumns | null = null
	tr.doc.forEach((node, offset) => {
		if (node.type.name !== SECTION_BREAK_NODE) return
		const columns = effectiveColumns(node.attrs.columns as SectionColumns | null)
		const quiet = node.attrs.continuous === true && !node.attrs.pageSetup && sameColumns(columns, current)
		if (quiet && offset >= from && offset <= to) idle.push({ pos: offset, size: node.nodeSize })
		else current = columns
	})
	for (const { pos, size } of idle.reverse()) tr.delete(pos, pos + size)
}

/** Wilayah berkolom yang memuat posisi `pos`, bila ada. */
export function columnRegionAt(
	doc: PMNode,
	pos: number,
	baseSetup: PageSetup = DEFAULT_PAGE_SETUP,
): ColumnRegion | null {
	return columnRegions(doc, baseSetup).find((region) => pos >= region.from && pos <= region.to) ?? null
}

export function setSectionColumnsCommand(
	state: EditorState,
	tr: Transaction,
	dispatch: ((tr: Transaction) => void) | undefined,
	count: number,
): boolean {
	if (!Number.isFinite(count) || count < 2) return false
	const { selection, doc } = state

	/* Kursor tanpa seleksi di dalam wilayah berkolom: ubah jumlah kolom
	 * wilayah itu (Word: "This section"). */
	const region = selection.empty ? columnRegionAt(doc, selection.from) : null
	if (region) {
		if (!dispatch) return true
		const node = doc.nodeAt(region.span.pos)
		if (!node) return false
		const current = node.attrs.columns as SectionColumns
		const columns: SectionColumns = {
			count,
			...(typeof current.gap === 'number' ? { gap: current.gap } : {}),
		}
		tr.setNodeMarkup(region.span.pos, undefined, { ...node.attrs, columns })
		return true
	}

	if (!dispatch) return true
	const gap = columnRegionAt(doc, selection.from)?.span.columns?.gap
	return applyColumnsToRange(
		tr,
		{ from: selection.from, to: selection.to },
		{ count, ...(typeof gap === 'number' ? { gap } : {}) },
	)
}

export function unsetSectionColumnsCommand(
	state: EditorState,
	tr: Transaction,
	dispatch: ((tr: Transaction) => void) | undefined,
): boolean {
	const region = columnRegionAt(state.doc, state.selection.from)
	if (!region) return false
	if (!dispatch) return true
	return applyColumnsToRange(tr, { from: region.from, to: region.to }, null)
}

export function sectionSpans(doc: PMNode, baseSetup: PageSetup = DEFAULT_PAGE_SETUP): SectionSpan[] {
	const spans: SectionSpan[] = [{ pos: 0, setup: baseSetup, columns: null }]

	doc.forEach((node, offset) => {
		if (node.type.name !== SECTION_BREAK_NODE) return
		const previous = spans[spans.length - 1]
		const patch = (node.attrs.pageSetup ?? {}) as Partial<PageSetup>
		spans.push({
			pos: offset,
			setup: { ...previous.setup, ...patch, margins: { ...previous.setup.margins, ...patch.margins } },
			columns: (node.attrs.columns as SectionBreakAttrs['columns']) ?? null,
		})
	})

	return spans
}

export interface ColumnRegion {
	from: number
	to: number
	span: SectionSpan
}

export function columnRegions(doc: PMNode, baseSetup: PageSetup = DEFAULT_PAGE_SETUP): ColumnRegion[] {
	const spans = sectionSpans(doc, baseSetup)
	const regions: ColumnRegion[] = []

	spans.forEach((span, index) => {
		if (index === 0) return
		if (!span.columns || span.columns.count < 2) return

		const breakNode = doc.nodeAt(span.pos)
		if (!breakNode) return
		regions.push({
			from: span.pos + breakNode.nodeSize,
			to: spans[index + 1]?.pos ?? doc.content.size,
			span,
		})
	})

	return regions
}
