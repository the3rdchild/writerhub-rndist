import type { JSONContent } from '@tiptap/core'
import { MATH_BLOCK, MATH_INLINE } from '@/features/editor/math'
import { PAGE_BREAK_NODE } from '@/features/editor/page-break'
import { DEFAULT_PAGE_SETUP, sameSheetGeometry } from '@/features/editor/page-geometry'
import { SECTION_BREAK_NODE } from '@/features/editor/section-break'
import { type ParseContext, type ReadParagraph, skip, type ThemeFonts } from './context'
import { headingLevel, numberedHeadingLevel, promoteNumberedHeadings } from './headings'
import { type ListTag, withoutListIndents, wrapListBlocks } from './lists'
import { ommlToLatex } from './math'
import { mediaElement, runMedia } from './media'
import { symbolGlyph } from './numbering'
import {
	merge,
	type ParagraphProps,
	type RunProps,
	readParagraphProps,
	readRunProps,
	resolveStyle,
} from './properties'
import {
	leadingColumnsBreak,
	mergeSetup,
	type PageSetupPatch,
	readSectPr,
	type SectionProps,
} from './sections'
import { tableBlocks } from './tables'
import {
	fieldDepthDelta,
	MAX_SWALLOWED,
	replaceManualToc,
	type TocField,
	tocBlockOf,
	tocFieldOf,
} from './toc'
import { halfPointsToPt, highlightColor, toCssColor, toFontStack, toLineHeight, twipsToPx } from './units'
import { attr, child, children, descend, descendAll, tagName, val } from './xml'

/** Pembaca paragraf untuk modul media & tabel, terikat pada konteks ini. */
function readerOf(context: ParseContext): ReadParagraph {
	return (paragraph) => paragraphBlocks(paragraph, context)
}

/**
 * Font sebuah run.
 *
 * Kalau `w:rFonts` tidak ada sama sekali - tidak di run, tidak di style, tidak
 * di `docDefaults` - Word memakai font **tema** (`+minor-latin`), bukan font
 * bawaan pembacanya. Tanpa cadangan ini seluruh naskah dirender dengan font
 * bawaan kanvas, dan karena metrik tiap font berbeda, tinggi setiap barisnya
 * ikut berubah.
 */
function fontOf(props: RunProps, theme: ThemeFonts): string | undefined {
	if (props.font) return props.font
	if (props.fontTheme) return /^major/i.test(props.fontTheme) ? theme.major : theme.minor
	return theme.minor
}

function marksOf(
	props: RunProps,
	link: string | undefined,
	theme: ThemeFonts,
	comments?: string[],
): JSONContent['marks'] {
	const marks: NonNullable<JSONContent['marks']> = []

	if (props.bold) marks.push({ type: 'bold' })
	if (props.italic) marks.push({ type: 'italic' })
	if (props.underline) marks.push({ type: 'underline' })
	if (props.strike) marks.push({ type: 'strike' })
	if (props.vertAlign === 'superscript') marks.push({ type: 'superscript' })
	if (props.vertAlign === 'subscript') marks.push({ type: 'subscript' })

	const style: Record<string, string> = {}
	const fontFamily = toFontStack(fontOf(props, theme))
	if (fontFamily) style.fontFamily = fontFamily
	if (props.halfPoints !== undefined) style.fontSize = `${halfPointsToPt(props.halfPoints)}pt`
	const color = toCssColor(props.color)
	if (color) style.color = color
	const shading = toCssColor(props.shading)
	if (shading) style.backgroundColor = shading
	if (!props.bold) style.fontWeight = 'normal'
	if (Object.keys(style).length > 0) marks.push({ type: 'textStyle', attrs: style })

	const highlight = highlightColor(props.highlight)
	if (highlight) marks.push({ type: 'highlight', attrs: { color: highlight } })

	if (link) marks.push({ type: 'link', attrs: { href: link } })

	for (const id of comments ?? []) marks.push({ type: 'comment', attrs: { commentId: id } })

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

function runText(
	run: Element,
	context: ParseContext,
): { text: string; pageBreak: boolean; footnote?: number } {
	let text = ''
	let pageBreak = false
	let footnote: number | undefined

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

			case 'footnoteReference': {
				const id = Number.parseInt(attr(node, 'id') ?? '', 10)
				if (Number.isFinite(id)) footnote = id
				break
			}
			case 'sym': {
				const code = Number.parseInt(attr(node, 'char') ?? '', 16)
				if (Number.isFinite(code)) {
					text += symbolGlyph(code, attr(node, 'font')) ?? String.fromCodePoint(code)
				}
				break
			}
			case 'instrText':
			case 'fldChar':
			case 'rPr':
			case 'lastRenderedPageBreak':
			case 'softHyphenPlaceholder':
			// Media dalam run sudah ditangani runMedia — jangan dihitung dua kali.
			case 'drawing':
			case 'pict':
			case 'object':
			case 'AlternateContent':
				break

			default:
				skip(context, tagName(node))
		}
	}

	return { text, pageBreak, footnote }
}

