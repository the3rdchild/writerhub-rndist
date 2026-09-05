/**
 * Tabel DOCX menjadi node tabel editor.
 *
 * Termasuk penggabungan sel mendatar (`gridSpan`) dan menurun (`vMerge`),
 * lebar kolom dari `tblGrid`, serta perataan tabel bersarang - yang tidak
 * didukung editor - supaya teksnya tetap selamat.
 */
import type { JSONContent } from '@tiptap/core'
import { textOfNode } from './content'
import type { ParseContext, ReadParagraph } from './context'
import { wrapListBlocks } from './lists'
import { resolveStyle } from './properties'
import { cellPropsOf, rowPropsOf, tablePropsOf } from './table-props'
import { twipsToPx } from './units'
import { attr, child, children, intVal, tagName, val } from './xml'

/**
 * Tabel di dalam sel tidak didukung editor — ratakan jadi paragraf per baris
 * supaya teksnya selamat, alih-alih lenyap tanpa jejak.
 */
function flattenNestedTable(
	tbl: Element,
	context: ParseContext,
	readParagraph: ReadParagraph,
): JSONContent[] {
	const blocks: JSONContent[] = []
	for (const row of children(tbl, 'tr')) {
		const cells: string[] = []
		for (const tc of children(row, 'tc')) {
			const text = cellContent(tc, context, readParagraph).map(textOfNode).join(' ').trim()
			if (text) cells.push(text)
		}
		if (cells.length > 0)
			blocks.push({ type: 'paragraph', content: [{ type: 'text', text: cells.join(' — ') }] })
	}
	return blocks
}

function cellContent(tc: Element, context: ParseContext, readParagraph: ReadParagraph): JSONContent[] {
	const blocks: JSONContent[] = []
	for (const node of children(tc)) {
		const name = tagName(node)
		if (name === 'p') blocks.push(...readParagraph(node))
		else if (name === 'tbl') blocks.push(...flattenNestedTable(node, context, readParagraph))
	}
	return wrapListBlocks(blocks.length > 0 ? blocks : [{ type: 'paragraph' }])
}

function gridSpanOf(tcPr: Element | null): number {
	const span = intVal(child(tcPr, 'gridSpan'))
	return span !== undefined && span > 1 ? span : 1
}

/** `restart` membuka penggabungan, `continue` (atau tanpa val) melanjutkannya. */
function vMergeOf(tcPr: Element | null): 'restart' | 'continue' | null {
	const vMerge = child(tcPr, 'vMerge')
	if (!vMerge) return null
	return val(vMerge) === 'restart' ? 'restart' : 'continue'
}

interface TableMerger {
	/** Kolom awal sel → node sel terbit (dipakai menaikkan rowspan sel asal). */
	origins: Map<number, JSONContent>
}

