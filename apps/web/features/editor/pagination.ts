import { Extension } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view'
import { PAGE_BREAK_NODE } from './page-break'
import {
	PAGE_GAP,
	type PageGeometry,
	pageGeometry,
	type PageSetup,
	sameSheetGeometry,
	type SheetGeometry,
} from './page-geometry'
import { SECTION_BREAK_NODE, columnRegions, sectionSpans } from './section-break'

export const paginationKey = new PluginKey<PaginationState>('pagination')
export type SpacerKind = 'block' | 'row'

export interface Spacer {
	pos: number
	height: number
	kind: SpacerKind
	columns?: number
	headerPos?: number
}

export interface Measurement {
	pos: number
	top: number
	bottom: number
	isBreak: boolean
	isSectionBreak?: boolean
	kind: SpacerKind
	columns?: number
	headerPos?: number
	headerHeight?: number
	selfPaginate?: boolean
	internal?: number
}

interface PaginationState {
	spacers: Spacer[]
	decorations: DecorationSet
	pageCount: number
	geometry: PageGeometry
	setup?: PageSetup
	sheets: SheetGeometry[]
	marginAdjustments: MarginAdjustment[]
	blockPages: BlockPage[]
	blockSections: { pos: number; section: number }[]
	pageless: boolean
}

