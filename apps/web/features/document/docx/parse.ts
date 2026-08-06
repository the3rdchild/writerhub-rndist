/**
 * `document.xml` menjadi dokumen Tiptap.
 *
 * Yang dikerjakan berkas ini hanya menelusuri isi badan dokumen dan
 * menerjemahkan tiap paragraf. Pertanyaan "gaya ini sebenarnya berarti apa"
 * sudah dijawab lebih dulu di properties.ts - di sini kita tinggal memakai
 * hasilnya.
 */

import type { JSONContent } from '@tiptap/core'
import { PAGE_BREAK_NODE } from '@/features/editor/page-break'
import {
	type DocxStyles,
	merge,
	type ParagraphProps,
	readParagraphProps,
	readRunProps,
	resolveStyle,
	type RunProps,
} from './properties'
import {
	halfPointsToPt,
	highlightColor,
	toCssColor,
	toFontStack,
	toLineHeight,
	twipsToPx,
} from './units'
import { attr, child, children, descend, tagName, val } from './xml'

/** Nama font tema, dibaca dari theme1.xml. */
export interface ThemeFonts {
	major?: string
	minor?: string
}

/** Hubungan antarbagian - dipakai menemukan alamat tautan dan letak bagian lain. */
export interface Relationship {
	/** URI panjang yang menyebut peran bagian tujuan, misalnya `.../styles`. */
	type: string
	target: string
	external: boolean
}

export type Relationships = Map<string, Relationship>

export interface ParseContext {
	styles: DocxStyles
	relationships: Relationships
	theme: ThemeFonts
	/** Elemen yang dilewati beserta jumlahnya, supaya bisa dilaporkan apa adanya. */
	skipped: Map<string, number>
}

/** Mencatat satu elemen yang tidak punya padanan, tanpa menghentikan apa pun. */
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

/**
 * Tingkat judul sebuah paragraf, atau undefined bila ia paragraf biasa.
 *
 * `outlineLvl` didahulukan ketimbang nama gaya karena ia ikut terwariskan.
 * Gaya bernama bebas seperti "Heading awal" - yang di dokumen nyata dipakai
 * untuk judul bab - tidak akan pernah cocok dengan pencocokan nama, tapi
 * `outlineLvl` yang diwarisinya dari "heading 1" menyebutkannya dengan jelas.
 */
function headingLevel(props: ParagraphProps, styleName: string | undefined): number | undefined {
	if (props.outlineLevel !== undefined) return Math.min(6, props.outlineLevel + 1)

	if (!styleName) return undefined
	const numbered = /^heading\s*([1-9])$/i.exec(styleName.trim())
	if (numbered) return Math.min(6, Number.parseInt(numbered[1] as string, 10))
	if (/^title$/i.test(styleName.trim())) return 1
	if (/^subtitle$/i.test(styleName.trim())) return 2

	return undefined
}

/** Membaca nama font major/minor dari bagian tema. */
export function readTheme(root: Element | null): ThemeFonts {
	const scheme = descend(root, 'themeElements', 'fontScheme')
	if (!scheme) return {}

	const typefaceOf = (name: string) => attr(descend(scheme, name, 'latin'), 'typeface') || undefined
	return { major: typefaceOf('majorFont'), minor: typefaceOf('minorFont') }
}

/**
 * Nama font sebuah run.
 *
 * Font yang disebut namanya menang atas rujukan tema - begitu urutan yang
 * dipakai Word, dan gaya seperti "Normal" memang menimpa font tema dokumen
 * dengan nama tegas seperti Times New Roman.
 */
function fontOf(props: RunProps, theme: ThemeFonts): string | undefined {
	if (props.font) return props.font
	if (!props.fontTheme) return undefined
	return /^major/i.test(props.fontTheme) ? theme.major : theme.minor
}

/**
 * Properti run diterjemahkan jadi mark Tiptap.
 *
 * Rupa huruf ikut ditulis pada tiap run, bukan hanya saat ia menyimpang dari
 * bawaan editor. Dokumen impor jadi menyebutkan sendiri seluruh tampilannya -
 * itu yang membuatnya tampil seperti di Word alih-alih mengikuti tipografi
 * editor, dan yang membuatnya utuh saat diekspor kembali.
 */
