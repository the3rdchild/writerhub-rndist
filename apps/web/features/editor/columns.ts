import { Extension, mergeAttributes, Node } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import { type EditorState, Plugin, PluginKey, type Transaction } from '@tiptap/pm/state'
import { DecorationSet, type EditorView } from '@tiptap/pm/view'
import { flowColumns } from './column-flow'
import { fragmentStart, measureRegions, type RegionMeasure } from './column-measure'
import { columnPointerPlugin } from './column-pointer'
import { attachColumnPrint } from './column-print'
import {
	type ActiveFragments,
	activeFragments,
	buildDecorations,
	ColumnClones,
	mapPlans,
	type RegionPlan,
	sameActive,
} from './column-render'
import { paginationKey, SELF_PAGINATE_ATTRIBUTE } from './pagination'
import {
	SECTION_BREAK_NODE,
	type SectionBreakAttrs,
	type SectionColumns,
	sectionSpans,
} from './section-break'
import { clampColumnWidths, explicitColumnWidths, writeColumnWidths } from './table-ops'

const MIN_COLUMNS = 2

export const COLUMNS_NODE = 'columns'

/** Perubahan tata letak kolom dari penggaris atau dialog; `null` menghapus medannya. */
export interface ColumnsLayoutPatch {
	count?: number
	gap?: number | null
	widths?: number[] | null
	gaps?: number[] | null
}

declare module '@tiptap/core' {
	interface Commands<ReturnType> {
		columns: {
			setColumns: (count: number) => ReturnType
			unsetColumns: () => ReturnType
			setColumnsLayout: (pos: number, patch: ColumnsLayoutPatch) => ReturnType
		}
	}
}

function parseGapAttribute(element: HTMLElement): number | null {
	const parsed = Number(element.getAttribute('data-gap'))
	return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

function parseWidthsAttribute(element: HTMLElement): number[] | null {
	const raw = element.getAttribute('data-widths')
	if (!raw) return null
	try {
		const parsed: unknown = JSON.parse(raw)
		if (!Array.isArray(parsed) || parsed.length === 0) return null
		return parsed.every((value) => typeof value === 'number' && Number.isFinite(value)) ? parsed : null
	} catch {
		return null
	}
}

/** Menerapkan tambalan ke atribut `columns` pembatas section; medan `null` dibuang. */
export function patchSectionColumns(columns: SectionColumns, patch: ColumnsLayoutPatch): SectionColumns {
	const next: SectionColumns = { ...columns }
	if (typeof patch.count === 'number') next.count = patch.count
	for (const field of ['gap', 'widths', 'gaps'] as const) {
		if (!(field in patch)) continue
		const value = patch[field]
		if (value === null || value === undefined) delete next[field]
		else (next as unknown as Record<string, unknown>)[field] = value
	}
	if (next.widths && next.widths.length !== next.count) delete next.widths
	if (next.gaps && next.gaps.length !== next.count - 1) delete next.gaps
	return next
}

export const Columns = Node.create({
	name: COLUMNS_NODE,

	group: 'block',

	content: 'block+',

	defining: true,

	addAttributes() {
		return {
			count: {
				default: MIN_COLUMNS,
				parseHTML: (element) => {
					const parsed = Number(element.getAttribute('data-count'))
					return Number.isFinite(parsed) && parsed >= MIN_COLUMNS ? parsed : MIN_COLUMNS
				},
				renderHTML: (attributes) => ({
					'data-count': attributes.count,
					style: `--columns-count: ${attributes.count}; column-count: ${attributes.count}${
						typeof attributes.gap === 'number' ? `; column-gap: ${attributes.gap}px` : ''
					}`,
				}),
			},
			gap: {
				default: null,
				parseHTML: parseGapAttribute,
				renderHTML: (attributes) => (attributes.gap === null ? {} : { 'data-gap': attributes.gap }),
			},
			widths: {
				default: null,
				parseHTML: parseWidthsAttribute,
				renderHTML: (attributes) =>
					attributes.widths === null ? {} : { 'data-widths': JSON.stringify(attributes.widths) },
			},
		}
	},

	renderHTML({ HTMLAttributes }) {
		return [
			'div',
			mergeAttributes(HTMLAttributes, {
				'data-type': COLUMNS_NODE,
				[SELF_PAGINATE_ATTRIBUTE]: 'true',
			}),
			0,
		]
	},

	parseHTML() {
		return [{ tag: 'div[data-type="columns"]' }]
	},

	addCommands() {
		return {
			setColumns:
				(count) =>
				({ editor, commands }) => {
					if (!Number.isFinite(count) || count < MIN_COLUMNS) return false
					if (editor.isActive(this.name)) {
						return commands.updateAttributes(this.name, { count })
					}
					return commands.setSectionColumns(count)
				},
			unsetColumns:
				() =>
				({ commands }) =>
					commands.lift(this.name) || commands.unsetSectionColumns(),
			/*
			 * Lebar & jarak kolom. Sasarannya pembatas section pembuka wilayah
			 * (penggaris dan dialog "More column options"); node `columns` lama
			 * tetap dilayani untuk naskah yang belum sempat dimigrasi.
			 */
			setColumnsLayout:
				(pos, patch) =>
				({ tr, dispatch }) => {
					const node = tr.doc.nodeAt(pos)
					if (!node) return false
					if (node.type.name === SECTION_BREAK_NODE) {
						const columns = node.attrs.columns as SectionColumns | null
						if (!columns) return false
						if (dispatch) {
							tr.setNodeMarkup(pos, undefined, {
								...node.attrs,
								columns: patchSectionColumns(columns, patch),
							})
						}
						return true
					}
					if (node.type.name !== this.name) return false
					if (dispatch) {
						const { gap, widths } = patch
						tr.setNodeMarkup(pos, undefined, {
							...node.attrs,
							...(gap !== undefined ? { gap } : {}),
							...(widths !== undefined ? { widths } : {}),
						})
					}
					return true
				},
		}
	},
})

const LegacyColumn = Node.create({
	name: 'column',

	group: 'block',

	content: 'block+',

	renderHTML({ HTMLAttributes }) {
		return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'col' }), 0]
	},

	parseHTML() {
		return [{ tag: 'div[data-type="col"]' }]
	},
})

