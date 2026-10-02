import { type Editor } from '@tiptap/core'
import { type Node as PMNode } from '@tiptap/pm/model'
import { type EditorState, type Transaction } from '@tiptap/pm/state'
import {
	CellSelection,
	cellAround,
	findTable,
	moveTableColumn,
	moveTableRow,
	TableMap,
} from '@tiptap/pm/tables'

export interface CellTarget {
	tablePos: number
	rowIndex: number
	colIndex: number
}

export interface TableLocation extends CellTarget {
	rowCount: number
	colCount: number
}

function tableNodeAt(editor: Editor, tablePos: number): PMNode | null {
	const node = editor.state.doc.nodeAt(tablePos)
	if (!node || node.type.spec.tableRole !== 'table') return null
	return node
}

export function locateTable(editor: Editor, pos?: number): TableLocation | null {
	return locateTableAt(editor.state, pos ?? editor.state.selection.from)
}

export function locateTableAt(state: EditorState, pos: number): TableLocation | null {
	if (pos < 0 || pos > state.doc.content.size) return null
	const $pos = state.doc.resolve(pos)
	const found = findTable($pos)
	if (!found) return null

	const map = TableMap.get(found.node)
	let rowIndex = 0
	let colIndex = 0
	const $cell = cellAround($pos)
	if ($cell) {
		try {
			const rect = map.findCell($cell.pos - found.start)
			rowIndex = rect.top
			colIndex = rect.left
		} catch {}
	}

	return {
		tablePos: found.pos,
		rowIndex,
		colIndex,
		rowCount: map.height,
		colCount: map.width,
	}
}

export function tableSize(editor: Editor, tablePos: number): { rowCount: number; colCount: number } | null {
	const node = tableNodeAt(editor, tablePos)
	if (!node) return null
	const map = TableMap.get(node)
	return { rowCount: map.height, colCount: map.width }
}

function cellPosAt(editor: Editor, tablePos: number, rowIndex: number, colIndex: number): number | null {
	const node = tableNodeAt(editor, tablePos)
	if (!node) return null
	const map = TableMap.get(node)
	if (rowIndex < 0 || rowIndex >= map.height || colIndex < 0 || colIndex >= map.width) return null
	return tablePos + 1 + map.map[rowIndex * map.width + colIndex]
}

export function focusCell(editor: Editor, target: CellTarget, at?: number): boolean {
	const cellStart = cellPosAt(editor, target.tablePos, target.rowIndex, target.colIndex)
	if (cellStart === null) return false
	const cell = editor.state.doc.nodeAt(cellStart)
	if (!cell) return false
	const inside = at !== undefined && at > cellStart && at < cellStart + cell.nodeSize ? at : cellStart + 1
	return editor.chain().focus().setTextSelection(inside).run()
}

export function selectRow(editor: Editor, tablePos: number, rowIndex: number): boolean {
	const size = tableSize(editor, tablePos)
	if (!size) return false
	const anchorCell = cellPosAt(editor, tablePos, rowIndex, 0)
	const headCell = cellPosAt(editor, tablePos, rowIndex, size.colCount - 1)
	if (anchorCell === null || headCell === null) return false
	return editor.chain().focus().setCellSelection({ anchorCell, headCell }).run()
}

export function selectColumn(editor: Editor, tablePos: number, colIndex: number): boolean {
	const size = tableSize(editor, tablePos)
	if (!size) return false
	const anchorCell = cellPosAt(editor, tablePos, 0, colIndex)
	const headCell = cellPosAt(editor, tablePos, size.rowCount - 1, colIndex)
	if (anchorCell === null || headCell === null) return false
	return editor.chain().focus().setCellSelection({ anchorCell, headCell }).run()
}

function selectionCoversCell(editor: Editor, target: CellTarget): boolean {
	const { selection } = editor.state
	if (!(selection instanceof CellSelection)) return false
	const found = findTable(selection.$anchorCell)
	if (!found || found.pos !== target.tablePos) return false
	const map = TableMap.get(found.node)
	const rect = map.rectBetween(selection.$anchorCell.pos - found.start, selection.$headCell.pos - found.start)
	return (
		target.rowIndex >= rect.top &&
		target.rowIndex < rect.bottom &&
		target.colIndex >= rect.left &&
		target.colIndex < rect.right
	)
}