function marksOf(
	props: RunProps,
	link: string | undefined,
	theme: ThemeFonts,
): JSONContent['marks'] {
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
	// Teks yang tidak tebal perlu mengatakannya, bukan sekadar diam: di dalam
	// judul, diam berarti mengikuti CSS editor yang menebalkan judul sendiri.
	if (!props.bold) style.fontWeight = 'normal'
	if (Object.keys(style).length > 0) marks.push({ type: 'textStyle', attrs: style })

	const highlight = highlightColor(props.highlight)
	if (highlight) marks.push({ type: 'highlight', attrs: { color: highlight } })

	if (link) marks.push({ type: 'link', attrs: { href: link } })

	return marks.length > 0 ? marks : undefined
}

/** Properti paragraf diterjemahkan jadi atribut node Tiptap. */
function paragraphAttrs(props: ParagraphProps): Record<string, unknown> {
	const attrs: Record<string, unknown> = {}

	if (props.alignment) attrs.textAlign = props.alignment
	if (props.indentLeft) attrs.indentLeft = twipsToPx(props.indentLeft)
	if (props.indentRight) attrs.indentRight = twipsToPx(props.indentRight)
	if (props.indentFirstLine) attrs.indentFirstLine = twipsToPx(props.indentFirstLine)

	/*
	 * Spasi selalu ditulis, termasuk saat nilainya nol atau dokumen tidak
	 * menyebutnya sama sekali.
	 *
	 * Diamnya sebuah dokumen Word bukan berarti "terserah" - ia berarti rapat:
	 * spasi tunggal, tanpa jarak antarparagraf. Editor ini justru sebaliknya,
	 * memasang spasi longgar dan jarak 0,75em antarblok. Membiarkan atributnya
	 * kosong berarti naskah yang di Word padat datang ke sini jadi renggang.
	 */
	attrs.lineHeight = toLineHeight(props.line, props.lineRule)
	attrs.spaceBefore = twipsToPx(props.spaceBefore ?? 0)
	attrs.spaceAfter = twipsToPx(props.spaceAfter ?? 0)

	return attrs
}

/**
 * Isi sebuah run jadi potongan teks.
 *
 * Sebagian anak run bukan teks dan memang tidak boleh jadi teks: `instrText`
 * berisi kode field (` TOC \o "1-4" `) yang tidak pernah terlihat di Word, dan
 * `drawing` adalah gambar yang belum punya tempat di tahap ini.
 */
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

			// Kode field, penanda, dan properti bukan isi yang terlihat.
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

/** Alamat tautan sebuah `w:hyperlink`, bila ia menunjuk ke luar dokumen. */
function linkTarget(hyperlink: Element, context: ParseContext): string | undefined {
	const id = attr(hyperlink, 'id')
	if (!id) return undefined

	const relationship = context.relationships.get(id)
	if (!relationship) return undefined
	// Tautan ke penanda di dalam dokumen - isian daftar isi, misalnya - tidak
	// punya sasaran yang berarti di editor. Teksnya tetap dipakai, tautannya
	// tidak: lebih baik daripada tautan yang selalu buntu.
	return relationship.external ? relationship.target : undefined
}

interface ParagraphBuilder {
	blocks: JSONContent[]
	inline: JSONContent[]
	/** Format paragrafnya, dipakai ulang oleh tiap potongan hasil pemisah halaman. */
	attrs: Record<string, unknown>
}