export function migrateLegacyColumns(state: EditorState): Transaction | null {
	const breakType = state.schema.nodes[SECTION_BREAK_NODE]
	if (!breakType) return null

	const wrappers: { pos: number; node: PMNode }[] = []
	state.doc.descendants((node, pos) => {
		if (node.type.name !== COLUMNS_NODE) return true
		wrappers.push({ pos, node })
		return false
	})
	if (wrappers.length === 0) return null
	const spans = sectionSpans(state.doc)

	const tr = state.tr
	for (const { pos, node } of [...wrappers].reverse()) {
		const enclosing = spans.filter((span) => span.pos <= pos).pop()
		const restore = enclosing && enclosing.pos > 0 ? enclosing.columns : null

		const columns: SectionBreakAttrs['columns'] = {
			count: Math.max(MIN_COLUMNS, Number(node.attrs.count) || MIN_COLUMNS),
			...(typeof node.attrs.gap === 'number' ? { gap: node.attrs.gap } : {}),
		}
		const open = breakType.create({ pageSetup: null, columns, continuous: true })
		const close = breakType.create({ pageSetup: null, columns: restore ?? null, continuous: true })

		const children: PMNode[] = []
		node.content.forEach((child) => {
			children.push(child)
		})
		tr.replaceWith(pos, pos + node.nodeSize, [open, ...children, close])
	}

	tr.setMeta('addToHistory', false)
	return tr
}

export const columnLayoutKey = new PluginKey<ColumnLayoutState>('columnLayout')

export interface ColumnLayoutState {
	plans: RegionPlan[]
	active: ActiveFragments
	decorations: DecorationSet
}