function tableRowBlocks(
	row: Element,
	context: ParseContext,
	merger: TableMerger,
	gridWidths: number[],
	isFirstRow: boolean,
	readParagraph: ReadParagraph,
): JSONContent | null {
	const trPr = child(row, 'trPr')
	// `w:tblHeader` berarti "ulangi baris ini di tiap halaman" — hanya sah
	// untuk baris pertama; menandai seluruh baris seperti di Word membuat
	// seluruh isi tabel tampil sebagai baris judul.
	const isHeader = isFirstRow && trPr !== null && child(trPr, 'tblHeader') !== null
	const rowAttrs = rowPropsOf(trPr)

	const cells: JSONContent[] = []
	let totalCells = 0
	let column = 0
	for (const tc of children(row, 'tc')) {
		totalCells += 1
		const tcPr = child(tc, 'tcPr')
		const span = gridSpanOf(tcPr)
		const vMerge = vMergeOf(tcPr)

		if (vMerge === 'continue') {
			const origin = merger.origins.get(column)
			if (origin) {
				// Sel lanjutan menaikkan tinggi sel asalnya, lalu lenyap dari hasil.
				const attrs = (origin.attrs ?? {}) as Record<string, unknown>
				attrs.rowspan = Number(attrs.rowspan ?? 1) + 1
				origin.attrs = attrs
				column += span
				continue
			}
			// vMerge tanpa restart tidak punya sel asal: bawa isinya sebagai sel biasa.
		}

		const attrs = cellPropsOf(tcPr)
		if (span > 1) attrs.colspan = span
		if (vMerge === 'restart') attrs.rowspan = 1
		// Lebar kolom dari tblGrid: irisan sesuai rentang kolom sel (colspan ikut menjumlah).
		if (gridWidths.length >= column + span) {
			attrs.colwidth = gridWidths.slice(column, column + span)
		} else if (gridWidths.length === 0) {
			// Cadangan tanpa tblGrid: lebar sel tcW (dxa) dibagi rata ke kolom bentangannya.
			const tcW = child(tcPr, 'tcW')
			const width = attr(tcW, 'w')
			if (attr(tcW, 'type') === 'dxa' && width !== undefined) {
				const perColumn = Math.round(twipsToPx(Number.parseInt(width, 10) || 0) / span)
				if (perColumn > 0) attrs.colwidth = Array.from({ length: span }, () => perColumn)
			}
		}

		const cell: JSONContent = {
			type: isHeader ? 'tableHeader' : 'tableCell',
			...(Object.keys(attrs).length > 0 ? { attrs } : {}),
			content: cellContent(tc, context, readParagraph),
		}
		cells.push(cell)
		for (let offset = 0; offset < span; offset += 1) merger.origins.set(column + offset, cell)
		column += span
	}

	// Baris yang seluruhnya lanjutan penggabungan tidak punya sel sendiri —
	// ketinggiannya sudah diwakili rowspan sel asal di baris sebelumnya.
	if (totalCells > 0 && cells.length === 0) return null
	if (cells.length === 0)
		return {
			type: 'tableRow',
			...(Object.keys(rowAttrs).length > 0 ? { attrs: rowAttrs } : {}),
			content: [{ type: 'tableCell', content: [{ type: 'paragraph' }] }],
		}
	return {
		type: 'tableRow',
		...(Object.keys(rowAttrs).length > 0 ? { attrs: rowAttrs } : {}),
		content: cells,
	}
}

export function tableBlocks(
	tbl: Element,
	context: ParseContext,
	readParagraph: ReadParagraph,
): JSONContent[] {
	// Lebar kolom dari w:tblGrid. Hanya w:gridCol anak langsung yang dibaca,
	// sehingga w:tblGridChange (perubahan terlacak) bersarang otomatis diabaikan.
	const gridWidths: number[] = []
	const tblGrid = child(tbl, 'tblGrid')
	if (tblGrid) {
		for (const gridCol of children(tblGrid, 'gridCol')) {
			const width = Number.parseInt(attr(gridCol, 'w') ?? '', 10)
			if (Number.isFinite(width)) gridWidths.push(twipsToPx(width))
		}
	}

	const merger: TableMerger = { origins: new Map() }
	const rows: JSONContent[] = []
	let rowIndex = 0
	for (const tr of children(tbl, 'tr')) {
		const row = tableRowBlocks(tr, context, merger, gridWidths, rowIndex === 0, readParagraph)
		rowIndex += 1
		if (row) rows.push(row)
	}
	const tblPr = child(tbl, 'tblPr')
	const jc = val(child(tblPr, 'jc'))
	const hasHeader = rows.some((row) => row.content?.some((cell) => cell.type === 'tableHeader'))

	// Border dari style tabel (mis. "Table Grid") bila tblPr tidak membawanya sendiri.
	const styleId = val(child(tblPr, 'tblStyle'))
	const styleBorders = styleId ? resolveStyle(context.styles, styleId).tableBorders : undefined
	const attrs: Record<string, unknown> = tablePropsOf(tblPr, styleBorders)
	if (jc === 'center' || jc === 'right') attrs.textAlign = jc
	if (!hasHeader) attrs.repeatHeader = false
	if (rows.length === 0) {
		return [
			{
				type: 'table',
				...(Object.keys(attrs).length > 0 ? { attrs } : {}),
				content: [{ type: 'tableRow', content: [{ type: 'tableCell', content: [{ type: 'paragraph' }] }] }],
			},
		]
	}

	return [{ type: 'table', ...(Object.keys(attrs).length > 0 ? { attrs } : {}), content: rows }]
}