export interface PaginationOptions {
	geometry: PageGeometry
	setup?: PageSetup
	onPageCountChange?: (pageCount: number) => void
	onSheetsChange?: (sheets: SheetGeometry[]) => void
	onSectionsChange?: (setups: PageSetup[]) => void
	pageless?: boolean
}
export interface PaginationMeta {
	spacers?: Spacer[]
	pageCount?: number
	sheets?: SheetGeometry[]
	marginAdjustments?: MarginAdjustment[]
	blockPages?: BlockPage[]
	blockSections?: { pos: number; section: number }[]
	geometry?: PageGeometry
	setup?: PageSetup
	pageless?: boolean
}
function measureBlocks(view: EditorView): Measurement[] {
	const inserted = insertedHeights(view)
	const measurements: Measurement[] = []
	let cumulative = 0
	const setup = paginationKey.getState(view.state)?.setup
	const regions = setup ? columnRegions(view.state.doc, setup) : []

	view.state.doc.forEach((node, offset) => {
		cumulative += inserted.get(offset) ?? 0

		const region = regions.find((entry) => offset >= entry.from && offset < entry.to)
		if (region) {
			if (offset !== region.from) return

			const placeholder = view.dom.querySelector(`[${REGION_SPACE_ATTRIBUTE}="${region.from}"]`)
			if (placeholder instanceof HTMLElement) {
				const top = placeholder.offsetTop - cumulative
				const internal = Number(placeholder.getAttribute(REGION_SHEET_GAP_ATTRIBUTE)) || 0
				cumulative += internal
				measurements.push({
					pos: offset,
					top,
					bottom: top + placeholder.offsetHeight,
					isBreak: false,
					kind: 'block',
					selfPaginate: true,
					internal,
				})
				return
			}
		}

		const dom = view.nodeDOM(offset)
		if (!(dom instanceof HTMLElement)) return
		const top = dom.offsetTop - cumulative

		if (node.type.name === 'table') {
			cumulative = measureTable(view, node, offset, top, dom, cumulative, inserted, measurements)
			return
		}

		if (dom.hasAttribute(SELF_PAGINATE_ATTRIBUTE)) {
			let internal = 0
			for (const element of dom.querySelectorAll<HTMLElement>(`[${SPACER_ATTRIBUTE}]`)) {
				internal += element.offsetHeight
			}
			cumulative += internal
			measurements.push({
				pos: offset,
				top,
				bottom: top + dom.offsetHeight,
				isBreak: false,
				kind: 'block',
				selfPaginate: true,
				internal,
			})
			return
		}

		measurements.push({
			pos: offset,
			top,
			bottom: top + dom.offsetHeight,
			isBreak: node.type.name === PAGE_BREAK_NODE,
			isSectionBreak: node.type.name === SECTION_BREAK_NODE || undefined,
			kind: 'block',
		})
	})

	return measurements
}
function measureTable(
	view: EditorView,
	table: PMNode,
	tablePos: number,
	tableTop: number,
	tableDom: HTMLElement,
	cumulativeAtTable: number,
	inserted: Map<number, number>,
	out: Measurement[],
): number {
	let cumulative = cumulativeAtTable

	const headerRow = table.firstChild
	const hasHeader = headerRow?.firstChild?.type.name === 'tableHeader'
	const repeat = hasHeader && table.attrs.repeatHeader !== false
	const columns = headerRow?.childCount ?? 1
	const headerPos = repeat ? tablePos + 1 : undefined

	let headerHeight = 0
	let isFirstRow = true

	table.forEach((_row, rowOffset) => {
		const rowPos = tablePos + 1 + rowOffset
		cumulative += inserted.get(rowPos) ?? 0

		const rowDom = view.nodeDOM(rowPos)
		if (!(rowDom instanceof HTMLElement)) return
		const top = tableDom.offsetTop + rowDom.offsetTop - cumulative
		const bottom = top + rowDom.offsetHeight

		if (isFirstRow) {
			isFirstRow = false
			headerHeight = rowDom.offsetHeight
			out.push({ pos: tablePos, top: tableTop, bottom, isBreak: false, kind: 'block' })
			return
		}

		out.push({
			pos: rowPos,
			top,
			bottom,
			isBreak: false,
			kind: 'row',
			columns,
			headerPos,
			headerHeight: repeat ? headerHeight : 0,
		})
	})

	return cumulative
}
export const SPACER_ATTRIBUTE = 'data-spacer-for'
export const REGION_SPACE_ATTRIBUTE = 'data-columns-region'
export const REGION_SHEET_GAP_ATTRIBUTE = 'data-sheet-gap'
export const SELF_PAGINATE_ATTRIBUTE = 'data-self-paginate'
function insertedHeights(view: EditorView): Map<number, number> {
	const heights = new Map<number, number>()

	for (const element of view.dom.querySelectorAll<HTMLElement>(`[${SPACER_ATTRIBUTE}]`)) {
		if (element.closest(`[${SELF_PAGINATE_ATTRIBUTE}]`)) continue
		const pos = Number(element.getAttribute(SPACER_ATTRIBUTE))
		if (Number.isNaN(pos)) continue
		heights.set(pos, (heights.get(pos) ?? 0) + element.offsetHeight)
	}

	return heights
}
export interface SectionGeometry {
	pos: number
	geometry: PageGeometry
	continuous?: boolean
}
export interface BlockPage {
	pos: number
	page: number
}
export function pageOfPos(blockPages: readonly BlockPage[], pos: number): number | null {
	let page: number | null = null
	for (const block of blockPages) {
		if (block.pos > pos) break
		page = block.page
	}
	return page
}
export function pageBlockRange(
	blockPages: readonly BlockPage[],
	page: number,
	docSize: number,
): { from: number; to: number } | null {
	const first = blockPages.find((block) => block.page === page)
	if (!first) return null
	const next = blockPages.find((block) => block.page > page)
	return { from: first.pos, to: next?.pos ?? docSize }
}
export function computeSpacers(
	blocks: readonly Measurement[],
	geometry: PageGeometry,
	sections: readonly SectionGeometry[] = [],
): { spacers: Spacer[]; pageCount: number; sheets: SheetGeometry[]; blockPages: BlockPage[] } {
	const spacers: Spacer[] = []
	const blockPages: BlockPage[] = []
	let cumulative = 0
	let pageStart = 0
	let forceNext = false
	let pendingGeometry: PageGeometry | null = null

	const baseMargins = geometry.margins
	const sheets: SheetGeometry[] = [{ ...geometry, index: 0, top: 0 }]
	const contentTop = (sheet: SheetGeometry) => sheet.top + sheet.margins.top - baseMargins.top
	const pushSheet = (): SheetGeometry => {
		const last = sheets[sheets.length - 1]
		const next: SheetGeometry = {
			...(pendingGeometry ?? last),
			index: sheets.length,
			top: last.top + last.height + PAGE_GAP,
		}
		sheets.push(next)
		pendingGeometry = null
		return next
	}

	for (const block of blocks) {
		if (block.isSectionBreak) {
			blockPages.push({ pos: block.pos, page: sheets.length - 1 })
			const section = sections.find((section) => section.pos === block.pos)
			if (!section?.continuous) {
				forceNext = true
				pendingGeometry = section?.geometry ?? null
			}
			continue
		}

		const sheet = sheets[sheets.length - 1]
		const isFirstOnPage = block.top <= pageStart + 0.5
		const overflows = block.bottom > pageStart + sheet.contentHeight

		if (block.selfPaginate) {
			if (forceNext && !isFirstOnPage) {
				const target = contentTop(pushSheet())
				const spacerHeight = Math.max(0, target - (block.top + cumulative))
				spacers.push({ pos: block.pos, height: spacerHeight, kind: block.kind })
				cumulative += spacerHeight
			}

			blockPages.push({ pos: block.pos, page: sheets.length - 1 })
			const canvasBottom = block.bottom + cumulative + baseMargins.top
			while (nextContentTop() < canvasBottom - 0.5) pushSheet()
			cumulative += block.internal ?? 0
			pageStart = contentTop(sheets[sheets.length - 1]) - cumulative

			forceNext = false
			continue
		}

		if ((overflows || forceNext) && !isFirstOnPage) {
			const target = contentTop(pushSheet())
			const spacerHeight = Math.max(0, target - (block.top + cumulative))
			const headerHeight = block.headerHeight ?? 0

			spacers.push({
				pos: block.pos,
				height: spacerHeight,
				kind: block.kind,
				columns: block.columns,
				headerPos: headerHeight > 0 ? block.headerPos : undefined,
			})
			cumulative += spacerHeight + headerHeight
			pageStart = block.top - headerHeight
		}
		if (block.kind === 'block') blockPages.push({ pos: block.pos, page: sheets.length - 1 })

		forceNext = block.isBreak
		const canvasBottom = block.bottom + cumulative + baseMargins.top
		const before = sheets.length
		while (nextContentTop() < canvasBottom - 0.5) pushSheet()

		if (sheets.length > before) {
			forceNext = true
		}
	}
	if (blocks[blocks.length - 1]?.isBreak) pushSheet()

	return { spacers, pageCount: sheets.length, sheets, blockPages }
	function nextContentTop(): number {
		const last = sheets[sheets.length - 1]
		return last.top + last.height + PAGE_GAP + (pendingGeometry ?? last).margins.top
	}
}

