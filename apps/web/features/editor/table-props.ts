'use client'

import { type CommandProps, Extension } from '@tiptap/core'
import { Table, TableRow } from '@tiptap/extension-table'
import type { Node as PMNode } from '@tiptap/pm/model'
import { CellSelection, findTable, TableMap } from '@tiptap/pm/tables'
import type { Editor } from '@tiptap/react'
import { CustomTableCell, CustomTableHeader, NO_COLOR } from '@/features/editor/custom-table'
import { columnWidths, locateTable } from '@/features/editor/table-ops'

declare module '@tiptap/core' {
	interface Commands<ReturnType> {
		tableProps: {
			/** Table width in px; null restores automatic width. */
			setTableWidth: (width: number | null) => ReturnType
			/** Table-level default border; a null property clears it. */
			setTableBorder: (border: {
				color?: string | null
				width?: number | null
				style?: string | null
			}) => ReturnType
			/** Minimum height of the selected rows in px; null clears it. */
			setRowHeight: (height: number | null) => ReturnType
			/** cantSplit = row must not break across pages. */
			setRowCantSplit: (cantSplit: boolean) => ReturnType
			/** Padding of the selected cells (CSS shorthand, px values); null clears it. */
			setCellPadding: (padding: string | null) => ReturnType
			/** Vertical alignment of the selected cells; null restores the default. */
			setCellVerticalAlign: (align: 'top' | 'middle' | 'bottom' | null) => ReturnType
		}
	}
}

const VERTICAL_ALIGNS = new Set(['top', 'middle', 'bottom'])

function readPx(value: string | null | undefined): number | null {
	if (!value) return null
	const parsed = Number.parseFloat(value)
	return Number.isFinite(parsed) ? Math.round(parsed) : null
}

/** Cell attributes editable from the Table options panel. */
const cellPropsAttributes = {
	verticalAlign: {
		default: null,
		parseHTML: (element: HTMLElement) =>
			element.getAttribute('data-vertical-align') ?? (element.style.verticalAlign || null),
		renderHTML: (attributes: { verticalAlign?: string | null }) => {
			if (!attributes.verticalAlign) return {}
			return {
				'data-vertical-align': attributes.verticalAlign,
				style: `vertical-align: ${attributes.verticalAlign}`,
			}
		},
	},
	cellPadding: {
		default: null,
		parseHTML: (element: HTMLElement) =>
			element.getAttribute('data-cell-padding') ?? (element.style.padding || null),
		renderHTML: (attributes: { cellPadding?: string | null }) => {
			if (!attributes.cellPadding) return {}
			return {
				'data-cell-padding': attributes.cellPadding,
				style: `padding: ${attributes.cellPadding}`,
			}
		},
	},
	borderWidth: {
		default: null,
		parseHTML: (element: HTMLElement) =>
			readPx(element.getAttribute('data-border-width')) ?? readPx(element.style.borderWidth),
		renderHTML: (attributes: {
			borderWidth?: number | null
			borderStyle?: string | null
			borderColor?: string | null
		}) => {
			if (!attributes.borderWidth) return {}
			const style = [`border-width: ${attributes.borderWidth}px`]
			if (!attributes.borderStyle) style.push('border-style: solid')
			// A border without a color must stay visible: fall back to black when
			// the existing borderColor attr (custom-table) is unset.
			if (!attributes.borderColor || attributes.borderColor === NO_COLOR) {
				style.push('border-color: #000000')
			}
			return { 'data-border-width': String(attributes.borderWidth), style: style.join('; ') }
		},
	},
	borderStyle: {
		default: null,
		parseHTML: (element: HTMLElement) =>
			element.getAttribute('data-border-style') ?? (element.style.borderStyle || null),
		renderHTML: (attributes: { borderStyle?: string | null }) => {
			if (!attributes.borderStyle) return {}
			return {
				'data-border-style': attributes.borderStyle,
				style: `border-style: ${attributes.borderStyle}`,
			}
		},
	},
}