export function targetCell(editor: Editor, target: CellTarget, at?: number): void {
	if (selectionCoversCell(editor, target)) return
	focusCell(editor, target, at)
}

export function withCellTarget(editor: Editor, target: CellTarget, run: (editor: Editor) => void): void {
	targetCell(editor, target)
	run(editor)
}

export function insertRowBefore(editor: Editor, target: CellTarget): void {
	if (!focusCell(editor, target)) return
	editor.chain().focus().addRowBefore().run()
}

export function insertRowAfter(editor: Editor, target: CellTarget): void {
	if (!focusCell(editor, target)) return
	editor.chain().focus().addRowAfter().run()
}

export function deleteRowAt(editor: Editor, target: CellTarget): void {
	if (!focusCell(editor, target)) return
	editor.chain().focus().deleteRow().run()
}

export function dropIndex(fromIndex: number, boundary: number): number {
	return boundary > fromIndex ? boundary - 1 : boundary
}

export function moveRow(editor: Editor, target: CellTarget, to: number): void {
	const size = tableSize(editor, target.tablePos)
	if (!size || to < 0 || to >= size.rowCount || to === target.rowIndex) return
	if (!focusCell(editor, target)) return
	moveTableRow({ from: target.rowIndex, to })(editor.state, (tr) => editor.view.dispatch(tr))
}

export function insertColBefore(editor: Editor, target: CellTarget): void {
	if (!focusCell(editor, target)) return
	editor.chain().focus().addColumnBefore().run()
}

export function insertColAfter(editor: Editor, target: CellTarget): void {
	if (!focusCell(editor, target)) return
	editor.chain().focus().addColumnAfter().run()
}

export function deleteColAt(editor: Editor, target: CellTarget): void {
	if (!focusCell(editor, target)) return
	editor.chain().focus().deleteColumn().run()
}

export function moveColumn(editor: Editor, target: CellTarget, to: number): void {
	const size = tableSize(editor, target.tablePos)
	if (!size || to < 0 || to >= size.colCount || to === target.colIndex) return
	if (!focusCell(editor, target)) return
	moveTableColumn({ from: target.colIndex, to })(editor.state, (tr) => editor.view.dispatch(tr))
}

export function explicitColumnWidths(table: PMNode): number[] | null {
	const map = TableMap.get(table)
	const widths: number[] = new Array(map.width).fill(0)
	for (let col = 0; col < map.width; col += 1) {
		const cellPos = map.map[col]
		const cell = table.nodeAt(cellPos)
		const values = cell?.attrs.colwidth as number[] | null | undefined
		const value = values?.[col - map.colCount(cellPos)]
		if (!value) return null
		widths[col] = value
	}
	return widths
}

export function columnWidths(editor: Editor, tablePos: number): number[] | null {
	const table = tableNodeAt(editor, tablePos)
	if (!table) return null

	const explicit = explicitColumnWidths(table)
	if (explicit) return explicit

	const dom = editor.view.nodeDOM(tablePos) as HTMLElement | null
	const tableEl = dom instanceof HTMLElement ? (dom.closest('table') ?? dom.querySelector('table')) : null
	const row = tableEl?.querySelector('tr')
	if (!row) return null
	const measured = Array.from(row.children, (cell) => (cell as HTMLElement).offsetWidth)
	const map = TableMap.get(table)
	return measured.length === map.width ? measured : null
}

export const MIN_COLUMN_WIDTH = 24

export function scaleColumnWidths(widths: readonly number[], total: number): number[] {
	const current = widths.reduce((sum, value) => sum + value, 0)
	if (current <= 0) return [...widths]
	const factor = Math.max(total, MIN_COLUMN_WIDTH * widths.length) / current
	return widths.map((value) => Math.max(MIN_COLUMN_WIDTH, Math.round(value * factor)))
}

