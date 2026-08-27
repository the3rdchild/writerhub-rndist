import type { JSONContent } from '@tiptap/core'
import { MATH_BLOCK, MATH_INLINE } from '@/features/editor/math'
import { PAGE_BREAK_NODE } from '@/features/editor/page-break'
import {
	DEFAULT_PAGE_SETUP,
	PAGE_SIZES,
	type PageMargins,
	type PageSetup,
	type PageSizeId,
	sameSheetGeometry,
} from '@/features/editor/page-geometry'
import { SECTION_BREAK_NODE } from '@/features/editor/section-break'
import { ommlToLatex } from './math'
import type { Numberer } from './numbering'
import {
	type DocxStyles,
	merge,
	type ParagraphProps,
	type RunProps,
	readParagraphProps,
	readRunProps,
	resolveStyle,
} from './properties'
import {
	emuToPx,
	halfPointsToPt,
	highlightColor,
	toCssColor,
	toFontStack,
	toLineHeight,
	twipsToPx,
} from './units'
import { attr, child, children, descend, intVal, tagName, val } from './xml'
import { type DocxArchive, resolvePath } from './zip'

export interface ThemeFonts {
	major?: string
	minor?: string
}

export interface Relationship {
	type: string
	target: string
	external: boolean
}

export type Relationships = Map<string, Relationship>

export interface ParseContext {
	styles: DocxStyles
	relationships: Relationships
	theme: ThemeFonts
	numberer: Numberer
	skipped: Map<string, number>
	archive: DocxArchive
	mainPart: string
}

function skip(context: ParseContext, name: string): void {
	context.skipped.set(name, (context.skipped.get(name) ?? 0) + 1)
}

export function readRelationships(root: Element | null): Relationships {
	const result: Relationships = new Map()
	if (!root) return result

	for (const relationship of children(root, 'Relationship')) {
		const id = attr(relationship, 'Id')
		const target = attr(relationship, 'Target')
		if (!id || !target) continue
		result.set(id, {
			type: attr(relationship, 'Type') ?? '',
			target,
			external: attr(relationship, 'TargetMode') === 'External',
		})
	}
	return result
}

function headingLevel(props: ParagraphProps, styleName: string | undefined): number | undefined {
	if (props.outlineLevel !== undefined) return Math.min(6, props.outlineLevel + 1)

	if (!styleName) return undefined
	const numbered = /^heading\s*([1-9])$/i.exec(styleName.trim())
	if (numbered) return Math.min(6, Number.parseInt(numbered[1] as string, 10))
	if (/^title$/i.test(styleName.trim())) return 1
	if (/^subtitle$/i.test(styleName.trim())) return 2

	return undefined
}

export function readTheme(root: Element | null): ThemeFonts {
	const scheme = descend(root, 'themeElements', 'fontScheme')
	if (!scheme) return {}

	const typefaceOf = (name: string) => attr(descend(scheme, name, 'latin'), 'typeface') || undefined
	return { major: typefaceOf('majorFont'), minor: typefaceOf('minorFont') }
}

function fontOf(props: RunProps, theme: ThemeFonts): string | undefined {
	if (props.font) return props.font
	if (!props.fontTheme) return undefined
	return /^major/i.test(props.fontTheme) ? theme.major : theme.minor
}

function marksOf(props: RunProps, link: string | undefined, theme: ThemeFonts): JSONContent['marks'] {
	const marks: NonNullable<JSONContent['marks']> = []

	if (props.bold) marks.push({ type: 'bold' })
	if (props.italic) marks.push({ type: 'italic' })
	if (props.underline) marks.push({ type: 'underline' })
	if (props.strike) marks.push({ type: 'strike' })

	const style: Record<string, string> = {}
	const fontFamily = toFontStack(fontOf(props, theme))
	if (fontFamily) style.fontFamily = fontFamily
	if (props.halfPoints !== undefined) style.fontSize = `${halfPointsToPt(props.halfPoints)}pt`
	const color = toCssColor(props.color)
	if (color) style.color = color
	if (!props.bold) style.fontWeight = 'normal'
	if (Object.keys(style).length > 0) marks.push({ type: 'textStyle', attrs: style })

	const highlight = highlightColor(props.highlight)
	if (highlight) marks.push({ type: 'highlight', attrs: { color: highlight } })

	if (link) marks.push({ type: 'link', attrs: { href: link } })

	return marks.length > 0 ? marks : undefined
}