export const TableCellProps = CustomTableCell.extend({
	addAttributes() {
		return {
			...this.parent?.(),
			...cellPropsAttributes,
		}
	},
})

export const TableHeaderProps = CustomTableHeader.extend({
	addAttributes() {
		return {
			...this.parent?.(),
			...cellPropsAttributes,
		}
	},
})

export const TableRowProps = TableRow.extend({
	addAttributes() {
		return {
			...this.parent?.(),
			rowHeight: {
				default: null,
				parseHTML: (element: HTMLElement) =>
					readPx(element.getAttribute('data-row-height')) ?? readPx(element.style.height),
				renderHTML: (attributes: { rowHeight?: number | null }) => {
					if (!attributes.rowHeight) return {}
					return {
						'data-row-height': String(attributes.rowHeight),
						style: `height: ${attributes.rowHeight}px`,
					}
				},
			},
			cantSplit: {
				default: false,
				parseHTML: (element: HTMLElement) => element.getAttribute('data-cant-split') === 'true',
				renderHTML: (attributes: { cantSplit?: boolean }) =>
					attributes.cantSplit ? { 'data-cant-split': 'true' } : {},
			},
		}
	},
})

export const TableNodeProps = Table.extend({
	addAttributes() {
		return {
			...this.parent?.(),
			tableWidth: {
				default: null,
				parseHTML: (element: HTMLElement) =>
					readPx(element.getAttribute('data-table-width')) ?? readPx(element.style.width),
				renderHTML: (attributes: { tableWidth?: number | null }) => {
					if (!attributes.tableWidth) return {}
					return {
						'data-table-width': String(attributes.tableWidth),
						style: `width: ${attributes.tableWidth}px`,
					}
				},
			},
			borderColor: {
				default: null,
				parseHTML: (element: HTMLElement) => element.getAttribute('data-border-color'),
				renderHTML: (attributes: { borderColor?: string | null }) => {
					if (!attributes.borderColor) return {}
					return {
						'data-border-color': attributes.borderColor,
						style: `border-color: ${attributes.borderColor}`,
					}
				},
			},
			borderWidth: {
				default: null,
				parseHTML: (element: HTMLElement) =>
					readPx(element.getAttribute('data-border-width')) ?? readPx(element.style.borderWidth),
				renderHTML: (attributes: { borderWidth?: number | null }) => {
					if (!attributes.borderWidth) return {}
					return {
						'data-border-width': String(attributes.borderWidth),
						style: `border-width: ${attributes.borderWidth}px`,
					}
				},
			},
			borderStyle: {
				default: null,
				parseHTML: (element: HTMLElement) =>
					element.getAttribute('data-border-style') ?? (element.style.borderStyle || null),
				renderHTML: (attributes: { borderStyle?: string | null }) => {
					if (!attributes.borderStyle) return {}
					return {
						'data-border-style': attributes.borderStyle,
						style: `border-style: ${attributes.borderStyle}`,
					}
				},
			},
		}
	},
})

/** Rows covered by the selection (CellSelection → all covered; text → cursor row). */
function rowsInSelection({ state }: CommandProps): number[] {
	const { selection } = state
	if (selection instanceof CellSelection) {
		const positions = new Set<number>()
		selection.forEachCell((_cell, pos) => {
			const $pos = state.doc.resolve(pos)
			for (let depth = $pos.depth; depth > 0; depth -= 1) {
				if ($pos.node(depth).type.spec.tableRole === 'row') {
					positions.add($pos.before(depth))
					return
				}
			}
		})
		return [...positions]
	}

	const { $from } = selection
	for (let depth = $from.depth; depth > 0; depth -= 1) {
		if ($from.node(depth).type.spec.tableRole === 'row') return [$from.before(depth)]
	}
	return []
}