function linkTarget(hyperlink: Element, context: ParseContext): string | undefined {
	const id = attr(hyperlink, 'id')
	if (!id) {
		// Tautan internal (w:anchor): editornya belum punya sasaran bookmark —
		// teksnya tetap masuk, tapi pengguna perlu tahu tautannya tak hidup.
		if (attr(hyperlink, 'anchor')) skip(context, 'tautan-internal')
		return undefined
	}

	const relationship = context.relationships.get(id)
	if (!relationship) return undefined
	return relationship.external ? relationship.target : undefined
}

interface ParagraphBuilder {
	blocks: JSONContent[]
	inline: JSONContent[]
	/** Blok penyusul (gambar, isi kotak teks) setelah paragraf jangkarnya. */
	after: JSONContent[]
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
				builder.after.push(...runMedia(node, context, readerOf(context)))

				const rPr = child(node, 'rPr')
				if (rPr) {
					if (child(rPr, 'spacing')) skip(context, 'jarak-huruf')
					if (child(rPr, 'position')) skip(context, 'posisi-teks')
				}

				const props = merge(inherited, readRunProps(rPr))
				const { text, pageBreak, footnote } = runText(node, context)

				if (footnote !== undefined && context.footnotes.has(footnote)) {
					builder.inline.push({ type: 'footnoteRef', attrs: { id: `fn-${footnote}` } })
					context.state.footnoteQueue.push(footnote)
				}

				const stack = context.state.commentStack
				const comments = stack && stack.length > 0 ? stack.map((id) => `w-${id}`) : undefined
				if (text && props.vanish) skip(context, 'teks-tersembunyi')
				if (text && !props.vanish) {
					builder.inline.push({ type: 'text', text, marks: marksOf(props, link, context.theme, comments) })
					if (stack && stack.length > 0) {
						for (const id of stack) {
							const quotes = context.state.commentQuotes
							if (quotes) quotes.set(id, (quotes.get(id) ?? '') + text)
						}
					}
				}
				if (pageBreak) splitAtPageBreak(builder)
				break
			}

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
			case 'hyperlink':
				walkInline(node, context, inherited, linkTarget(node, context) ?? link, builder, fields)
				break

			case 'ins':
				skip(context, 'revisi')
				walkInline(node, context, inherited, link, builder, fields)
				break
			case 'smartTag':
			case 'sdtContent':
				walkInline(node, context, inherited, link, builder, fields)
				break

			case 'sdt':
				walkInline(child(node, 'sdtContent') ?? node, context, inherited, link, builder, fields)
				break

			case 'del':
				skip(context, 'revisi')
				break
			case 'pPr':
			case 'bookmarkStart':
			case 'bookmarkEnd':
			case 'proofErr':
				break

			case 'commentRangeStart': {
				const id = attr(node, 'id')
				if (id && context.commentMeta.has(id)) context.state.commentStack.push(id)
				break
			}
			case 'commentRangeEnd': {
				const id = attr(node, 'id')
				const stack = context.state.commentStack
				if (id && stack) {
					const at = stack.lastIndexOf(id)
					if (at !== -1) stack.splice(at, 1)
				}
				break
			}

			default: {
				// Media bisa menempel langsung di paragraf (di luar run).
				const media = mediaElement(node, context, readerOf(context))
				if (media) {
					builder.after.push(...media)
					break
				}
				skip(context, name)
			}
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

