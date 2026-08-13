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
	DEFAULT_PAGE_SETUP,
	PAGE_SIZES,
	type PageMargins,
	type PageSetup,
	type PageSizeId,
	sameSheetGeometry,
} from '@/features/editor/page-geometry'
import { SECTION_BREAK_NODE } from '@/features/editor/section-break'
import type { Numberer } from './numbering'
import { type DocxArchive, resolvePath } from './zip'
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
	emuToPx,
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
	/**
	 * Penghitung nomor otomatis.
	 *
	 * Ia menyimpan keadaan dan harus dipanggil menurut urutan paragraf di
	 * dokumen - sebuah deret tidak bisa dihitung mundur.
	 */
	numberer: Numberer
	/** Elemen yang dilewati beserta jumlahnya, supaya bisa dilaporkan apa adanya. */
	skipped: Map<string, number>
	/**
	 * Arsip DOCX beserta bagian utamanya. Dipakai membaca media gambar: rujukan
	 * `r:embed` menunjuk sebuah hubungan, yang targetnya berupa jalur media
	 * relatif terhadap direktori bagian utama.
	 */
	archive: DocxArchive
	mainPart: string
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

/** Tipe media dari nama berkas, untuk mengisi `data:` URL dengan benar. */
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

/**
 * Membaca byte media jadi data URL base64.
 *
 * Data URL dipilih ketimbang object URL: ia ikut tersimpan bersama naskah,
 * jadi gambar tetap ada setelah halaman dimuat ulang, dan selamat saat dokumen
 * diekspor kembali ke DOCX. `btoa` butuh byte biner sebagai string - jalur
 * konversi lewat `Uint8Array` menangani byte apa pun, termasuk yang di atas 127.
 */
function toDataUrl(mediaPath: string, bytes: Uint8Array): string {
	let binary = ''
	for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i])
	return `data:${mediaType(mediaPath)};base64,${btoa(binary)}`
}

/**
 * Sebuah gambar inline jadi node `image`.
 *
 * Ukuran tampilan diambil dari `wp:extent` (dalam EMU), bukan dari resolusi
 * piksel berkas aslinya: sebuah gambar beresolusi tinggi kerap disimpan dalam
 * ukuran tampil yang lebih kecil, dan memakai ukuran asli membuatnya tampil
 * beberapa kali lebih besar dari yang dimaksudkan.
 *
 * Rujukan `r:embed` diubah dulu jadi jalur media melalui daftar hubungan, lalu
 * jalur itu diselesaikan relatif terhadap direktori bagian utama. Bila media
 * atau rujukannya hilang, gambar dilewati - bukan dijadikan naskah rusak.
 */
function readInlineImage(
	drawing: Element,
	context: ParseContext,
): JSONContent | null {
	const extent = descend(drawing, 'inline', 'extent')
	const cx = extent ? Number.parseInt(attr(extent, 'cx') ?? '', 10) : NaN
	const cy = extent ? Number.parseInt(attr(extent, 'cy') ?? '', 10) : NaN

	// `a:blip` membawa rujukan ke media; `r:embed`-nya menunjuk sebuah hubungan.
	const blip = descend(drawing, 'inline', 'graphic', 'graphicData', 'pic', 'blipFill', 'blip')
	const embedId = blip ? attr(blip, 'embed') : undefined
	if (!embedId) return null

	const relationship = context.relationships.get(embedId)
	if (!relationship || relationship.external) return null

	const mediaPath = resolvePath(context.mainPart, relationship.target)
	const bytes = context.archive.bytes(mediaPath)
	if (!bytes) return null

	const docPr = descend(drawing, 'inline', 'docPr')
	const alt = docPr ? (attr(docPr, 'descr') ?? attr(docPr, 'name')) ?? undefined : undefined

	const attrs: Record<string, unknown> = { src: toDataUrl(mediaPath, bytes) }
	if (alt) attrs.alt = alt
	if (Number.isFinite(cx)) attrs.width = emuToPx(cx)
	if (Number.isFinite(cy)) attrs.height = emuToPx(cy)

	return { type: 'image', attrs }
}