function patchRows(props: CommandProps, patch: Record<string, unknown>): boolean {
	const { tr, dispatch } = props
	const positions = rowsInSelection(props)
	if (positions.length === 0) return false

	if (dispatch) {
		for (const pos of positions) {
			for (const [name, value] of Object.entries(patch)) tr.setNodeAttribute(pos, name, value)
		}
		dispatch(tr)
	}
	return true
}

export const TablePropsCommands = Extension.create({
	name: 'tableProps',

	addCommands() {
		const patchTable =
			(patch: Record<string, unknown>) =>
			({ state, tr, dispatch }: CommandProps) => {
				const found = findTable(state.selection.$from)
				if (!found) return false
				if (dispatch) {
					for (const [name, value] of Object.entries(patch)) tr.setNodeAttribute(found.pos, name, value)
					dispatch(tr)
				}
				return true
			}

		return {
			setTableWidth: (width) => patchTable({ tableWidth: width === null ? null : Math.round(width) }),

			setTableBorder: (border) =>
				patchTable({
					...(border.color !== undefined ? { borderColor: border.color } : {}),
					...(border.width !== undefined
						? { borderWidth: border.width === null ? null : Math.round(border.width) }
						: {}),
					...(border.style !== undefined ? { borderStyle: border.style } : {}),
				}),

			setRowHeight:
				(height) =>
				(...args) =>
					patchRows(args[0], { rowHeight: height === null ? null : Math.round(height) }),

			setRowCantSplit:
				(cantSplit) =>
				(...args) =>
					patchRows(args[0], { cantSplit }),

			setCellPadding:
				(padding) =>
				({ chain }) =>
					chain().setCellAttribute('cellPadding', padding).run(),

			setCellVerticalAlign:
				(align) =>
				({ chain }) =>
					chain().setCellAttribute('verticalAlign', align).run(),
		}
	},
})

/** Effective table formatting values at the current selection (panel state). */
export interface TablePropsSnapshot {
	tablePos: number
	rowIndex: number
	colIndex: number
	tableWidth: number | null
	borderColor: string | null
	borderWidth: number | null
	borderStyle: string | null
	repeatHeader: boolean
	rowHeight: number | null
	cantSplit: boolean
	columnWidth: number | null
	verticalAlign: string | null
	cellPadding: string | null
	cellBackground: string | null
}

export function tablePropsAt(editor: Editor): TablePropsSnapshot | null {
	const loc = locateTable(editor)
	if (!loc) return null

	const table = editor.state.doc.nodeAt(loc.tablePos)
	if (!table) return null
	const map = TableMap.get(table)

	const row = loc.rowIndex < table.childCount ? table.child(loc.rowIndex) : null
	let rowStart = 0
	for (let index = 0; index < loc.rowIndex; index += 1) rowStart += table.child(index).nodeSize
	let cell: PMNode | null = null
	if (row) {
		const cellOffset = map.map[loc.rowIndex * map.width + loc.colIndex] - rowStart - 1
		cell = row.nodeAt(cellOffset) ?? null
	}

	const background = cell?.attrs.backgroundColor as string | null | undefined
	return {
		tablePos: loc.tablePos,
		rowIndex: loc.rowIndex,
		colIndex: loc.colIndex,
		tableWidth: (table.attrs.tableWidth as number | null) ?? null,
		borderColor: (table.attrs.borderColor as string | null) ?? null,
		borderWidth: (table.attrs.borderWidth as number | null) ?? null,
		borderStyle: (table.attrs.borderStyle as string | null) ?? null,
		repeatHeader: table.attrs.repeatHeader !== false,
		rowHeight: (row?.attrs.rowHeight as number | null) ?? null,
		cantSplit: row?.attrs.cantSplit === true,
		columnWidth: columnWidths(editor, loc.tablePos)?.[loc.colIndex] ?? null,
		verticalAlign: (cell?.attrs.verticalAlign as string | null) ?? null,
		cellPadding: (cell?.attrs.cellPadding as string | null) ?? null,
		cellBackground: background && background !== NO_COLOR ? background : null,
	}
}

export { VERTICAL_ALIGNS }