function paragraphAttrs(props: ParagraphProps): Record<string, unknown> {
	const attrs: Record<string, unknown> = {}

	if (props.alignment) attrs.textAlign = props.alignment
	if (props.indentLeft) attrs.indentLeft = twipsToPx(props.indentLeft)
	if (props.indentRight) attrs.indentRight = twipsToPx(props.indentRight)
	if (props.indentFirstLine) attrs.indentFirstLine = twipsToPx(props.indentFirstLine)
	attrs.lineHeight = toLineHeight(props.line, props.lineRule)
	attrs.spaceBefore = twipsToPx(props.spaceBefore ?? 0)
	attrs.spaceAfter = twipsToPx(props.spaceAfter ?? 0)

	return attrs
}

function runText(run: Element, context: ParseContext): { text: string; pageBreak: boolean } {
	let text = ''
	let pageBreak = false

	for (const node of children(run)) {
		switch (tagName(node)) {
			case 't':
				text += node.textContent ?? ''
				break

			case 'tab':
				text += '\t'
				break

			case 'br':
				if (val(node) === 'page' || attr(node, 'type') === 'page') pageBreak = true
				else text += '\n'
				break

			case 'noBreakHyphen':
				text += '-'
				break

			case 'softHyphen':
				break

			case 'sym': {
				const code = attr(node, 'char')
				if (code) text += String.fromCodePoint(Number.parseInt(code, 16))
				break
			}
			case 'instrText':
			case 'fldChar':
			case 'rPr':
			case 'lastRenderedPageBreak':
			case 'softHyphenPlaceholder':
				break

			default:
				skip(context, tagName(node))
		}
	}

	return { text, pageBreak }
}

function linkTarget(hyperlink: Element, context: ParseContext): string | undefined {
	const id = attr(hyperlink, 'id')
	if (!id) return undefined

	const relationship = context.relationships.get(id)
	if (!relationship) return undefined
	return relationship.external ? relationship.target : undefined
}

function mediaType(path: string): string {
	const ext = path.includes('.') ? path.slice(path.lastIndexOf('.') + 1).toLowerCase() : ''
	switch (ext) {
		case 'png':
			return 'image/png'
		case 'jpg':
		case 'jpeg':
			return 'image/jpeg'
		case 'gif':
			return 'image/gif'
		case 'bmp':
			return 'image/bmp'
		case 'webp':
			return 'image/webp'
		case 'svg':
			return 'image/svg+xml'
		case 'tif':
		case 'tiff':
			return 'image/tiff'
		default:
			return 'application/octet-stream'
	}
}

function toDataUrl(mediaPath: string, bytes: Uint8Array): string {
	let binary = ''
	for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i])
	return `data:${mediaType(mediaPath)};base64,${btoa(binary)}`
}

function readInlineImage(drawing: Element, context: ParseContext): JSONContent | null {
	const extent = descend(drawing, 'inline', 'extent')
	const cx = extent ? Number.parseInt(attr(extent, 'cx') ?? '', 10) : NaN
	const cy = extent ? Number.parseInt(attr(extent, 'cy') ?? '', 10) : NaN
	const blip = descend(drawing, 'inline', 'graphic', 'graphicData', 'pic', 'blipFill', 'blip')
	const embedId = blip ? attr(blip, 'embed') : undefined
	if (!embedId) return null

	const relationship = context.relationships.get(embedId)
	if (!relationship || relationship.external) return null

	const mediaPath = resolvePath(context.mainPart, relationship.target)
	const bytes = context.archive.bytes(mediaPath)
	if (!bytes) return null

	const docPr = descend(drawing, 'inline', 'docPr')
	const alt = docPr ? (attr(docPr, 'descr') ?? attr(docPr, 'name') ?? undefined) : undefined

	const attrs: Record<string, unknown> = { src: toDataUrl(mediaPath, bytes) }
	if (alt) attrs.alt = alt
	if (Number.isFinite(cx)) attrs.width = emuToPx(cx)
	if (Number.isFinite(cy)) attrs.height = emuToPx(cy)

	return { type: 'image', attrs }
}

function findImage(element: Element, context: ParseContext): JSONContent | null {
	for (const candidate of children(element)) {
		const name = tagName(candidate)
		if (name === 'drawing') {
			const image = readInlineImage(candidate, context)
			if (image) return image
			skip(context, 'drawing')
		} else if (name === 'pict') {
			skip(context, 'pict')
		}
	}
	return null
}

interface ParagraphBuilder {
	blocks: JSONContent[]
	inline: JSONContent[]
	images: JSONContent[]
	attrs: Record<string, unknown>
	/** Level heading paragraf ini (dipakai saat flush paragraf oleh math blok). */
	level?: number
	/** True bila paragraf sudah terdorong karena bertemu oMathPara di tengahnya. */
	flushed?: boolean
}