function sameBlockPages(a: readonly BlockPage[], b: readonly BlockPage[]): boolean {
	return (
		a.length === b.length &&
		a.every((entry, index) => entry.pos === b[index].pos && entry.page === b[index].page)
	)
}

function sameSpacers(a: readonly Spacer[], b: readonly Spacer[]): boolean {
	return (
		a.length === b.length &&
		a.every((spacer, index) => {
			const other = b[index]
			return (
				spacer.pos === other.pos &&
				spacer.kind === other.kind &&
				spacer.headerPos === other.headerPos &&
				Math.abs(spacer.height - other.height) < 1
			)
		})
	)
}
function sameSheets(a: readonly SheetGeometry[], b: readonly SheetGeometry[]): boolean {
	return (
		a.length === b.length &&
		a.every((sheet, index) => {
			const other = b[index]
			return sheet.top === other.top && sheet.width === other.width && sheet.height === other.height
		})
	)
}
export interface MarginAdjustment {
	pos: number
	left: number
	right: number
}
export function marginAdjustments(
	blockPositions: readonly number[],
	spans: readonly { pos: number; width: number; margins: PageSetup['margins'] }[],
	canvasWidth: number,
	baseMargins: PageSetup['margins'],
): MarginAdjustment[] {
	const adjustments: MarginAdjustment[] = []

	for (const pos of blockPositions) {
		let span = spans[0]
		for (const candidate of spans) {
			if (candidate.pos > pos) break
			span = candidate
		}
		if (!span) continue

		const center = (canvasWidth - span.width) / 2
		const left = center + span.margins.left - baseMargins.left
		const right = center + span.margins.right - baseMargins.right
		if (Math.abs(left) < 0.5 && Math.abs(right) < 0.5) continue
		adjustments.push({ pos, left: Math.round(left), right: Math.round(right) })
	}

	return adjustments
}
export function blockSections(
	blockPositions: readonly number[],
	sections: readonly { pos: number; name: number }[],
): { pos: number; section: number }[] {
	return blockPositions.map((pos) => {
		let section = 0
		for (const entry of sections) {
			if (entry.pos > pos) break
			section = entry.name
		}
		return { pos, section }
	})
}

function sameBlockSections(
	a: readonly { pos: number; section: number }[],
	b: readonly { pos: number; section: number }[],
): boolean {
	return (
		a.length === b.length &&
		a.every((entry, index) => entry.pos === b[index].pos && entry.section === b[index].section)
	)
}
function sameSetups(a: readonly PageSetup[], b: readonly PageSetup[]): boolean {
	return a.length === b.length && a.every((setup, index) => JSON.stringify(setup) === JSON.stringify(b[index]))
}

function sameAdjustments(a: readonly MarginAdjustment[], b: readonly MarginAdjustment[]): boolean {
	return (
		a.length === b.length &&
		a.every((adjustment, index) => {
			const other = b[index]
			return adjustment.pos === other.pos && adjustment.left === other.left && adjustment.right === other.right
		})
	)
}