export function clampColumnWidths(widths: readonly number[] | null, available: number): number[] | null {
	if (!widths || widths.length === 0) return null
	const sum = widths.reduce((total, value) => total + value, 0)
	if (sum <= available + 0.5) return null
	const next = scaleColumnWidths(widths, available)
	const nextSum = next.reduce((total, value) => total + value, 0)
	return Math.abs(nextSum - sum) < 0.5 ? null : next
}

/**
 * Ubah lebar satu kolom; kolom lain mengecil proporsional bila jumlahnya
 * melewati lebar tersedia. Dulu panel Opsi tabel menulis lebar apa adanya:
 * 300 px pada tabel 3 kolom langsung membuat tabel 701 px menembus tepi kertas
 * (uji editor 2 Okt, TBL-6).
 */
export function fitColumnWidths(
	widths: readonly number[],
	index: number,
	width: number,
	available: number | null,
): number[] {
	const next = [...widths]
	const others = widths.length - 1
	const max = available === null ? Number.POSITIVE_INFINITY : available - MIN_COLUMN_WIDTH * others
	next[index] = Math.max(MIN_COLUMN_WIDTH, Math.min(Math.round(width), max))
	if (available === null || others === 0) return next
	const rest = available - next[index]
	const otherSum = next.reduce((sum, value, at) => (at === index ? sum : sum + value), 0)
	if (otherSum <= rest) return next
	const scaled = scaleColumnWidths(
		next.filter((_, at) => at !== index),
		rest,
	)
	let cursor = 0
	return next.map((value, at) => (at === index ? value : scaled[cursor++]))
}

/** Lebar yang tersedia bagi tabel: lebar pembungkusnya (sudah dikurangi indentasi). */
export function availableTableWidth(editor: Editor, tablePos: number): number | null {
	const dom = editor.view.nodeDOM(tablePos) as HTMLElement | null
	if (!(dom instanceof HTMLElement)) return null
	const wrapper = dom.classList.contains('tableWrapper')
		? dom
		: (dom.closest('.tableWrapper') as HTMLElement | null)
	const width = (wrapper ?? dom.parentElement)?.clientWidth ?? 0
	return width > 0 ? width : null
}

/**
 * "Lebar tabel" yang benar-benar dipakai: atributnya ditulis DAN lebar kolom
 * diskalakan ke sana (dijepit ke lebar tersedia). Dulu hanya atributnya yang
 * berubah - kanvas mengabaikannya, sementara DOCX memakainya (TBL-6).
 */
export function applyTableWidth(editor: Editor, tablePos: number, width: number | null): boolean {
	if (width === null) return editor.chain().focus().setTableWidth(null).run()
	const available = availableTableWidth(editor, tablePos)
	const target = Math.round(available === null ? width : Math.min(width, available))
	const widths = columnWidths(editor, tablePos)
	const tr = editor.state.tr
	const table = tr.doc.nodeAt(tablePos)
	if (!table) return false
	tr.setNodeAttribute(tablePos, 'tableWidth', target)
	if (widths) writeColumnWidths(tr, tr.doc, tablePos, scaleColumnWidths(widths, target))
	editor.view.dispatch(tr)
	return true
}

export function writeColumnWidths(tr: Transaction, doc: PMNode, tablePos: number, widths: number[]): boolean {
	const table = doc.nodeAt(tablePos)
	if (!table || table.type.spec.tableRole !== 'table') return false
	const map = TableMap.get(table)
	if (widths.length !== map.width) return false

	const done = new Set<number>()
	let changed = false
	for (let col = 0; col < map.width; col += 1) {
		for (let row = 0; row < map.height; row += 1) {
			const cellPos = map.map[row * map.width + col]
			if (done.has(cellPos)) continue
			done.add(cellPos)
			const cell = table.nodeAt(cellPos)
			if (!cell) continue
			const start = map.colCount(cellPos)
			const span = (cell.attrs.colspan as number) || 1
			const colwidth = Array.from({ length: span }, (_, i) => Math.round(widths[start + i] ?? 0))
			const current = cell.attrs.colwidth as number[] | null | undefined
			if (
				current &&
				current.length === colwidth.length &&
				current.every((value, i) => value === colwidth[i])
			) {
				continue
			}
			tr.setNodeMarkup(tablePos + 1 + cellPos, undefined, { ...cell.attrs, colwidth })
			changed = true
		}
	}
	return changed
}

