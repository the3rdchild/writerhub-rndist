import { attr, child, children, intVal, onOff, val } from './xml'
export type Alignment = 'left' | 'center' | 'right' | 'justify'

export interface ParagraphProps {
	outlineLevel?: number
	alignment?: Alignment
	indentLeft?: number
	indentRight?: number
	indentFirstLine?: number
	line?: number
	lineRule?: 'auto' | 'exact' | 'atLeast'
	spaceBefore?: number
	spaceAfter?: number
	numId?: number
	numLevel?: number
	pageBreakBefore?: boolean
}

export interface RunProps {
	bold?: boolean
	italic?: boolean
	underline?: boolean
	strike?: boolean
	halfPoints?: number
	font?: string
	fontTheme?: string
	color?: string
	highlight?: string
	caps?: boolean
	smallCaps?: boolean
	vertAlign?: 'superscript' | 'subscript'
	noProof?: boolean
}
export function merge<T extends object>(base: T, over: T): T {
	const result = { ...base }
	for (const key of Object.keys(over) as (keyof T)[]) {
		const value = over[key]
		if (value !== undefined) result[key] = value
	}
	return result
}

const ALIGNMENTS: Record<string, Alignment> = {
	left: 'left',
	start: 'left',
	center: 'center',
	right: 'right',
	end: 'right',
	both: 'justify',
	distribute: 'justify',
}

const LINE_RULES: Record<string, 'auto' | 'exact' | 'atLeast'> = {
	auto: 'auto',
	exact: 'exact',
	atLeast: 'atLeast',
}

function twips(element: Element | null, name: string): number | undefined {
	const raw = attr(element, name)
	if (raw === undefined) return undefined
	const parsed = Number.parseInt(raw, 10)
	return Number.isFinite(parsed) ? parsed : undefined
}
export function readParagraphProps(pPr: Element | null): ParagraphProps {
	if (!pPr) return {}

	const props: ParagraphProps = {}

	const outline = intVal(child(pPr, 'outlineLvl'))
	if (outline !== undefined && outline < 9) props.outlineLevel = outline

	const alignment = val(child(pPr, 'jc'))
	if (alignment && ALIGNMENTS[alignment]) props.alignment = ALIGNMENTS[alignment]

	const indent = child(pPr, 'ind')
	if (indent) {
		props.indentLeft = twips(indent, 'left') ?? twips(indent, 'start')
		props.indentRight = twips(indent, 'right') ?? twips(indent, 'end')

		const firstLine = twips(indent, 'firstLine') ?? twips(indent, 'firstLineChars')
		const hanging = twips(indent, 'hanging') ?? twips(indent, 'hangingChars')
		if (hanging !== undefined) props.indentFirstLine = -hanging
		else if (firstLine !== undefined) props.indentFirstLine = firstLine
	}

	const spacing = child(pPr, 'spacing')
	if (spacing) {
		props.line = twips(spacing, 'line')
		props.lineRule = LINE_RULES[attr(spacing, 'lineRule') ?? ''] ?? undefined
		const isOn = (name: string) => {
			const raw = attr(spacing, name)
			return raw !== undefined && raw !== '0' && raw !== 'false'
		}
		if (!isOn('beforeAutospacing')) props.spaceBefore = twips(spacing, 'before')
		if (!isOn('afterAutospacing')) props.spaceAfter = twips(spacing, 'after')
	}

	const numPr = child(pPr, 'numPr')
	if (numPr) {
		props.numId = intVal(child(numPr, 'numId'))
		props.numLevel = intVal(child(numPr, 'ilvl'))
	}

	const pageBreak = onOff(child(pPr, 'pageBreakBefore'))
	if (pageBreak !== undefined) props.pageBreakBefore = pageBreak

	return props
}
export function readRunProps(rPr: Element | null): RunProps {
	if (!rPr) return {}

	const props: RunProps = {}

	props.bold = onOff(child(rPr, 'b'))
	props.italic = onOff(child(rPr, 'i'))
	props.strike = onOff(child(rPr, 'strike'))
	props.caps = onOff(child(rPr, 'caps'))
	props.smallCaps = onOff(child(rPr, 'smallCaps'))
	props.noProof = onOff(child(rPr, 'noProof'))
	const underline = child(rPr, 'u')
	if (underline) props.underline = (val(underline) ?? 'single') !== 'none'

	const size = intVal(child(rPr, 'sz'))
	if (size !== undefined) props.halfPoints = size

	const fonts = child(rPr, 'rFonts')
	if (fonts) {
		props.font = attr(fonts, 'ascii') ?? attr(fonts, 'hAnsi') ?? attr(fonts, 'cs')
		props.fontTheme = attr(fonts, 'asciiTheme') ?? attr(fonts, 'hAnsiTheme') ?? attr(fonts, 'cstheme')
	}

	const color = val(child(rPr, 'color'))
	if (color) props.color = color

	const highlight = val(child(rPr, 'highlight'))
	if (highlight && highlight !== 'none') props.highlight = highlight

	const vertAlign = val(child(rPr, 'vertAlign'))
	if (vertAlign === 'superscript' || vertAlign === 'subscript') props.vertAlign = vertAlign
	for (const key of Object.keys(props) as (keyof RunProps)[]) {
		if (props[key] === undefined) delete props[key]
	}

	return props
}
export interface StyleDefinition {
	id: string
	name: string
	type: string
	basedOn?: string
	paragraph: ParagraphProps
	run: RunProps
}

export interface DocxStyles {
	byId: Map<string, StyleDefinition>
	defaultParagraph: ParagraphProps
	defaultRun: RunProps
	defaultParagraphStyleId?: string
}

export function readStyles(root: Element | null): DocxStyles {
	const styles: DocxStyles = {
		byId: new Map(),
		defaultParagraph: {},
		defaultRun: {},
	}
	if (!root) return styles

	const defaults = child(root, 'docDefaults')
	styles.defaultParagraph = readParagraphProps(child(child(defaults, 'pPrDefault'), 'pPr'))
	styles.defaultRun = readRunProps(child(child(defaults, 'rPrDefault'), 'rPr'))

	for (const style of children(root, 'style')) {
		const id = attr(style, 'styleId')
		if (!id) continue

		const type = attr(style, 'type') ?? 'paragraph'
		const definition: StyleDefinition = {
			id,
			name: val(child(style, 'name')) ?? id,
			type,
			basedOn: val(child(style, 'basedOn')),
			paragraph: readParagraphProps(child(style, 'pPr')),
			run: readRunProps(child(style, 'rPr')),
		}
		styles.byId.set(id, definition)
		const isDefault = attr(style, 'default')
		if (type === 'paragraph' && isDefault !== undefined && isDefault !== '0' && isDefault !== 'false') {
			styles.defaultParagraphStyleId = id
		}
	}

	return styles
}
export function resolveStyle(
	styles: DocxStyles,
	styleId: string | undefined,
): { paragraph: ParagraphProps; run: RunProps; name?: string } {
	const chain: StyleDefinition[] = []
	const seen = new Set<string>()

	let current = styleId ? styles.byId.get(styleId) : undefined
	while (current && !seen.has(current.id)) {
		seen.add(current.id)
		chain.unshift(current)
		current = current.basedOn ? styles.byId.get(current.basedOn) : undefined
	}

	let paragraph = styles.defaultParagraph
	let run = styles.defaultRun
	for (const definition of chain) {
		paragraph = merge(paragraph, definition.paragraph)
		run = merge(run, definition.run)
	}

	return { paragraph, run, name: chain.at(-1)?.name }
}