/**
 * Menelusuri isi paragraf.
 *
 * Ditulis rekursif karena run bisa terbungkus beberapa lapis - `w:hyperlink`
 * untuk tautan, `w:ins` untuk revisi yang diterima, `w:smartTag` untuk penanda
 * lama - dan tiap lapis hanya membungkus, tidak mengubah isi.
 */
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
				// Penanda awal/akhir field menentukan bagian mana dari sebuah field
				// yang merupakan kode dan bagian mana hasilnya. Hanya hasilnya yang
				// pernah terlihat di Word, jadi hanya itu yang diambil.
				for (const marker of children(node, 'fldChar')) {
					const type = attr(marker, 'fldCharType')
					if (type === 'begin') fields.push(true)
					else if (type === 'separate' && fields.length > 0) fields[fields.length - 1] = false
					else if (type === 'end') fields.pop()
				}
				if (fields.includes(true)) break

				const props = merge(inherited, readRunProps(child(node, 'rPr')))
				const { text, pageBreak } = runText(node, context)

				if (text) {
					builder.inline.push({ type: 'text', text, marks: marksOf(props, link, context.theme) })
				}
				if (pageBreak) splitAtPageBreak(builder)
				break
			}

			case 'hyperlink':
				walkInline(
					node,
					context,
					inherited,
					linkTarget(node, context) ?? link,
					builder,
					fields,
				)
				break

			// Revisi yang sudah diterima adalah bagian naskah; yang dihapus bukan.
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

/** Pemisah halaman di tengah paragraf memotong paragrafnya jadi dua. */
function splitAtPageBreak(builder: ParagraphBuilder): void {
	builder.blocks.push({
		type: 'paragraph',
		...(Object.keys(builder.attrs).length > 0 ? { attrs: builder.attrs } : {}),
		...(builder.inline.length > 0 ? { content: builder.inline } : {}),
	})
	builder.blocks.push({ type: PAGE_BREAK_NODE })
	builder.inline = []
}

/**
 * Satu `w:p` jadi satu blok - atau beberapa, bila ada pemisah halaman di
 * dalamnya.
 */
export function paragraphBlocks(paragraph: Element, context: ParseContext): JSONContent[] {
	const pPr = child(paragraph, 'pPr')
	const styleId = val(child(pPr, 'pStyle'))
	const style = resolveStyle(context.styles, styleId ?? context.styles.defaultParagraphStyleId)

	const paragraphProps = merge(style.paragraph, readParagraphProps(pPr))
	// Properti run pada `w:pPr` menghias tanda paragraf, bukan isinya, jadi ia
	// sengaja tidak ikut diwariskan ke run - persis seperti Word.
	const runProps = style.run

	const attrs = paragraphAttrs(paragraphProps)
	const builder: ParagraphBuilder = { blocks: [], inline: [], attrs }
	walkInline(paragraph, context, runProps, undefined, builder, [])

	const level = headingLevel(paragraphProps, style.name)

	const blockAttrs = level ? { ...attrs, level } : attrs

	builder.blocks.push({
		type: level ? 'heading' : 'paragraph',
		...(Object.keys(blockAttrs).length > 0 ? { attrs: blockAttrs } : {}),
		...(builder.inline.length > 0 ? { content: builder.inline } : {}),
	})

	// Paragraf hasil pemotongan pemisah halaman terlanjur dibuat sebagai
	// paragraf biasa; judulnya ada di potongan terakhir, dan itu sudah benar.
	if (paragraphProps.pageBreakBefore) builder.blocks.unshift({ type: PAGE_BREAK_NODE })

	return builder.blocks
}

/** Isi `w:body` jadi deretan blok tingkat atas. */
export function bodyBlocks(body: Element, context: ParseContext): JSONContent[] {
	const blocks: JSONContent[] = []

	for (const node of children(body)) {
		switch (tagName(node)) {
			case 'p':
				blocks.push(...paragraphBlocks(node, context))
				break

			case 'sdt': {
				const content = child(node, 'sdtContent')
				if (content) blocks.push(...bodyBlocks(content, context))
				break
			}

			// Properti bagian menyimpan ukuran dan margin halaman; tidak ada isi
			// di dalamnya.
			case 'sectPr':
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

/** Elemen `w:body` di dalam sebuah `document.xml` yang sudah diurai. */
export function bodyOf(documentRoot: Element): Element | null {
	return descend(documentRoot, 'body')
}
