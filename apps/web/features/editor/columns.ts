import { Extension, mergeAttributes, Node } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import { type EditorState, Plugin, PluginKey, type Transaction } from '@tiptap/pm/state'
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view'
import { PAGE_BREAK_NODE } from './page-break'
import { type PageGeometry, pageGeometry } from './page-geometry'
import {
	paginationKey,
	REGION_SHEET_GAP_ATTRIBUTE,
	REGION_SPACE_ATTRIBUTE,
	repeatedHeader,
	rowSpacer,
	SELF_PAGINATE_ATTRIBUTE,
	SPACER_ATTRIBUTE,
	type Spacer,
} from './pagination'
import { columnRegions, SECTION_BREAK_NODE, type SectionBreakAttrs, sectionSpans } from './section-break'
import { clampColumnWidths, explicitColumnWidths, writeColumnWidths } from './table-ops'
const MIN_COLUMNS = 2

export const COLUMNS_NODE = 'columns'

declare module '@tiptap/core' {
	interface Commands<ReturnType> {
		columns: {
			setColumns: (count: number) => ReturnType
			unsetColumns: () => ReturnType
			setColumnsLayout: (pos: number, patch: { gap?: number; widths?: number[] | null }) => ReturnType
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
			setColumnsLayout:
				(pos, patch) =>
				({ tr, dispatch }) => {
					const node = tr.doc.nodeAt(pos)
					if (!node || node.type.name !== this.name) return false
					if (dispatch) tr.setNodeMarkup(pos, undefined, { ...node.attrs, ...patch })
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
		node.content.forEach((child) => children.push(child))
		tr.replaceWith(pos, pos + node.nodeSize, [open, ...children, close])
	}

	tr.setMeta('addToHistory', false)
	return tr
}

export interface ColumnItem {
	pos: number
	height: number
	marginTop: number
	marginBottom: number
	keepWithNext: boolean
	span?: boolean
	table?: ColumnTable
	isBreak?: boolean
}

export interface ColumnTable {
	rows: readonly { pos: number; top: number; height: number }[]
	columns: number
	header?: { pos: number; height: number }
}

export interface TableCut {
	pos: number
	spacerHeight: number
	headerHeight: number
	headerPos?: number
	columns: number
}

export interface ColumnFrame {
	top: number
	count: number
	columnWidth: number
	columnGap: number
	columns?: readonly { left: number; width: number }[]
	sheetOrigin?: number
}

export function resolveColumnSlots(
	width: number,
	count: number,
	gap: number,
	widths: readonly number[] | null,
): { left: number; width: number }[] {
	const natural = width - gap * (count - 1)
	if (!(natural > 0) || count < 1) return []

	if (!widths || widths.length !== count || widths.some((value) => !(value > 0))) {
		const columnWidth = natural / count
		return Array.from({ length: count }, (_, index) => ({
			left: index * (columnWidth + gap),
			width: columnWidth,
		}))
	}

	const sum = widths.reduce((total, value) => total + value, 0)
	const scale = sum > 0 ? natural / sum : 1
	let left = 0
	return widths.map((value) => {
		const slot = { left, width: value * scale }
		left += slot.width + gap
		return slot
	})
}

export interface ColumnPlacement {
	pos: number
	top: number
	left: number
	width: number
	cuts?: readonly TableCut[]
	span?: boolean
}

export interface ColumnFlow {
	placements: ColumnPlacement[]
	height: number
	sheetGap: number
}

export function flowColumns(
	items: readonly ColumnItem[],
	{ top, count, columnWidth, columnGap, columns, sheetOrigin = 0 }: ColumnFrame,
	{ contentHeight, pageStride }: Pick<PageGeometry, 'contentHeight' | 'pageStride'>,
): ColumnFlow {
	if (items.length === 0 || count < 1 || contentHeight <= 0) {
		return { placements: [], height: 0, sheetGap: 0 }
	}

	const sheetTop = (page: number) => sheetOrigin + page * pageStride
	const sheetBottom = (page: number) => sheetOrigin + page * pageStride + contentHeight
	let page = Math.max(0, Math.floor((top - sheetOrigin) / pageStride))
	if (top >= sheetBottom(page)) page += 1

	const firstPage = page
	const firstTop = Math.max(top, sheetTop(firstPage))
	const regionTop = (sheet: number) => (sheet === firstPage ? firstTop : sheetTop(sheet))
	const regionHeight = (sheet: number) => sheetBottom(sheet) - regionTop(sheet)

	const slots: {
		page: number
		column: number
		top: number
		height: number
		cuts?: readonly TableCut[]
		span?: boolean
	}[] = []
	const blockedUntil: number[] = Array.from({ length: count }, () => 0)
	let column = 0

	const advance = () => {
		column += 1
		if (column >= count) {
			column = 0
			page += 1
		}
	}
	const placeSpanner = (item: ColumnItem) => {
		let water = firstTop
		for (const slot of slots) water = Math.max(water, slot.top + slot.height)
		for (const until of blockedUntil) water = Math.max(water, until)

		let spanPage = Math.floor(water / pageStride)
		if (water >= sheetBottom(spanPage)) spanPage += 1
		let spanTop = Math.max(water, sheetTop(spanPage))
		if (spanTop + item.height > sheetBottom(spanPage) + 0.5 && spanTop > sheetTop(spanPage) + 0.5) {
			spanPage += 1
			spanTop = sheetTop(spanPage)
		}

		const bottom = spanTop + item.height
		slots.push({ page: spanPage, column: 0, top: spanTop, height: item.height, span: true })
		blockedUntil.fill(bottom)
		page = Math.floor(bottom / pageStride)
		if (bottom >= sheetBottom(page)) page += 1
		column = 0
	}
	const breakPage = () => {
		page += 1
		column = 0
	}

	let index = 0
	while (index < items.length) {
		if (items[index].span) {
			placeSpanner(items[index])
			index += 1
			continue
		}
		if (items[index].isBreak) {
			const fresh = column === 0 && !slots.some((slot) => slot.page === page && slot.height > 0)
			const base = Math.max(regionTop(page), blockedUntil[column])
			slots.push({ page, column, top: base, height: 0 })
			index += 1
			if (!fresh) breakPage()
			continue
		}

		const base = Math.max(regionTop(page), blockedUntil[column])
		const limit = sheetBottom(page) - base
		let tops = packColumn(items, index, limit)
		let giant = false

		if (tops.length === 0) {
			if (limit < contentHeight - 0.5) {
				advance()
				continue
			}
			if (!items[index].table) {
				placeSpanner(items[index])
				index += 1
				continue
			}
			tops = [0]
			giant = true
		}

		for (const [offsetIndex, offset] of tops.entries()) {
			const item = items[index + offsetIndex]
			const slot: (typeof slots)[number] = { page, column, top: base + offset, height: item.height }
			if (giant && item.table) {
				const cut = cutTableRows(item.table, slot.top - sheetOrigin, page, { contentHeight, pageStride })
				slot.height = cut.bottom + sheetOrigin - slot.top
				if (cut.cuts.length > 0) slot.cuts = cut.cuts
				blockedUntil[column] = cut.bottom + sheetOrigin
			}
			slots.push(slot)
		}
		index += tops.length

		if (index < items.length) advance()
	}
	const lastPage = page
	const spillOnLastPage = blockedUntil.some((until) => until > regionTop(lastPage) + 0.5)
	const spanOnLastPage = slots.some((slot) => slot.page === lastPage && slot.span)
	const firstOnLastPage = slots.findIndex((slot) => slot.page === lastPage)
	if (firstOnLastPage >= 0 && !spillOnLastPage && !spanOnLastPage) {
		const balanced = balanceColumns(items.slice(firstOnLastPage), regionHeight(lastPage), count)
		if (balanced) {
			const base = regionTop(lastPage)
			balanced.forEach((placement, offset) => {
				slots[firstOnLastPage + offset] = {
					page: lastPage,
					column: placement.column,
					top: base + placement.top,
					height: items[firstOnLastPage + offset].height,
				}
			})
		}
	}
	let bottom = firstTop
	for (const slot of slots) {
		bottom = Math.max(bottom, slot.top + slot.height)
	}
	const sheets = Math.max(0, Math.ceil((bottom - sheetBottom(firstPage)) / pageStride))

	return {
		placements: items.map((item, i) => ({
			pos: item.pos,
			top: slots[i].top - top,
			left: columns?.[slots[i].column]?.left ?? slots[i].column * (columnWidth + columnGap),
			width: columns?.[slots[i].column]?.width ?? columnWidth,
			cuts: slots[i].cuts,
			span: slots[i].span,
		})),
		height: Math.max(0, bottom - top),
		sheetGap: firstTop - top + sheets * (pageStride - contentHeight),
	}
}

export function cutTableRows(
	table: ColumnTable,
	base: number,
	page: number,
	{ contentHeight, pageStride }: Pick<PageGeometry, 'contentHeight' | 'pageStride'>,
): { cuts: TableCut[]; bottom: number } {
	const sheetTop = (p: number) => p * pageStride
	const sheetBottom = (p: number) => p * pageStride + contentHeight
	const headerHeight = table.header?.height ?? 0

	const cuts: TableCut[] = []
	let shift = 0
	let sheet = page

	for (const row of table.rows) {
		const top = base + shift + row.top
		while (top >= sheetTop(sheet + 1) - 0.5) sheet += 1
		if (top + row.height <= sheetBottom(sheet) + 0.5) continue
		if (top <= sheetTop(sheet) + 0.5) {
			continue
		}

		const target = sheetTop(sheet + 1)
		const spacerHeight = target - top
		cuts.push({
			pos: row.pos,
			spacerHeight,
			headerHeight,
			headerPos: headerHeight > 0 ? table.header?.pos : undefined,
			columns: table.columns,
		})
		shift += spacerHeight + headerHeight
		sheet += 1
	}

	const lastRow = table.rows[table.rows.length - 1]
	const bottom = lastRow ? base + shift + lastRow.top + lastRow.height : base
	return { cuts, bottom }
}

function packColumn(items: readonly ColumnItem[], from: number, limit: number): number[] {
	const tops: number[] = []
	let y = 0
	let previousBottom = 0

	for (let i = from; i < items.length; i++) {
		const item = items[i]
		if (item.span) break
		if (item.isBreak) break
		const spacing = i === from ? 0 : Math.max(previousBottom, item.marginTop)
		if (y + spacing + item.height > limit + 0.5) break

		const next = items[i + 1]
		if (item.keepWithNext && next && i > from) {
			const after = y + spacing + item.height
			if (after + Math.max(item.marginBottom, next.marginTop) + next.height > limit + 0.5) break
		}

		tops.push(y + spacing)
		y += spacing + item.height
		previousBottom = item.marginBottom
	}

	return tops
}

function balanceColumns(
	items: readonly ColumnItem[],
	limit: number,
	count: number,
): { column: number; top: number }[] | null {
	let best = fillColumns(items, limit, count)
	if (!best) return null

	let low = 0
	let high = limit
	while (high - low > 1) {
		const middle = (low + high) / 2
		const attempt = fillColumns(items, middle, count)
		if (attempt) {
			best = attempt
			high = middle
		} else {
			low = middle
		}
	}

	return best
}

function fillColumns(
	items: readonly ColumnItem[],
	limit: number,
	count: number,
): { column: number; top: number }[] | null {
	const placements: { column: number; top: number }[] = []
	let index = 0

	for (let column = 0; column < count && index < items.length; column++) {
		const tops = packColumn(items, index, limit)
		if (tops.length === 0) return null
		for (const top of tops) placements.push({ column, top })
		index += tops.length
	}

	return index === items.length ? placements : null
}

const KEEP_WITH_NEXT = new Set(['heading'])
const FALLBACK_COLUMN_GAP = 24

export const columnLayoutKey = new PluginKey<ColumnLayoutState>('columnLayout')

export interface ColumnsPlan {
	pos: number
	nodeSize: number
	height: number
	sheetGap: number
	region?: boolean
	items: {
		pos: number
		nodeSize: number
		top: number
		left: number
		right: number
		cuts?: readonly TableCut[]
		span?: boolean
	}[]
}

export interface ColumnLayoutState {
	plans: ColumnsPlan[]
	decorations: DecorationSet
}

function px(value: string): number {
	const parsed = Number.parseFloat(value)
	return Number.isFinite(parsed) ? parsed : 0
}

export function collapsedMargin(own: number, padding: number, border: number, child: number): number {
	if (own !== 0 || padding !== 0 || border !== 0) return own
	return child
}

function blockMargins(element: HTMLElement): { marginTop: number; marginBottom: number } {
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

export function columnGapOf(dom: HTMLElement): number {
	const parsed = Number.parseFloat(getComputedStyle(dom).columnGap)
	return Number.isFinite(parsed) ? parsed : FALLBACK_COLUMN_GAP
}

function measureTableItem(view: EditorView, table: PMNode, tablePos: number, dom: HTMLElement): ColumnItem {
	const inserted = new Map<number, number>()
	let insertedTotal = 0
	for (const element of dom.querySelectorAll<HTMLElement>(`[${SPACER_ATTRIBUTE}]`)) {
		const pos = Number(element.getAttribute(SPACER_ATTRIBUTE))
		if (Number.isNaN(pos)) continue
		inserted.set(pos, (inserted.get(pos) ?? 0) + element.offsetHeight)
		insertedTotal += element.offsetHeight
	}
	const headerRow = table.firstChild
	const repeat = headerRow?.firstChild?.type.name === 'tableHeader' && table.attrs.repeatHeader !== false

	const rows: { pos: number; top: number; height: number }[] = []
	let header: ColumnTable['header']
	let cumulative = 0

	table.forEach((row, rowOffset) => {
		const rowPos = tablePos + 1 + rowOffset
		cumulative += inserted.get(rowPos) ?? 0

		const rowDom = view.nodeDOM(rowPos)
		if (!(rowDom instanceof HTMLElement)) return
		rows.push({ pos: rowPos, top: rowDom.offsetTop - cumulative, height: rowDom.offsetHeight })
		if (repeat && rows.length === 1) header = { pos: rowPos, height: rowDom.offsetHeight }
	})

	return {
		pos: tablePos,
		height: dom.offsetHeight - insertedTotal,
		...blockMargins(dom),
		keepWithNext: false,
		table: { rows, columns: headerRow?.childCount ?? 1, header },
	}
}

interface TableWidthCorrection {
	pos: number
	available: number
}

function measureColumns(
	view: EditorView,
	geometry: PageGeometry,
): { plans: ColumnsPlan[]; elements: HTMLElement[]; corrections: TableWidthCorrection[] } {
	const plans: ColumnsPlan[] = []
	const elements: HTMLElement[] = []
	const corrections: TableWidthCorrection[] = []
	const collectTableCorrections = (flow: ColumnFlow, items: readonly ColumnItem[], fullWidth: number) => {
		flow.placements.forEach((placement, index) => {
			if (!items[index].table) return
			const table = view.state.doc.nodeAt(placement.pos)
			if (!table || table.type.name !== 'table') return
			const indent = Number(table.attrs.indentLeft) || 0
			const available = Math.max(0, (placement.span ? fullWidth : placement.width) - indent)
			if (clampColumnWidths(explicitColumnWidths(table), available)) {
				corrections.push({ pos: placement.pos, available })
			}
		})
	}
	const setup = paginationKey.getState(view.state)?.setup
	const regions = setup ? columnRegions(view.state.doc, setup) : []
	const regionItems = regions.map(() => ({ items: [] as ColumnItem[], sizes: [] as number[] }))

	view.state.doc.forEach((node, offset) => {
		const regionIndex = regions.findIndex((region) => offset >= region.from && offset < region.to)
		if (regionIndex >= 0) {
			const element = view.nodeDOM(offset)
			if (element instanceof HTMLElement) {
				elements.push(element)
				regionItems[regionIndex].items.push(
					node.type.name === 'table'
						? measureTableItem(view, node, offset, element)
						: {
								pos: offset,
								height: element.offsetHeight,
								...blockMargins(element),
								keepWithNext: KEEP_WITH_NEXT.has(node.type.name),
								span: element.classList.contains('columns-span') || undefined,
								isBreak: node.type.name === PAGE_BREAK_NODE || undefined,
							},
				)
				regionItems[regionIndex].sizes.push(node.nodeSize)
			}
			return
		}

		if (node.type.name !== COLUMNS_NODE) return

		const dom = view.nodeDOM(offset)
		if (!(dom instanceof HTMLElement)) return

		const count = Math.max(MIN_COLUMNS, Number(node.attrs.count) || MIN_COLUMNS)
		const width = dom.clientWidth
		const columnGap =
			typeof node.attrs.gap === 'number' && node.attrs.gap >= 0 ? node.attrs.gap : columnGapOf(dom)
		const slots = resolveColumnSlots(width, count, columnGap, node.attrs.widths ?? null)
		if (slots.length === 0) return

		const items: ColumnItem[] = []
		const sizes: number[] = []
		let childPos = offset + 1

		node.forEach((child) => {
			const element = view.nodeDOM(childPos)
			if (element instanceof HTMLElement) {
				elements.push(element)
				items.push(
					child.type.name === 'table'
						? measureTableItem(view, child, childPos, element)
						: {
								pos: childPos,
								height: element.offsetHeight,
								...blockMargins(element),
								keepWithNext: KEEP_WITH_NEXT.has(child.type.name),
								isBreak: child.type.name === PAGE_BREAK_NODE || undefined,
								span: element.classList.contains('columns-span') || undefined,
							},
				)
				sizes.push(child.nodeSize)
			}
			childPos += child.nodeSize
		})

		if (items.length === 0) return

		const flow = flowColumns(
			items,
			{ top: dom.offsetTop, count, columnWidth: slots[0].width, columnGap, columns: slots },
			geometry,
		)

		collectTableCorrections(flow, items, width)

		plans.push({
			pos: offset,
			nodeSize: node.nodeSize,
			height: flow.height,
			sheetGap: flow.sheetGap,
			items: flow.placements.map((placement, i) => ({
				pos: placement.pos,
				nodeSize: sizes[i],
				top: placement.top - items[i].marginTop,
				left: placement.span ? 0 : placement.left,
				right: placement.span ? 0 : width - placement.left - placement.width,
				cuts: placement.cuts,
				span: placement.span || undefined,
			})),
		})
	})
	regions.forEach((region, regionIndex) => {
		const { items, sizes } = regionItems[regionIndex]
		if (items.length === 0) return

		const columns = region.span.columns
		if (!columns) return
		const count = Math.max(MIN_COLUMNS, columns.count)
		const columnGap = typeof columns.gap === 'number' ? columns.gap : FALLBACK_COLUMN_GAP
		const placeholder = view.dom.querySelector(`[${REGION_SPACE_ATTRIBUTE}="${region.from}"]`)
		const anchor =
			placeholder instanceof HTMLElement
				? placeholder
				: (() => {
						const first = view.nodeDOM(region.from)
						return first instanceof HTMLElement ? first : null
					})()
		if (!anchor) return

		const top = anchor.offsetTop
		const left = anchor.offsetLeft
		const width = anchor.offsetWidth
		const parent = anchor.offsetParent
		const parentWidth = parent instanceof HTMLElement ? parent.clientWidth : left + width
		if (!(width > 0)) return

		const slots = resolveColumnSlots(width, count, columnGap, null)
		if (slots.length === 0) return

		const flow = flowColumns(
			items,
			{
				top,
				count,
				columnWidth: slots[0].width,
				columnGap,
				columns: slots,
				sheetOrigin: top,
			},
			pageGeometry(region.span.setup),
		)

		collectTableCorrections(flow, items, width)

		plans.push({
			pos: region.from,
			nodeSize: 0,
			height: flow.height,
			sheetGap: flow.sheetGap,
			region: true,
			items: flow.placements.map((placement, i) => ({
				pos: placement.pos,
				nodeSize: sizes[i],
				top: top + placement.top - items[i].marginTop,
				left: placement.span ? left : left + placement.left,
				right: placement.span
					? parentWidth - left - width
					: parentWidth - (left + placement.left) - placement.width,
				cuts: placement.cuts,
				span: placement.span || undefined,
			})),
		})
	})

	return { plans, elements, corrections }
}

function samePlans(a: readonly ColumnsPlan[], b: readonly ColumnsPlan[]): boolean {
	const near = (x: number, y: number) => Math.abs(x - y) < 0.5
	const sameCuts = (one?: readonly TableCut[], other?: readonly TableCut[]) =>
		(one?.length ?? 0) === (other?.length ?? 0) &&
		(one ?? []).every((cut, index) => {
			const twin = (other ?? [])[index]
			return (
				cut.pos === twin.pos &&
				near(cut.spacerHeight, twin.spacerHeight) &&
				near(cut.headerHeight, twin.headerHeight)
			)
		})

	return (
		a.length === b.length &&
		a.every((plan, index) => {
			const other = b[index]
			return (
				plan.pos === other.pos &&
				plan.nodeSize === other.nodeSize &&
				near(plan.height, other.height) &&
				near(plan.sheetGap, other.sheetGap) &&
				plan.items.length === other.items.length &&
				plan.items.every((item, i) => {
					const twin = other.items[i]
					return (
						item.pos === twin.pos &&
						near(item.top, twin.top) &&
						near(item.left, twin.left) &&
						near(item.right, twin.right) &&
						sameCuts(item.cuts, twin.cuts)
					)
				})
			)
		})
	)
}

function sheetGapElement(plan: ColumnsPlan): HTMLElement {
	const element = document.createElement('div')
	element.className = 'columns-sheet-gap'
	element.style.height = `${Math.round(plan.sheetGap)}px`
	element.setAttribute(SPACER_ATTRIBUTE, String(plan.pos))
	element.setAttribute('aria-hidden', 'true')
	element.contentEditable = 'false'
	return element
}

function regionSpaceElement(plan: ColumnsPlan): HTMLElement {
	const element = document.createElement('div')
	element.className = 'columns-region-space'
	element.style.height = `${Math.round(plan.height)}px`
	element.setAttribute(REGION_SPACE_ATTRIBUTE, String(plan.pos))
	element.setAttribute(REGION_SHEET_GAP_ATTRIBUTE, String(Math.round(plan.sheetGap)))
	element.setAttribute('aria-hidden', 'true')
	element.contentEditable = 'false'
	return element
}

function buildDecorations(doc: PMNode, plans: readonly ColumnsPlan[]): DecorationSet {
	const decorations: Decoration[] = []

	for (const plan of plans) {
		if (plan.region) {
			decorations.push(
				Decoration.widget(plan.pos, () => regionSpaceElement(plan), {
					side: -1,
					key: `columns-region-${plan.pos}-${Math.round(plan.height)}`,
				}),
			)
		} else {
			decorations.push(
				Decoration.node(plan.pos, plan.pos + plan.nodeSize, {
					class: 'columns-flowed',
					style: `height:${Math.round(plan.height)}px`,
				}),
			)
		}

		for (const item of plan.items) {
			decorations.push(
				Decoration.node(item.pos, item.pos + item.nodeSize, {
					class: item.span ? 'columns-item columns-span' : 'columns-item',
					style: `position:absolute;top:${Math.round(item.top)}px;left:${Math.round(
						item.left,
					)}px;right:${Math.round(item.right)}px`,
				}),
			)
			for (const cut of item.cuts ?? []) {
				const spacer: Spacer = { pos: cut.pos, height: cut.spacerHeight, kind: 'row', columns: cut.columns }
				decorations.push(
					Decoration.widget(cut.pos, () => rowSpacer(spacer), {
						side: -2,
						key: `columns-cut-${cut.pos}-${Math.round(cut.spacerHeight)}`,
					}),
				)

				if (cut.headerPos !== undefined && cut.headerHeight > 0) {
					const header = doc.nodeAt(cut.headerPos)
					if (header) {
						decorations.push(
							Decoration.widget(cut.pos, () => repeatedHeader(header, spacer), {
								side: -1,
								key: `columns-cut-header-${cut.pos}-${Math.round(cut.spacerHeight)}`,
							}),
						)
					}
				}
			}
		}
		if (!plan.region && plan.sheetGap > 0.5) {
			decorations.push(
				Decoration.widget(plan.pos + plan.nodeSize - 1, () => sheetGapElement(plan), {
					side: 1,
					key: `columns-gap-${plan.pos}-${Math.round(plan.sheetGap)}`,
				}),
			)
		}
	}

	return DecorationSet.create(doc, decorations)
}

function columnLayoutPlugin(): Plugin<ColumnLayoutState> {
	return new Plugin<ColumnLayoutState>({
		key: columnLayoutKey,

		state: {
			init: () => ({ plans: [], decorations: DecorationSet.empty }),

			apply(tr, current, _old, newState) {
				const incoming = tr.getMeta(columnLayoutKey) as ColumnsPlan[] | undefined
				if (incoming) {
					return { plans: incoming, decorations: buildDecorations(newState.doc, incoming) }
				}
				if (tr.docChanged) {
					return { ...current, decorations: current.decorations.map(tr.mapping, tr.doc) }
				}
				return current
			},
		},

		props: {
			decorations: (state) => columnLayoutKey.getState(state)?.decorations,
		},

		view(view) {
			let frame = 0

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
				const state = columnLayoutKey.getState(view.state)
				if (!state) return
				const pagination = paginationKey.getState(view.state)
				const measured =
					pagination && !pagination.pageless
						? measureColumns(view, pagination.geometry)
						: { plans: [], elements: [], corrections: [] }

				watch(measured.elements)
				if (measured.corrections.length > 0) {
					const tr = view.state.tr
					let changed = false
					for (const { pos, available } of measured.corrections) {
						const table = tr.doc.nodeAt(pos)
						if (!table || table.type.name !== 'table') continue
						const next = clampColumnWidths(explicitColumnWidths(table), available)
						if (next) changed = writeColumnWidths(tr, tr.doc, pos, next) || changed
					}
					if (changed) {
						tr.setMeta('addToHistory', false)
						view.dispatch(tr)
						return
					}
				}
				if (samePlans(measured.plans, state.plans)) return

				const transaction = view.state.tr.setMeta(columnLayoutKey, measured.plans)
				transaction.setMeta('addToHistory', false)
				view.dispatch(transaction)
			}

			schedule()

			return {
				update: schedule,
				destroy: () => {
					if (frame) cancelAnimationFrame(frame)
					observer.disconnect()
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
		return [columnLayoutPlugin()]
	},
})