function buildDecorations(
	doc: PMNode,
	spacers: readonly Spacer[],
	adjustments: readonly MarginAdjustment[] = [],
	sections: readonly { pos: number; section: number }[] = [],
): DecorationSet {
	const decorations: Decoration[] = []
	for (const entry of sections) {
		const node = doc.nodeAt(entry.pos)
		if (!node) continue
		decorations.push(
			Decoration.node(entry.pos, entry.pos + node.nodeSize, {
				class: `document-section-${entry.section}`,
			}),
		)
	}
	for (const adjustment of adjustments) {
		const node = doc.nodeAt(adjustment.pos)
		if (!node) continue
		decorations.push(
			Decoration.node(adjustment.pos, adjustment.pos + node.nodeSize, {
				style: `margin-left:${adjustment.left}px;margin-right:${adjustment.right}px`,
			}),
		)
	}

	for (const spacer of spacers) {
		const key = `${spacer.pos}-${Math.round(spacer.height)}`

		if (spacer.kind === 'block') {
			decorations.push(
				Decoration.widget(spacer.pos, () => blockSpacer(spacer), {
					side: -1,
					key: `page-break-${key}`,
				}),
			)
			continue
		}
		decorations.push(
			Decoration.widget(spacer.pos, () => rowSpacer(spacer), {
				side: -2,
				key: `page-break-row-${key}`,
			}),
		)

		if (spacer.headerPos !== undefined) {
			const header = doc.nodeAt(spacer.headerPos)
			if (header) {
				decorations.push(
					Decoration.widget(spacer.pos, () => repeatedHeader(header, spacer), {
						side: -1,
						key: `table-header-${key}`,
					}),
				)
			}
		}
	}

	return DecorationSet.create(doc, decorations)
}

function markSpacer(element: HTMLElement, spacer: Spacer): HTMLElement {
	element.setAttribute(SPACER_ATTRIBUTE, String(spacer.pos))
	element.setAttribute('aria-hidden', 'true')
	element.contentEditable = 'false'
	return element
}