function walkInline(
	parent: Element,
	context: ParseContext,
	inherited: RunProps,
	link: string | undefined,
	builder: ParagraphBuilder,
	fields: boolean[],
): void {
	for (const node of children(parent)) {
		const name = tagName(node)

		switch (name) {
			case 'r': {
				for (const marker of children(node, 'fldChar')) {
					const type = attr(marker, 'fldCharType')
					if (type === 'begin') fields.push(true)
					else if (type === 'separate' && fields.length > 0) fields[fields.length - 1] = false
					else if (type === 'end') fields.pop()
				}
				if (fields.includes(true)) break
				const image = findImage(node, context)
				if (image) {
					builder.images.push(image)
					break
				}

				const props = merge(inherited, readRunProps(child(node, 'rPr')))
				const { text, pageBreak } = runText(node, context)

				if (text) {
					builder.inline.push({ type: 'text', text, marks: marksOf(props, link, context.theme) })
				}
				if (pageBreak) splitAtPageBreak(builder)
				break
			}

			case 'hyperlink':
				walkInline(node, context, inherited, linkTarget(node, context) ?? link, builder, fields)
				break

			case 'oMath': {
				const latex = ommlToLatex(node)
				if (latex) builder.inline.push({ type: MATH_INLINE, attrs: { latex } })
				break
			}

			case 'oMathPara': {
				// Persamaan tampil sendiri sebagai blok: tutup paragraf berjalan,
				// lalu terbitkan node math blok.
				if (builder.inline.length > 0) flushParagraph(builder)
				const latex = ommlToLatex(node)
				if (latex) {
					builder.blocks.push({ type: MATH_BLOCK, attrs: { latex } })
					builder.flushed = true
				}
				break
			}
			case 'ins':
			case 'smartTag':
			case 'sdtContent':
				walkInline(node, context, inherited, link, builder, fields)
				break

			case 'sdt':
				walkInline(child(node, 'sdtContent') ?? node, context, inherited, link, builder, fields)
				break

			case 'del':
			case 'pPr':
			case 'bookmarkStart':
			case 'bookmarkEnd':
			case 'proofErr':
			case 'commentRangeStart':
			case 'commentRangeEnd':
				break

			default:
				skip(context, name)
		}
	}
}

function splitAtPageBreak(builder: ParagraphBuilder): void {
	builder.blocks.push({
		type: 'paragraph',
		...(Object.keys(builder.attrs).length > 0 ? { attrs: builder.attrs } : {}),
		...(builder.inline.length > 0 ? { content: builder.inline } : {}),
	})
	builder.blocks.push({ type: PAGE_BREAK_NODE })
	builder.inline = []
}

/** Dorong isi inline yang sedang berjalan sebagai paragraf (dipakai math blok). */
function flushParagraph(builder: ParagraphBuilder): void {
	const blockAttrs = builder.level ? { ...builder.attrs, level: builder.level } : builder.attrs
	builder.blocks.push({
		type: builder.level ? 'heading' : 'paragraph',
		...(Object.keys(blockAttrs).length > 0 ? { attrs: blockAttrs } : {}),
		...(builder.inline.length > 0 ? { content: builder.inline } : {}),
	})
	builder.inline = []
	builder.flushed = true
}

export function paragraphBlocks(paragraph: Element, context: ParseContext): JSONContent[] {
	const pPr = child(paragraph, 'pPr')
	const styleId = val(child(pPr, 'pStyle'))
	const style = resolveStyle(context.styles, styleId ?? context.styles.defaultParagraphStyleId)

	const paragraphProps = merge(style.paragraph, readParagraphProps(pPr))
	const runProps = style.run
	const markProps = merge(runProps, readRunProps(child(pPr, 'rPr')))

	const attrs = paragraphAttrs(paragraphProps)

	const level = headingLevel(paragraphProps, style.name)
	const builder: ParagraphBuilder = { blocks: [], inline: [], images: [], attrs, level }
	walkInline(paragraph, context, runProps, undefined, builder, [])

	if (paragraphProps.numId) {
		const marker = context.numberer(paragraphProps.numId, paragraphProps.numLevel ?? 0)
		if (marker) {
			builder.inline.unshift({
				type: 'text',
				text: `${marker} `,
				marks: marksOf(markProps, undefined, context.theme),
			})
		}
	}
	const imageOnly = builder.images.length > 0 && builder.inline.length === 0
	// Paragraf yang isinya sudah terdorong oleh math blok tidak perlu paragraf kosong tambahan.
	const trailingEmpty = builder.flushed === true && builder.inline.length === 0 && builder.blocks.length > 0
	if ((!imageOnly || level !== undefined) && !trailingEmpty) {
		const blockAttrs = level ? { ...attrs, level } : attrs

		builder.blocks.push({
			type: level ? 'heading' : 'paragraph',
			...(Object.keys(blockAttrs).length > 0 ? { attrs: blockAttrs } : {}),
			...(builder.inline.length > 0 ? { content: builder.inline } : {}),
		})
	}
	for (const image of builder.images) builder.blocks.push(image)
	if (paragraphProps.pageBreakBefore) builder.blocks.unshift({ type: PAGE_BREAK_NODE })

	return builder.blocks
}