export function paragraphBlocks(paragraph: Element, context: ParseContext, heuristic = false): JSONContent[] {
	const pPr = child(paragraph, 'pPr')
	const styleId = val(child(pPr, 'pStyle'))
	const style = resolveStyle(context.styles, styleId ?? context.styles.defaultParagraphStyleId)

	const paragraphProps = merge(style.paragraph, readParagraphProps(pPr))
	const runProps = style.run
	const markProps = merge(runProps, readRunProps(child(pPr, 'rPr')))

	if (pPr && child(pPr, 'pBdr')) skip(context, 'garis-paragraf')

	const attrs = paragraphAttrs(paragraphProps)

	const numbered = heuristic ? numberedHeadingLevel(paragraphTextOf(paragraph)) : undefined
	const level = headingLevel(paragraphProps, style.names, numbered)
	const builder: ParagraphBuilder = { blocks: [], inline: [], after: [], attrs, level }
	walkInline(paragraph, context, runProps, undefined, builder, [])

	let listTag: ListTag | undefined
	if (paragraphProps.numId) {
		const marker = context.numberer(paragraphProps.numId, paragraphProps.numLevel ?? 0)
		if (marker) {
			if (level !== undefined) {
				// Heading bernomor tetap membakar nomornya sebagai teks — heading bukan list.
				builder.inline.unshift({
					type: 'text',
					text: `${marker.text} `,
					marks: marksOf(markProps, undefined, context.theme),
				})
			} else {
				listTag = {
					numId: paragraphProps.numId,
					ilvl: paragraphProps.numLevel ?? 0,
					format: marker.format,
					value: marker.value,
					// Satuan px agar sebanding dengan attrs.indentLeft paragraf lanjutan.
					indent: twipsToPx(paragraphProps.indentLeft ?? 0),
				}
			}
		}
	}
	const mediaOnly = builder.after.length > 0 && builder.inline.length === 0
	// Paragraf yang isinya sudah terdorong oleh math blok tidak perlu paragraf kosong tambahan.
	const trailingEmpty = builder.flushed === true && builder.inline.length === 0 && builder.blocks.length > 0
	if ((!mediaOnly || level !== undefined) && !trailingEmpty) {
		const blockAttrs = level ? { ...attrs, level } : attrs
		const paragraphAttrs = listTag ? { ...withoutListIndents(blockAttrs), _list: listTag } : blockAttrs

		// Kandidat heading bernomor ditandai; dipromosikan bila dokumen ini
		// memang tak punya kerangka sama sekali (lihat promoteNumberedHeadings).
		// Paragraf bernomor Word bukan kandidat: promosinya akan menyisakan
		// `_list` pada node heading yang tidak pernah dibersihkan wrapListBlocks.
		const maybe =
			level === undefined && numbered !== undefined && !listTag ? { _maybeHeading: numbered } : undefined
		const markedAttrs = maybe ? { ...paragraphAttrs, ...maybe } : paragraphAttrs

		builder.blocks.push({
			type: level ? 'heading' : 'paragraph',
			...(Object.keys(markedAttrs).length > 0 ? { attrs: markedAttrs } : {}),
			...(builder.inline.length > 0 ? { content: builder.inline } : {}),
		})
	}
	for (const extra of builder.after) builder.blocks.push(extra)
	if (paragraphProps.pageBreakBefore) builder.blocks.unshift({ type: PAGE_BREAK_NODE })

	return builder.blocks
}

/** Teks paragraf mentah (gabungan `w:t`) — untuk heuristik heading bernomor. */
function paragraphTextOf(paragraph: Element): string {
	let text = ''
	for (const node of descendAll(paragraph, 't')) text += node.textContent ?? ''
	return text
}