function blockSpacer(spacer: Spacer): HTMLElement {
	const element = document.createElement('div')
	element.className = 'page-break-spacer'
	element.style.height = `${spacer.height}px`
	return markSpacer(element, spacer)
}
export function rowSpacer(spacer: Spacer): HTMLElement {
	const row = document.createElement('tr')
	row.className = 'page-break-row'
	row.style.height = `${spacer.height}px`

	const cell = document.createElement('td')
	cell.colSpan = spacer.columns ?? 1
	row.appendChild(cell)

	return markSpacer(row, spacer)
}
export function repeatedHeader(header: PMNode, spacer: Spacer): HTMLElement {
	const row = document.createElement('tr')
	row.className = 'table-header-repeat'

	header.forEach((cell) => {
		const th = document.createElement('th')
		th.textContent = cell.textContent
		row.appendChild(th)
	})

	return markSpacer(row, spacer)
}
export const Pagination = Extension.create<PaginationOptions>({
	name: 'pagination',

	addOptions() {
		return { geometry: pageGeometry() }
	},

	addProseMirrorPlugins() {
		const { geometry, onPageCountChange, onSheetsChange, onSectionsChange } = this.options

		return [
			new Plugin<PaginationState>({
				key: paginationKey,

				state: {
					init: () => ({
						spacers: [],
						decorations: DecorationSet.empty,
						pageCount: 1,
						geometry,
						setup: this.options.setup,
						sheets: [],
						marginAdjustments: [],
						blockPages: [],
						blockSections: [],
						pageless: this.options.pageless ?? false,
					}),

					apply(tr, current, _old, newState) {
						const incoming = tr.getMeta(paginationKey) as PaginationMeta | undefined

						if (incoming) {
							if (incoming.pageless !== undefined && incoming.pageless !== current.pageless) {
								return {
									...current,
									pageless: incoming.pageless,
									geometry: incoming.geometry ?? current.geometry,
									setup: incoming.setup ?? current.setup,
									spacers: incoming.pageless ? [] : current.spacers,
									decorations: incoming.pageless ? DecorationSet.empty : current.decorations,
								}
							}
							if (!incoming.spacers) {
								return {
									...current,
									geometry: incoming.geometry ?? current.geometry,
									setup: incoming.setup ?? current.setup,
								}
							}

							return {
								geometry: incoming.geometry ?? current.geometry,
								setup: incoming.setup ?? current.setup,
								pageless: current.pageless,
								spacers: incoming.spacers,
								pageCount: incoming.pageCount ?? current.pageCount,
								sheets: incoming.sheets ?? current.sheets,
								marginAdjustments: incoming.marginAdjustments ?? current.marginAdjustments,
								blockPages: incoming.blockPages ?? current.blockPages,
								blockSections: incoming.blockSections ?? current.blockSections,
								decorations: buildDecorations(
									newState.doc,
									incoming.spacers,
									incoming.marginAdjustments ?? current.marginAdjustments,
									incoming.blockSections ?? current.blockSections,
								),
							}
						}
						if (tr.docChanged) {
							return { ...current, decorations: current.decorations.map(tr.mapping, tr.doc) }
						}
						return current
					},
				},

				props: {
					decorations: (state) => paginationKey.getState(state)?.decorations,
				},

				view(view) {
					let frame = 0
					let reportedPageCount = 0
					let reportedPrintSetups: PageSetup[] = []

					const recalculate = () => {
						frame = 0
						const state = paginationKey.getState(view.state)
						if (!state) return
						if (state.pageless) {
							if (state.spacers.length > 0 || state.pageCount !== 1) {
								const transaction = view.state.tr.setMeta(paginationKey, { spacers: [], pageCount: 1 })
								transaction.setMeta('addToHistory', false)
								view.dispatch(transaction)
							}
							if (reportedPageCount !== 1) {
								reportedPageCount = 1
								onPageCountChange?.(1)
							}
							return
						}

						const blocks = measureBlocks(view)
						const spans = state.setup ? sectionSpans(view.state.doc, state.setup) : []
						const continuous = spans.map((span, index) => {
							if (index === 0) return false
							const node = view.state.doc.nodeAt(span.pos)
							return (
								node?.attrs.continuous === true &&
								sameSheetGeometry(span.setup, spans[index - 1].setup)
							)
						})
						const sections = spans
							.slice(1)
							.map((span, index) => ({
								pos: span.pos,
								geometry: pageGeometry(span.setup),
								continuous: continuous[index + 1],
							}))
						const { spacers, pageCount, sheets, blockPages } = computeSpacers(
						blocks,
						state.geometry,
						sections,
					)
						const adjustments = state.setup
							? marginAdjustments(
									blocks.filter((block) => block.kind === 'block').map((block) => block.pos),
									spans.map((span) => ({
										pos: span.pos,
										width: pageGeometry(span.setup).width,
										margins: span.setup.margins,
									})),
									Math.max(...sheets.map((sheet) => sheet.width)),
									state.geometry.margins,
								)
							: []
						const printSetups: PageSetup[] = spans.length > 0 ? [spans[0].setup] : []
						const pageNames: number[] = []
						spans.forEach((span, index) => {
							if (index > 0 && !continuous[index]) printSetups.push(span.setup)
							pageNames.push(printSetups.length - 1)
						})
						const sectionsOfBlocks =
							spans.length > 1
								? blockSections(
										blocks.filter((block) => block.kind === 'block').map((block) => block.pos),
										spans.map((span, index) => ({ pos: span.pos, name: pageNames[index] })),
									)
								: []
						if (
							!sameSpacers(spacers, state.spacers) ||
							pageCount !== state.pageCount ||
							!sameAdjustments(adjustments, state.marginAdjustments) ||
							!sameBlockPages(blockPages, state.blockPages) ||
							!sameBlockSections(sectionsOfBlocks, state.blockSections)
						) {
							const transaction = view.state.tr.setMeta(paginationKey, {
								spacers,
								pageCount,
								sheets,
								marginAdjustments: adjustments,
								blockPages,
								blockSections: sectionsOfBlocks,
							})
							transaction.setMeta('addToHistory', false)
							view.dispatch(transaction)
						}

						if (pageCount !== reportedPageCount) {
							reportedPageCount = pageCount
							onPageCountChange?.(pageCount)
						}

						if (!sameSheets(sheets, state.sheets)) {
							onSheetsChange?.(sheets)
						}
						if (!sameSetups(printSetups, reportedPrintSetups)) {
							reportedPrintSetups = printSetups
							onSectionsChange?.(printSetups)
						}
					}

					const schedule = () => {
						if (frame) return
						frame = requestAnimationFrame(recalculate)
					}

					schedule()
					const observer = new ResizeObserver(schedule)
					observer.observe(view.dom)

					return {
						update: (_updatedView, previous) => {
							const before = paginationKey.getState(previous)
							const after = paginationKey.getState(view.state)
							if (!previous.doc.eq(view.state.doc) || before?.geometry !== after?.geometry) {
								schedule()
							}
						},
						destroy: () => {
							if (frame) cancelAnimationFrame(frame)
							observer.disconnect()
						},
					}
				},
			}),
		]
	},
})