/**
 * Mencari sebuah gambar di dalam sebuah elemen - run maupun pembungkusnya.
 *
 * Gambar di OOXML datang dalam dua bentuk: `w:drawing` modern dan `w:pict`
 * warisan (VML). Keduanya ditangani, walau VAML kini langka. Yang mengambang
 * (anchor) sengaja tidak diikutkan: editor tidak punya kanvas gambar mengambang,
 * dan menempatkannya sebagai inline lebih baik daripada membuangnya.
 */
function findImage(element: Element, context: ParseContext): JSONContent | null {
	for (const candidate of children(element)) {
		const name = tagName(candidate)
		if (name === 'drawing') {
			const image = readInlineImage(candidate, context)
			if (image) return image
			// Drawing yang tak terbaca (mis. mengambang) bukan gambar - tapi
			// tetap dicatat, supaya pengguna tahu sesuatu tak ikut.
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
	/**
	 * Gambar yang ditemui selama menelusuri isi. Editor memperlakukan gambar
	 * sebagai blok, bukan bagian teks, jadi ia tidak boleh dicampur ke `inline`.
	 */
	images: JSONContent[]
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

				// Gambar adalah blok tersendiri, bukan isi teks, jadi ia tidak ikut
				// ke `inline` - melainkan dikumpulkan untuk dikeluarkan sebagai blok
				// di tingkat paragraf.
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
	// sengaja tidak ikut diwariskan ke run - persis seperti Word. Yang memakainya
	// hanya nomor otomatis, yang memang digambar bersama tanda paragraf.
	const runProps = style.run
	const markProps = merge(runProps, readRunProps(child(pPr, 'rPr')))

	const attrs = paragraphAttrs(paragraphProps)

	const level = headingLevel(paragraphProps, style.name)

	/*
	 * numId 0 bukan "daftar nomor nol" - ia cara Word menyatakan bahwa paragraf
	 * ini justru tidak bernomor. Nomor otomatis Word bukan teks, jadi tanpa
	 * langkah ini ia hilang sama sekali. Di sini nomornya dihitung sekali saat
	 * impor lalu dibakar sebagai teks di awal heading - bukan dihitung hidup,
	 * sebab editor ini memperlakukan heading sebagai penanda struktural biasa.
	 *
	 * Rupa nomor mengikuti properti tanda paragraf (`markProps`), persis seperti
	 * Word menggambar nomornya - terpisah dari rupa teks paragrafnya.
	 */
	const builder: ParagraphBuilder = { blocks: [], inline: [], images: [], attrs }
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

	// Paragraf yang isinya hanya gambar menjadi blok gambar tingkat atas, bukan
	// paragraf - sebab gambar di editor ini adalah blok, bukan bagian teks.
	// Paragraf yang memuat gambar bersama teks (jarang) menempatkan gambar
	// setelah paragraf teksnya, sebagai blok terpisah.
	const imageOnly = builder.images.length > 0 && builder.inline.length === 0
	if (!imageOnly || level !== undefined) {
		const blockAttrs = level ? { ...attrs, level } : attrs

		builder.blocks.push({
			type: level ? 'heading' : 'paragraph',
			...(Object.keys(blockAttrs).length > 0 ? { attrs: blockAttrs } : {}),
			...(builder.inline.length > 0 ? { content: builder.inline } : {}),
		})
	}
	for (const image of builder.images) builder.blocks.push(image)

	// Paragraf hasil pemotongan pemisah halaman terlanjur dibuat sebagai
	// paragraf biasa; judulnya ada di potongan terakhir, dan itu sudah benar.
	if (paragraphProps.pageBreakBefore) builder.blocks.unshift({ type: PAGE_BREAK_NODE })

	return builder.blocks
}

/**
 * Perataan vertikal sel Word jadi padanan CSS.
 *
 * `vAlign` berbobot: sel tanpanya merata atas, bukan tengah, jadi diamnya
 * berarti `top` dan tidak perlu ditulis.
 */
const VERTICAL_ALIGN: Record<string, string> = {
	top: 'top',
	center: 'middle',
	bottom: 'bottom',
}

/**
 * Properti sebuah sel tabel jadi atribut dan gaya node Tiptap.
 *
 * Arsiran (`shd`) sengaja tidak dibawa: konvensi editor memakai sel polos, dan
 * warna latar dari Word kerap hanya penanda gaya, bukan makna. Margin sel
 * (`tcMar`) diterjemahkan ke padding CSS; perataan vertikal (`vAlign`) ke gaya
 * yang sama. Keduanya dinyatakan pada sel, bukan pada paragraf di dalamnya.
 */
function cellStyleOf(tcPr: Element | null): Record<string, unknown> {
	if (!tcPr) return {}

	const declarations: string[] = []

	const vAlign = val(child(tcPr, 'vAlign'))
	if (vAlign && VERTICAL_ALIGN[vAlign]) declarations.push(`vertical-align: ${VERTICAL_ALIGN[vAlign]}`)

	// Margin sel disimpan per sisi sebagai anak elemen (`<w:top w:w="60"/>`),
	// bukan sebagai atribut `tcMar` itu sendiri. Tiap sisi membawa `w:w` dxa.
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

/**
 * Isi sebuah sel tabel (`w:tc`) jadi deretan blok.
 *
 * Sel wajib berisi setidaknya satu paragraf; skema tabel Tiptap menolak sel
 * kosong. Isinya adalah paragraf-paragraf berformat - dibaca memakai jalur yang
 * sama dengan naskah biasa, sehingga teks ber-font Consolas dan tebal-miring
 * di dalam tabel ikut utuh.
 */
function cellContent(tc: Element, context: ParseContext): JSONContent[] {
	const blocks: JSONContent[] = []
	for (const node of children(tc)) {
		if (tagName(node) === 'p') blocks.push(...paragraphBlocks(node, context))
	}
	// Sel tanpa paragraf, atau yang isinya hanya elemen tak dikenal, tetap
	// membutuhkan satu paragraf agar selnya sah.
	return blocks.length > 0 ? blocks : [{ type: 'paragraph' }]
}

/**
 * Sebuah baris tabel (`w:tr`) jadi node `tableRow`.
 *
 * Baris yang ditandai `tblHeader` menjadi baris judul (`tableHeader`), yang
 * digambar ulang di puncak lembar lanjutan. Sel-selnya punya tipe berbeda
 * (`tableHeader` vs `tableCell`) sebab Tiptap membedakan keduanya, bukan sekadar
 * menandai barisnya.
 */
function tableRowBlocks(row: Element, context: ParseContext): JSONContent {
	const isHeader = child(row, 'trPr') ? child(child(row, 'trPr'), 'tblHeader') !== null : false

	const cells: JSONContent[] = []
	for (const tc of children(row, 'tc')) {
		const attrs = cellStyleOf(child(tc, 'tcPr'))
		cells.push({
			type: isHeader ? 'tableHeader' : 'tableCell',
			...(Object.keys(attrs).length > 0 ? { attrs } : {}),
			content: cellContent(tc, context),
		})
	}

	// Baris tanpa sel tidak sah di skema Tiptap; lebih aman dilewati.
	if (cells.length === 0) return { type: 'tableRow', content: [{ type: 'tableCell', content: [{ type: 'paragraph' }] }] }
	return { type: 'tableRow', content: cells }
}

/**
 * Sebuah tabel Word (`w:tbl`) jadi satu blok `table`.
 *
 * Tabel sederhana tanpa penggabungan sel adalah kasus umum dan di sini jadi
 * jalur utama. Penggabungan horizontal (`gridSpan`) dan vertikal (`vMerge`)
 * belum ditangani: bila muncul, dicatat sebagai peringatan alih-alih membuat
 * tabel yang salah.
 */
function tableBlocks(tbl: Element, context: ParseContext): JSONContent[] {
	// Pemindaian manual untuk penggabungan sel: `querySelector` tidak andal di
	// pohon dengan namespace, jadi tiap `tcPr` diperiksa langsung. Bila ada,
	// dicatat sebagai peringatan alih-alih membuat tabel yang salah.
	let hasMerge = false
	for (const tr of children(tbl, 'tr')) {
		for (const tc of children(tr, 'tc')) {
			const tcPr = child(tc, 'tcPr')
			if (tcPr && (child(tcPr, 'gridSpan') || child(tcPr, 'vMerge'))) {
				hasMerge = true
				break
			}
		}
		if (hasMerge) break
	}
	if (hasMerge) skip(context, 'merged-cell')

	const rows: JSONContent[] = []
	for (const tr of children(tbl, 'tr')) rows.push(tableRowBlocks(tr, context))

	// Atribut tabel: perataan (`jc`) menempatkan tabel di halaman; `repeatHeader`
	// dihidupkan bila ada setidaknya satu baris judul.
	const jc = val(child(child(tbl, 'tblPr'), 'jc'))
	const hasHeader = rows.some((row) => row.content?.some((cell) => cell.type === 'tableHeader'))

	const attrs: Record<string, unknown> = {}
	if (jc === 'center' || jc === 'right') attrs.textAlign = jc
	// repeatHeader berbenawa true; hanya ditulis saat dimatikan, jadi di sini
	// tidak perlu menyebutnya bila memang hidup.
	if (!hasHeader) attrs.repeatHeader = false

	// Tabel kosong ditolak skema; pastikan ada satu sel.
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

/**
 * Setelan halaman sebagian - bentuk yang dibawa pembatas section dan hasil
 * impor. Marginnya pun boleh sebagian: sisi yang tidak disebut mewarisi.
 */
export type PageSetupPatch = Partial<Omit<PageSetup, 'margins'>> & { margins?: Partial<PageMargins> }

/** Properti sebuah section Word, sudah dinormalisasi ke model editor. */
interface SectionProps {
	pageSetup: PageSetupPatch
	columns: { count: number; gap?: number } | null
	/** `w:type val="continuous"` (E5); kesahihannya diputuskan lewat geometri. */
	continuous?: boolean
}

/**
 * Cocokkan ukuran kertas balik ke `PAGE_SIZES` (E4).
 *
 * Kertas standar tidak boleh pulang sebagai "Ukuran khusus" dengan angka yang
 * kebetulan sama: dokumen A4 yang terbaca sebagai 794 × 1123 khusus adalah
 * impor yang gagal menyebut namanya. Toleransi 2 px menampung pembulatan twip
 * (11906 twip-nya A4 memang 793,7 px).
 */
function matchPageSize(width: number, height: number): PageSizeId | null {
	for (const [id, size] of Object.entries(PAGE_SIZES)) {
		if (id === 'custom') continue
		if (Math.abs(size.width - width) <= 2 && Math.abs(size.height - height) <= 2) {
			return id as PageSizeId
		}
	}
	return null
}

/**
 * Satu `w:sectPr` jadi properti section yang dinormalisasi.
 *
 * `w:type` dibaca apa adanya: hanya `continuous` yang berarti khusus (E5) -
 * `nextPage`, `evenPage`, dan `oddPage` memang pembatas halaman. Apakah
 * `continuous` itu SAH diputuskan bukan di sini melainkan saat rantai section
 * disusun: satu lembar hanya punya satu ukuran kertas, jadi "menerus" yang
 * mengubah geometri turun pangkat jadi pembatas biasa (putusan §9 PRD).
 */
function readSectPr(sectPr: Element): SectionProps {
	const pageSetup: PageSetupPatch = {}

	const pgSz = child(sectPr, 'pgSz')
	const width = twipsToPx(Number.parseInt(attr(pgSz, 'w') ?? '', 10))
	const height = twipsToPx(Number.parseInt(attr(pgSz, 'h') ?? '', 10))
	if (pgSz && width > 0 && height > 0) {
		const landscape = attr(pgSz, 'orient') === 'landscape'
		// Dua bentuk lanskap ditemui di alam liar: Word menulis sisi yang SUDAH
		// tertukar, sedangkan pustaka `docx` menulis bentuk tegak + `w:orient`.
		// Keduanya dinormalisasi ke tegak sebelum dicocokkan.
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
		// `header`, `footer`, dan `gutter` tidak punya padanan di model halaman kita.
		if (Object.keys(margins).length > 0) pageSetup.margins = margins
	}

	let columns: SectionProps['columns'] = null
	const cols = child(sectPr, 'cols')
	const count = Number.parseInt(attr(cols, 'num') ?? '', 10)
	if (Number.isFinite(count) && count >= 2) {
		columns = { count }
		const space = Number.parseInt(attr(cols, 'space') ?? '', 10)
		if (Number.isFinite(space)) columns.gap = twipsToPx(space)
		// Lebar per kolom (`w:col`) tidak dibawa: model kolom kita berukuran sama.
	}

	return { pageSetup, columns, ...(val(child(sectPr, 'type')) === 'continuous' ? { continuous: true } : {}) }
}

/** Isi `w:body` jadi deretan blok tingkat atas. */
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
				// `sectPr` di dalam pPr MENUTUP section yang berakhir di paragraf
				// ini - ia bukan properti paragrafnya.
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

			// `sectPr` di tingkat badan milik section TERAKHIR: ia menutup dokumen,
			// bukan paragraf mana pun (jebakan E4 - membacanya seperti sectPr
			// paragraf menggeser seluruh section satu langkah).
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

/** Gabungkan patch ke setelan dasar; marginnya digabung per sisi. */
function mergeSetup(base: PageSetup, patch: PageSetupPatch): PageSetup {
	return { ...base, ...patch, margins: { ...base.margins, ...patch.margins } }
}

/**
 * Isi `w:body` beserta struktur section-nya (E4).
 *
 * DOCX dan editor menandai section dari dua arah yang berlawanan: `sectPr`
 * MENUTUP section-nya - propertinya milik isi di BELAKANGNYA - sedangkan
 * `sectionBreak` MEMBUKA section-nya. Karena itu pembacaan berjalan dua tahap:
 * telusuri isi sambil mencatat di blok ke berapa tiap section berakhir, lalu
 * susun ulang jadi [isi S1][pembatas(S2)][isi S2]…
 *
 * Setelan section pertama tidak menjadi pembatas - ia milik naskah itu sendiri,
 * dan dikembalikan terpisah untuk dipasang sebagai tata letak tab.
 */
export function readBody(
	body: Element,
	context: ParseContext,
): { blocks: JSONContent[]; pageSetup?: PageSetupPatch } {
	const endings: { at: number; props: SectionProps }[] = []
	const raw = bodyBlocks(body, context, (props, endedAt) => endings.push({ at: endedAt, props }))

	// Kolom section pertama tidak punya tempat: section dasar editor tidak bisa
	// berkolom (kolom selalu dibuka pembatas). Dilaporkan, bukan dibuang diam-diam.
	if (endings[0]?.props.columns) skip(context, 'kolom-bagian-pertama')

	const last = endings[endings.length - 1]
	// Dokumen satu section - bentuk yang umum - tidak butuh pembatas sama sekali.
	if (!last || (endings.length === 1 && last.at >= raw.length)) {
		return { blocks: raw, pageSetup: last?.props.pageSetup }
	}

	const blocks: JSONContent[] = []
	let start = 0
	// Rantai setelan per section, untuk memutuskan kemenerusan yang sebenarnya.
	let resolved = mergeSetup(DEFAULT_PAGE_SETUP, endings[0]?.props.pageSetup ?? {})
	endings.forEach(({ at, props }, index) => {
		if (index > 0) {
			const next = mergeSetup(resolved, props.pageSetup)
			// "Menerus" yang mengubah geometri lembar turun pangkat DI SINI (E5):
			// ia masuk naskah sebagai pembatas halaman biasa, bukan sebagai
			// pembatas menerus yang berbohong - satu lembar hanya punya satu
			// ukuran kertas.
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
	// Isi sesudah section terakhir - tak pernah ada di DOCX yang sah, tapi
	// dokumen rakitan alat lain bisa begitu - tetap diikutsertakan.
	blocks.push(...raw.slice(start))

	return { blocks, pageSetup: endings[0]?.props.pageSetup }
}

/** Elemen `w:body` di dalam sebuah `document.xml` yang sudah diurai. */
export function bodyOf(documentRoot: Element): Element | null {
	return descend(documentRoot, 'body')
}
