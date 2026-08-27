import { type CommandProps, mergeAttributes, Node } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import type { EditorState, Transaction } from '@tiptap/pm/state'
import { DEFAULT_PAGE_SETUP, type PageSetup } from './page-geometry'
export const SECTION_BREAK_NODE = 'sectionBreak'

export interface SectionBreakAttrs {
	pageSetup: Partial<PageSetup> | null
	columns: { count: number; gap?: number } | null
	continuous?: boolean
}

export interface SectionSpan {
	pos: number
	setup: PageSetup
	columns: { count: number; gap?: number } | null
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
				range: { from: number; to?: number },
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

export const SectionBreak = Node.create({
	name: SECTION_BREAK_NODE,

	group: 'block',
	atom: true,
	selectable: true,

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
				'aria-label': node.attrs.continuous ? 'Pembatas section menerus' : 'Pembatas section',
			}),
		]
	},

	addCommands() {
		return {
			setSectionBreak:
				(attrs) =>
				({ chain, state }) => {
					const atEnd = state.selection.to >= state.doc.content.size - 1
					const node = {
						type: this.name,
						attrs: {
							pageSetup: attrs?.pageSetup ?? null,
							columns: attrs?.columns ?? null,
							continuous: attrs?.continuous ?? false,
						},
					}
					const content = atEnd ? [node, { type: 'paragraph' }] : [node]
					return chain().insertContent(content).run()
				},
			applySectionSetup:
				(patch, range, baseSetup = DEFAULT_PAGE_SETUP) =>
				({ tr, dispatch, state }) =>
					encloseSection({ tr, dispatch, state }, range, baseSetup, (before) => ({
						open: { pageSetup: patch, columns: before.columns ?? null },
						close: { pageSetup: before.setup, columns: before.columns ?? null },
					})),
			applySectionColumns:
				(columns, range, baseSetup = DEFAULT_PAGE_SETUP) =>
				({ tr, dispatch, state }) =>
					encloseSection({ tr, dispatch, state }, range, baseSetup, (before) => ({
						open: { pageSetup: null, columns },
						close: { pageSetup: null, columns: before.columns ?? null },
					})),

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

function enclosingColumnSpan(
	spans: readonly SectionSpan[],
	from: number,
	docSize: number,
): SectionSpan | null {
	const columned = spans.slice(1).filter((span) => (span.columns?.count ?? 0) >= 2)
	const candidate = columned.filter((span) => span.pos <= from).pop()
	if (!candidate) return null
	const next = spans[spans.indexOf(candidate) + 1]
	return from < (next?.pos ?? docSize) ? candidate : null
}

export function setSectionColumnsCommand(
	state: EditorState,
	tr: Transaction,
	dispatch: ((tr: Transaction) => void) | undefined,
	count: number,
): boolean {
	if (!Number.isFinite(count) || count < 2) return false

	const spans = sectionSpans(state.doc)
	const enclosing = enclosingColumnSpan(spans, state.selection.from, state.doc.content.size)
	if (enclosing) {
		if (!dispatch) return true
		const node = state.doc.nodeAt(enclosing.pos)
		if (!node) return false
		const columns = { ...(node.attrs.columns as SectionBreakAttrs['columns']), count }
		tr.setNodeMarkup(enclosing.pos, undefined, { ...node.attrs, columns })
		return true
	}
	const { $from, $to } = state.selection
	const from = $from.depth >= 1 ? $from.before(1) : 0
	const to = $to.depth >= 1 ? $to.after(1) : state.doc.content.size

	return encloseSection({ tr, dispatch, state }, { from, to }, DEFAULT_PAGE_SETUP, (before) => ({
		open: { pageSetup: null, columns: { count }, continuous: true },
		close: { pageSetup: null, columns: before.columns ?? null, continuous: true },
	}))
}

export function unsetSectionColumnsCommand(
	state: EditorState,
	tr: Transaction,
	dispatch: ((tr: Transaction) => void) | undefined,
): boolean {
	const spans = sectionSpans(state.doc)
	const enclosing = enclosingColumnSpan(spans, state.selection.from, state.doc.content.size)
	if (!enclosing) return false
	if (!dispatch) return true

	const next = spans[spans.indexOf(enclosing) + 1]
	if (next) {
		const closing = state.doc.nodeAt(next.pos)
		if (closing) tr.delete(next.pos, next.pos + closing.nodeSize)
	}
	const open = state.doc.nodeAt(enclosing.pos)
	if (open) tr.delete(enclosing.pos, enclosing.pos + open.nodeSize)
	return true
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