export function setColumnWidths(editor: Editor, tablePos: number, widths: number[]): boolean {
	const tr = editor.state.tr
	if (!writeColumnWidths(tr, tr.doc, tablePos, widths)) return false
	editor.view.dispatch(tr)
	return true
}

export function setTableIndent(editor: Editor, tablePos: number, left: number): boolean {
	const table = tableNodeAt(editor, tablePos)
	if (!table) return false
	const next = Math.max(0, Math.round(left))
	const previous = Number(table.attrs.indentLeft) || 0
	if (previous === next) return false
	const tr = editor.state.tr.setNodeAttribute(tablePos, 'indentLeft', next)
	/* Tabel bergeser tanpa mengecil dulu menembus margin kanan (TBL-6). */
	const available = availableTableWidth(editor, tablePos)
	if (available !== null) {
		const clamped = clampColumnWidths(explicitColumnWidths(table), available - (next - previous))
		if (clamped) writeColumnWidths(tr, tr.doc, tablePos, clamped)
	}
	editor.view.dispatch(tr)
	return true
}

/** Posisi sel yang dipilih (CellSelection), atau sel tempat kursor berada. */
function selectedCellPositions(state: EditorState): number[] {
	const { selection } = state
	if (selection instanceof CellSelection) {
		const positions: number[] = []
		selection.forEachCell((_cell, pos) => positions.push(pos))
		return positions
	}
	const { $from } = selection
	for (let depth = $from.depth; depth > 0; depth -= 1) {
		const role = $from.node(depth).type.spec.tableRole
		if (role === 'cell' || role === 'header_cell') return [$from.before(depth)]
	}
	return []
}

/**
 * "Tanpa warna": latar dan bingkai sel kembali ke rupa bawaan (null), bukan
 * `transparent`. Dulu bingkai ikut diset transparan - garis sel lenyap - dan
 * sel kepala diturunkan jadi sel biasa (uji editor 2 Okt, TBL-10). Status
 * kepala adalah urusan "Toggle header", bukan urusan warna.
 */
export function clearCellStyling(editor: Editor): boolean {
	const { state } = editor
	const positions = selectedCellPositions(state)
	if (positions.length === 0) return false

	const tr = state.tr
	for (const pos of positions) {
		const cell = tr.doc.nodeAt(pos)
		if (!cell) continue
		tr.setNodeMarkup(pos, undefined, { ...cell.attrs, backgroundColor: null, borderColor: null }, cell.marks)
	}
	if (!tr.docChanged) return false
	editor.view.dispatch(tr)
	return true
}

/**
 * Perataan teks seluruh paragraf dan judul di sel terpilih. Atribut sel
 * `textAlign` tidak ada di skema - ProseMirror membuangnya diam-diam, dan menu
 * "Align cell" dulu tidak melakukan apa pun (TBL-9).
 */
export function alignCellText(editor: Editor, align: 'left' | 'center' | 'right'): boolean {
	const { state } = editor
	const positions = selectedCellPositions(state)
	if (positions.length === 0) return false

	const tr = state.tr
	for (const pos of positions) {
		const cell = tr.doc.nodeAt(pos)
		if (!cell) continue
		cell.descendants((node, offset) => {
			if (!node.isTextblock) return true
			if ('textAlign' in node.attrs && node.attrs.textAlign !== align) {
				tr.setNodeAttribute(pos + 1 + offset, 'textAlign', align)
			}
			return false
		})
	}
	if (!tr.docChanged) return false
	editor.view.dispatch(tr)
	return true
}