/** Mengalirkan satu wilayah terukur menjadi rencana tampil. */
function planRegion(view: EditorView, region: RegionMeasure): RegionPlan {
	const flow = flowColumns(
		region.items,
		{ top: region.top, origin: region.origin, slots: region.slots, balance: region.balance },
		region.geometry,
	)
	return {
		pos: region.from,
		top: region.top,
		height: flow.height,
		sheetGap: flow.sheetGap,
		parentWidth: region.parentWidth,
		count: region.slots.length,
		gap: region.gap,
		balance: region.balance,
		items: region.items.map((item, index) => ({
			key: item.pos,
			pos: item.pos,
			nodeSize: item.nodeSize,
			marginTop: item.marginTop,
			fragments: flow.fragments[index].map((fragment) => {
				const slot = region.slots[fragment.column]
				return {
					top: fragment.top,
					left: region.left + slot.left,
					width: slot.width,
					offset: fragment.offset,
					height: fragment.height,
					header: fragment.header ?? 0,
					from: fragment.offset > 0 ? fragmentStart(view, item, fragment.offset) : item.pos,
				}
			}),
		})),
	}
}

function samePlans(a: readonly RegionPlan[], b: readonly RegionPlan[]): boolean {
	const near = (x: number, y: number) => Math.abs(x - y) < 0.5
	return (
		a.length === b.length &&
		a.every((plan, index) => {
			const other = b[index]
			return (
				plan.pos === other.pos &&
				near(plan.top, other.top) &&
				near(plan.height, other.height) &&
				near(plan.sheetGap, other.sheetGap) &&
				near(plan.parentWidth, other.parentWidth) &&
				plan.count === other.count &&
				plan.balance === other.balance &&
				plan.items.length === other.items.length &&
				plan.items.every((item, i) => {
					const twin = other.items[i]
					return (
						item.pos === twin.pos &&
						item.nodeSize === twin.nodeSize &&
						near(item.marginTop, twin.marginTop) &&
						item.fragments.length === twin.fragments.length &&
						item.fragments.every((fragment, j) => {
							const pair = twin.fragments[j]
							return (
								near(fragment.top, pair.top) &&
								near(fragment.left, pair.left) &&
								near(fragment.width, pair.width) &&
								near(fragment.offset, pair.offset) &&
								near(fragment.height, pair.height) &&
								near(fragment.header, pair.header) &&
								fragment.from === pair.from
							)
						})
					)
				})
			)
		})
	)
}

/** Sidik ringkas rencana untuk penjaga osilasi. */
function signature(plans: readonly RegionPlan[]): string {
	return plans
		.map((plan) =>
			[
				plan.pos,
				Math.round(plan.height),
				...plan.items.flatMap((item) =>
					item.fragments.map(
						(fragment) =>
							`${Math.round(fragment.top)}:${Math.round(fragment.left)}:${Math.round(fragment.height)}`,
					),
				),
			].join(','),
		)
		.join('|')
}

/** Lebar tabel berkolom eksplisit yang lebih lebar dari petaknya. */
interface TableWidthCorrection {
	pos: number
	available: number
}

function tableCorrections(view: EditorView, plans: readonly RegionPlan[]): TableWidthCorrection[] {
	const corrections: TableWidthCorrection[] = []
	for (const plan of plans) {
		for (const item of plan.items) {
			const table = view.state.doc.nodeAt(item.pos)
			if (table?.type.name !== 'table' || item.fragments.length === 0) continue
			const indent = Number(table.attrs.indentLeft) || 0
			const available = Math.max(0, Math.min(...item.fragments.map((fragment) => fragment.width)) - indent)
			if (clampColumnWidths(explicitColumnWidths(table), available))
				corrections.push({ pos: item.pos, available })
		}
	}
	return corrections
}