export function bodyBlocks(
	body: Element,
	context: ParseContext,
	onSection?: (props: SectionProps, endedAt: number) => void,
): JSONContent[] {
	const blocks: JSONContent[] = []
	let toc: TocField | null = null
	let tocDepth = 0
	let swallowed = 0

	for (const node of children(body)) {
		// Isi field TOC (hasil basi berikut nomor halamannya) ditelan utuh —
		// paragraf, tabel, apa pun di antara pembuka dan penutupnya; digantikan
		// satu node daftar isi yang menyusun entrinya sendiri.
		if (toc) {
			swallowed += 1
			tocDepth += fieldDepthDelta(node)

			// Pengaman: field tanpa penutup tidak boleh menelan seluruh dokumen.
			// Kalau pengaman ini yang menghentikannya, isi yang terlanjur
			// tertelan memang hilang - itu harus diberitahukan, bukan didiamkan.
			const capped = swallowed >= MAX_SWALLOWED
			if (capped) skip(context, 'daftar-isi-tanpa-penutup')
			if (tocDepth <= 0 || capped) {
				blocks.push(tocBlockOf(toc))
				toc = null
			}
			continue
		}

		switch (tagName(node)) {
			case 'p': {
				const field = tocFieldOf(node)
				if (field) {
					if (field.depth <= 0) blocks.push(tocBlockOf(field))
					else {
						toc = field
						tocDepth = field.depth
						swallowed = 0
					}
					break
				}

				blocks.push(...paragraphBlocks(node, context, true))
				const sectPr = descend(node, 'pPr', 'sectPr')
				if (sectPr) onSection?.(readSectPr(sectPr, context), blocks.length)
				break
			}

			case 'tbl':
				blocks.push(...tableBlocks(node, context, readerOf(context)))
				break

			case 'sdt': {
				const content = child(node, 'sdtContent')
				if (content) blocks.push(...bodyBlocks(content, context, onSection))
				break
			}
			case 'sectPr':
				onSection?.(readSectPr(node, context), blocks.length)
				break

			case 'bookmarkStart':
			case 'bookmarkEnd':
			case 'proofErr':
				break

			default:
				skip(context, tagName(node))
		}
	}

	if (toc) blocks.push(tocBlockOf(toc))

	return blocks
}

export function readBody(
	body: Element,
	context: ParseContext,
): { blocks: JSONContent[]; pageSetup?: PageSetupPatch } {
	const endings: { at: number; props: SectionProps }[] = []
	const raw = bodyBlocks(body, context, (props, endedAt) => endings.push({ at: endedAt, props }))
	const promoted = promoteNumberedHeadings(raw)

	const last = endings[endings.length - 1]
	if (!last || (endings.length === 1 && last.at >= promoted.length)) {
		const blocks = replaceManualToc(promoted)
		if (endings[0]?.props.columns) blocks.unshift(leadingColumnsBreak(endings[0].props.columns))
		return { blocks: appendFootnotes(wrapListBlocks(blocks), context), pageSetup: last?.props.pageSetup }
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
		blocks.push(...promoted.slice(start, at))
		start = at
	})
	blocks.push(...promoted.slice(start))

	const final = replaceManualToc(blocks)
	if (endings[0]?.props.columns) final.unshift(leadingColumnsBreak(endings[0].props.columns))

	return { blocks: appendFootnotes(wrapListBlocks(final), context), pageSetup: endings[0]?.props.pageSetup }
}

/** Isi catatan kaki dirujuk di badan naskah diterbitkan sebagai blok di akhir. */
function appendFootnotes(blocks: JSONContent[], context: ParseContext): JSONContent[] {
	const queue = context.state.footnoteQueue
	if (queue.length === 0) return blocks

	for (const id of queue) {
		const content = context.footnotes.get(id)
		if (content) blocks.push({ type: 'footnote', content })
	}
	return blocks
}

export function bodyOf(documentRoot: Element): Element | null {
	return descend(documentRoot, 'body')
}
