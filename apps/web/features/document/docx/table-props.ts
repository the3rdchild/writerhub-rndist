import { toCssColor, twipsToPx } from './units'
import { attr, child, tagName, val } from './xml'

/**
 * Readers for DOCX table formatting (OOXML `w:tblPr` / `w:trPr` / `w:tcPr`)
 * that map onto the attrs declared in `features/editor/table-props.ts`.
 */

const VERTICAL_ALIGN: Record<string, string> = {
	top: 'top',
	center: 'middle',
	bottom: 'bottom',
}

/** OOXML border val → CSS border-style (v1 keeps the common ones). */
const BORDER_STYLE: Record<string, string> = {
	single: 'solid',
	thick: 'solid',
	dashed: 'dashed',
	dashSmallGap: 'dashed',
	dotDash: 'dashed',
	dotted: 'dotted',
	double: 'double',
}

const BORDER_SIDES = ['top', 'left', 'start', 'bottom', 'right', 'end', 'insideH', 'insideV']

export interface BorderAttrs {
	borderColor: string
	borderWidth: number
	borderStyle: string
}

/**
 * Reads `w:tblBorders` / `w:tcBorders` into uniform border attrs.
 * v1 simplification: the `top` side wins, otherwise the first non-none side;
 * per-side variation is collapsed to a single border.
 */
export function readBorderAttrs(borders: Element | null): BorderAttrs | null {
	if (!borders) return null

	const usable: Element[] = []
	for (const name of BORDER_SIDES) {
		const side = child(borders, name)
		if (!side) continue
		const value = val(side) ?? 'single'
		if (value !== 'none' && value !== 'nil') usable.push(side)
	}
	if (usable.length === 0) return null

	const chosen = usable.find((side) => tagName(side) === 'top') ?? usable[0]

	// w:sz is in eighths of a point; px = pt * 96/72 → sz / 6.
	const sz = Number.parseInt(attr(chosen, 'sz') ?? '', 10)
	const width = Number.isFinite(sz) && sz > 0 ? Math.max(1, Math.round(sz / 6)) : 1
	return {
		borderColor: toCssColor(attr(chosen, 'color')) ?? '#000000',
		borderWidth: width,
		borderStyle: BORDER_STYLE[val(chosen) ?? 'single'] ?? 'solid',
	}
}

/** `w:tblPr` → table node attrs (tblW, tblInd, tblBorders). */
export function tablePropsOf(tblPr: Element | null): Record<string, unknown> {
	if (!tblPr) return {}

	const attrs: Record<string, unknown> = {}

	const tblW = child(tblPr, 'tblW')
	const width = Number.parseInt(attr(tblW, 'w') ?? '', 10)
	// Only absolute (dxa) widths are kept; percentage widths fall back to auto.
	if (attr(tblW, 'type') === 'dxa' && Number.isFinite(width) && width > 0) {
		attrs.tableWidth = twipsToPx(width)
	}

	const tblInd = child(tblPr, 'tblInd')
	const indent = Number.parseInt(attr(tblInd, 'w') ?? '', 10)
	if (attr(tblInd, 'type') === 'dxa' && Number.isFinite(indent) && indent > 0) {
		attrs.indentLeft = twipsToPx(indent)
	}

	const border = readBorderAttrs(child(tblPr, 'tblBorders'))
	if (border) Object.assign(attrs, border)

	return attrs
}

/** `w:trPr` → tableRow node attrs (trHeight, cantSplit). */
export function rowPropsOf(trPr: Element | null): Record<string, unknown> {
	if (!trPr) return {}

	const attrs: Record<string, unknown> = {}

	const trHeight = child(trPr, 'trHeight')
	const height = Number.parseInt(attr(trHeight, 'val') ?? '', 10)
	if (Number.isFinite(height) && height > 0 && attr(trHeight, 'hRule') !== 'auto') {
		attrs.rowHeight = twipsToPx(height)
	}

	const cantSplit = child(trPr, 'cantSplit')
	if (cantSplit && val(cantSplit) !== '0' && val(cantSplit) !== 'false') attrs.cantSplit = true

	return attrs
}

/** `w:tcPr` → cell node attrs (vAlign, tcMar, shd, tcBorders). */
export function cellPropsOf(tcPr: Element | null): Record<string, unknown> {
	if (!tcPr) return {}

	const attrs: Record<string, unknown> = {}

	const align = VERTICAL_ALIGN[val(child(tcPr, 'vAlign')) ?? '']
	if (align) attrs.verticalAlign = align

	const tcMar = child(tcPr, 'tcMar')
	if (tcMar) {
		const sides = ['top', 'right', 'bottom', 'left'].map((name) => {
			const side = child(tcMar, name)
			const width = Number.parseInt(attr(side, 'w') ?? '', 10)
			return Number.isFinite(width) ? twipsToPx(width) : 0
		})
		if (sides.some((width) => width > 0)) {
			attrs.cellPadding = sides.map((width) => `${width}px`).join(' ')
		}
	}

	const shd = child(tcPr, 'shd')
	const fill = attr(shd, 'fill')
	// val="nil" means no shading; "clear" (or absent) is a solid fill.
	if (fill && fill.toLowerCase() !== 'auto' && val(shd) !== 'nil') {
		const color = toCssColor(fill)
		if (color) attrs.backgroundColor = color
	}

	const border = readBorderAttrs(child(tcPr, 'tcBorders'))
	if (border) Object.assign(attrs, border)

	return attrs
}