const VERTICAL_ALIGN: Record<string, string> = {
	top: 'top',
	center: 'middle',
	bottom: 'bottom',
}

function cellStyleOf(tcPr: Element | null): Record<string, unknown> {
	if (!tcPr) return {}

	const declarations: string[] = []

	const vAlign = val(child(tcPr, 'vAlign'))
	if (vAlign && VERTICAL_ALIGN[vAlign]) declarations.push(`vertical-align: ${VERTICAL_ALIGN[vAlign]}`)
	const margins: string[] = []
	const sides: Array<[string, string]> = [
		['top', 'top'],
		['right', 'right'],
		['bottom', 'bottom'],
		['left', 'left'],
	]
	const tcMar = child(tcPr, 'tcMar')
	for (const [name, css] of sides) {
		const side = tcMar ? child(tcMar, name) : null
		const w = side ? attr(side, 'w') : undefined
		if (w) margins.push(`${css}: ${twipsToPx(Number.parseInt(w, 10) || 0)}px`)
	}
	if (margins.length > 0) declarations.push(`padding: ${margins.join(' ')}`)

	const attrs: Record<string, unknown> = {}
	if (declarations.length > 0) attrs.style = declarations.join('; ')
	return attrs
}

function cellContent(tc: Element, context: ParseContext): JSONContent[] {
	const blocks: JSONContent[] = []
	for (const node of children(tc)) {
		if (tagName(node) === 'p') blocks.push(...paragraphBlocks(node, context))
	}
	return blocks.length > 0 ? blocks : [{ type: 'paragraph' }]
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

function tableRowBlocks(row: Element, context: ParseContext, merger: TableMerger): JSONContent | null {
	const isHeader = child(row, 'trPr') ? child(child(row, 'trPr'), 'tblHeader') !== null : false

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

		const attrs = cellStyleOf(tcPr)
		if (span > 1) attrs.colspan = span
		if (vMerge === 'restart') attrs.rowspan = 1

		const cell: JSONContent = {
			type: isHeader ? 'tableHeader' : 'tableCell',
			...(Object.keys(attrs).length > 0 ? { attrs } : {}),
			content: cellContent(tc, context),
		}
		cells.push(cell)
		for (let offset = 0; offset < span; offset += 1) merger.origins.set(column + offset, cell)
		column += span
	}

	// Baris yang seluruhnya lanjutan penggabungan tidak punya sel sendiri —
	// ketinggiannya sudah diwakili rowspan sel asal di baris sebelumnya.
	if (totalCells > 0 && cells.length === 0) return null
	if (cells.length === 0)
		return { type: 'tableRow', content: [{ type: 'tableCell', content: [{ type: 'paragraph' }] }] }
	return { type: 'tableRow', content: cells }
}