function columnLayoutPlugin(): Plugin<ColumnLayoutState> {
	return new Plugin<ColumnLayoutState>({
		key: columnLayoutKey,

		state: {
			init: () => ({ plans: [], active: new Map(), decorations: DecorationSet.empty }),

			apply(tr, current, _old, newState) {
				const incoming = tr.getMeta(columnLayoutKey) as RegionPlan[] | undefined
				const plans = incoming ?? (tr.docChanged ? mapPlans(current.plans, tr) : current.plans)
				const active = activeFragments(plans, newState.selection)
				if (incoming || !sameActive(active, current.active)) {
					return { plans, active, decorations: buildDecorations(newState.doc, plans, active) }
				}
				if (tr.docChanged) {
					return { plans, active, decorations: current.decorations.map(tr.mapping, tr.doc) }
				}
				return current
			},
		},

		props: {
			decorations: (state) => columnLayoutKey.getState(state)?.decorations,
		},

		view(view) {
			let frame = 0
			/* Dua rencana terakhir yang dikirim. Rencana yang kembali ke sidik dua
			 * langkah lalu TANPA naskah berubah berarti tata letaknya berayun (blok
			 * pindah ke kolom yang lebarnya lain, terukur ulang, lalu pindah balik) -
			 * ayunan itu dihentikan di rencana yang sedang tampil. */
			let recent: { mark: string; doc: PMNode }[] = []

			const positionOf = (key: number): number | undefined => {
				const state = columnLayoutKey.getState(view.state)
				for (const plan of state?.plans ?? []) {
					for (const item of plan.items) if (item.key === key) return item.pos
				}
				return undefined
			}
			const clones = new ColumnClones(view, positionOf)
			const detachPrint = attachColumnPrint(view, () => columnLayoutKey.getState(view.state)?.plans ?? [])

			const schedule = () => {
				if (frame) return
				frame = requestAnimationFrame(recalculate)
			}
			const observer = new ResizeObserver(schedule)
			observer.observe(view.dom)
			let watched: HTMLElement[] = []

			const watch = (elements: HTMLElement[]) => {
				const same =
					elements.length === watched.length && elements.every((element, index) => element === watched[index])
				if (same) return

				observer.disconnect()
				observer.observe(view.dom)
				for (const element of elements) observer.observe(element)
				watched = elements
			}

			const recalculate = () => {
				frame = 0
				if (view.isDestroyed) return
				const state = columnLayoutKey.getState(view.state)
				if (!state) return
				const pagination = paginationKey.getState(view.state)
				const measured =
					pagination && !pagination.pageless ? measureRegions(view) : { regions: [], elements: [] }
				watch(measured.elements)
				const plans = measured.regions.map((region) => planRegion(view, region))

				const corrections = tableCorrections(view, plans)
				if (corrections.length > 0) {
					const tr = view.state.tr
					let changed = false
					for (const { pos, available } of corrections) {
						const table = tr.doc.nodeAt(pos)
						if (table?.type.name !== 'table') continue
						const next = clampColumnWidths(explicitColumnWidths(table), available)
						if (next) changed = writeColumnWidths(tr, tr.doc, pos, next) || changed
					}
					if (changed) {
						tr.setMeta('addToHistory', false)
						view.dispatch(tr)
						return
					}
				}

				if (samePlans(plans, state.plans)) return
				const mark = signature(plans)
				const doc = view.state.doc
				const [older, newer] = recent
				if (
					older &&
					newer &&
					older.doc === doc &&
					newer.doc === doc &&
					older.mark === mark &&
					newer.mark !== mark
				) {
					return
				}
				recent = [...recent, { mark, doc }].slice(-2)

				const transaction = view.state.tr.setMeta(columnLayoutKey, plans)
				transaction.setMeta('addToHistory', false)
				view.dispatch(transaction)
			}

			schedule()
			clones.sync()

			return {
				update: (_view, previous) => {
					const before = paginationKey.getState(previous)
					const after = paginationKey.getState(view.state)
					const layout = columnLayoutKey.getState(previous) !== columnLayoutKey.getState(view.state)
					if (!previous.doc.eq(view.state.doc) || before !== after || layout) schedule()
					clones.sync()
				},
				destroy: () => {
					if (frame) cancelAnimationFrame(frame)
					observer.disconnect()
					clones.destroy()
					detachPrint()
				},
			}
		},
	})
}

export const ColumnExtension = Extension.create({
	name: 'columnExtension',

	addExtensions() {
		return [Columns, LegacyColumn]
	},

	addProseMirrorPlugins() {
		return [
			columnLayoutPlugin(),
			columnPointerPlugin((state) => columnLayoutKey.getState(state)?.plans ?? []),
		]
	},
})