function tableBlocks(tbl: Element, context: ParseContext): JSONContent[] {
	const merger: TableMerger = { origins: new Map() }
	const rows: JSONContent[] = []
	for (const tr of children(tbl, 'tr')) {
		const row = tableRowBlocks(tr, context, merger)
		if (row) rows.push(row)
	}
	const jc = val(child(child(tbl, 'tblPr'), 'jc'))
	const hasHeader = rows.some((row) => row.content?.some((cell) => cell.type === 'tableHeader'))

	const attrs: Record<string, unknown> = {}
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

export type PageSetupPatch = Partial<Omit<PageSetup, 'margins'>> & { margins?: Partial<PageMargins> }

interface SectionProps {
	pageSetup: PageSetupPatch
	columns: { count: number; gap?: number } | null
	continuous?: boolean
}

function matchPageSize(width: number, height: number): PageSizeId | null {
	for (const [id, size] of Object.entries(PAGE_SIZES)) {
		if (id === 'custom') continue
		if (Math.abs(size.width - width) <= 2 && Math.abs(size.height - height) <= 2) {
			return id as PageSizeId
		}
	}
	return null
}

function readSectPr(sectPr: Element): SectionProps {
	const pageSetup: PageSetupPatch = {}

	const pgSz = child(sectPr, 'pgSz')
	const width = twipsToPx(Number.parseInt(attr(pgSz, 'w') ?? '', 10))
	const height = twipsToPx(Number.parseInt(attr(pgSz, 'h') ?? '', 10))
	if (pgSz && width > 0 && height > 0) {
		const landscape = attr(pgSz, 'orient') === 'landscape'
		const upright = landscape && width > height ? { width: height, height: width } : { width, height }
		const size = matchPageSize(upright.width, upright.height)
		if (size) {
			pageSetup.size = size
		} else {
			pageSetup.size = 'custom'
			pageSetup.customWidth = upright.width
			pageSetup.customHeight = upright.height
		}
		pageSetup.orientation = landscape ? 'landscape' : 'portrait'
	}

	const pgMar = child(sectPr, 'pgMar')
	if (pgMar) {
		const margins: Partial<PageMargins> = {}
		for (const side of ['top', 'right', 'bottom', 'left'] as const) {
			const twips = Number.parseInt(attr(pgMar, side) ?? '', 10)
			if (Number.isFinite(twips)) margins[side] = Math.max(0, twipsToPx(twips))
		}
		if (Object.keys(margins).length > 0) pageSetup.margins = margins
	}

	let columns: SectionProps['columns'] = null
	const cols = child(sectPr, 'cols')
	const count = Number.parseInt(attr(cols, 'num') ?? '', 10)
	if (Number.isFinite(count) && count >= 2) {
		columns = { count }
		const space = Number.parseInt(attr(cols, 'space') ?? '', 10)
		if (Number.isFinite(space)) columns.gap = twipsToPx(space)
	}

	return { pageSetup, columns, ...(val(child(sectPr, 'type')) === 'continuous' ? { continuous: true } : {}) }
}

export function bodyBlocks(
	body: Element,
	context: ParseContext,
	onSection?: (props: SectionProps, endedAt: number) => void,
): JSONContent[] {
	const blocks: JSONContent[] = []

	for (const node of children(body)) {
		switch (tagName(node)) {
			case 'p': {
				blocks.push(...paragraphBlocks(node, context))
				const sectPr = descend(node, 'pPr', 'sectPr')
				if (sectPr) onSection?.(readSectPr(sectPr), blocks.length)
				break
			}

			case 'tbl':
				blocks.push(...tableBlocks(node, context))
				break

			case 'sdt': {
				const content = child(node, 'sdtContent')
				if (content) blocks.push(...bodyBlocks(content, context, onSection))
				break
			}
			case 'sectPr':
				onSection?.(readSectPr(node), blocks.length)
				break

			case 'bookmarkStart':
			case 'bookmarkEnd':
			case 'proofErr':
				break

			default:
				skip(context, tagName(node))
		}
	}

	return blocks
}

function mergeSetup(base: PageSetup, patch: PageSetupPatch): PageSetup {
	return { ...base, ...patch, margins: { ...base.margins, ...patch.margins } }
}

export function readBody(
	body: Element,
	context: ParseContext,
): { blocks: JSONContent[]; pageSetup?: PageSetupPatch } {
	const endings: { at: number; props: SectionProps }[] = []
	const raw = bodyBlocks(body, context, (props, endedAt) => endings.push({ at: endedAt, props }))
	if (endings[0]?.props.columns) skip(context, 'kolom-bagian-pertama')

	const last = endings[endings.length - 1]
	if (!last || (endings.length === 1 && last.at >= raw.length)) {
		return { blocks: raw, pageSetup: last?.props.pageSetup }
	}

	const blocks: JSONContent[] = []
	let start = 0
	let resolved = mergeSetup(DEFAULT_PAGE_SETUP, endings[0]?.props.pageSetup ?? {})
	endings.forEach(({ at, props }, index) => {
		if (index > 0) {
			const next = mergeSetup(resolved, props.pageSetup)
			const continuous = props.continuous === true && sameSheetGeometry(next, resolved)
			blocks.push({
				type: SECTION_BREAK_NODE,
				attrs: {
					pageSetup: props.pageSetup,
					columns: props.columns,
					...(continuous ? { continuous: true } : {}),
				},
			})
			resolved = next
		}
		blocks.push(...raw.slice(start, at))
		start = at
	})
	blocks.push(...raw.slice(start))

	return { blocks, pageSetup: endings[0]?.props.pageSetup }
}

export function bodyOf(documentRoot: Element): Element | null {
	return descend(documentRoot, 'body')
}
