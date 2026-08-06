/**
 * Properti paragraf dan run, dibaca apa adanya dari OOXML.
 *
 * Bentuknya sengaja masih memakai satuan Word - twip untuk jarak, setengah
 * poin untuk ukuran huruf - karena di sinilah kita masih setia pada berkas
 * aslinya. Penerjemahan ke satuan editor terjadi belakangan, di satu tempat,
 * supaya pembulatannya tidak tersebar.
 */

import { attr, child, children, intVal, onOff, val } from './xml'

/** Perataan paragraf, sudah dinamai seperti yang dipakai editor. */
export type Alignment = 'left' | 'center' | 'right' | 'justify'

export interface ParagraphProps {
	outlineLevel?: number
	alignment?: Alignment
	/** Jarak dari margin, dalam twip. `firstLine` positif menjorok, negatif menggantung. */
	indentLeft?: number
	indentRight?: number
	indentFirstLine?: number
	/** Spasi baris dalam twip, beserta aturan pembacaannya. */
	line?: number
	lineRule?: 'auto' | 'exact' | 'atLeast'
	spaceBefore?: number
	spaceAfter?: number
	/** Penomoran otomatis; angkanya baru dihitung di tahap penomoran. */
	numId?: number
	numLevel?: number
	pageBreakBefore?: boolean
}

export interface RunProps {
	bold?: boolean
	italic?: boolean
	underline?: boolean
	strike?: boolean
	/** Ukuran huruf dalam setengah poin, sebagaimana `w:sz` menyimpannya. */
	halfPoints?: number
	font?: string
	/**
	 * Rujukan ke font tema (`minorHAnsi`, `majorHAnsi`), bukan nama font.
	 *
	 * Disimpan mentah karena namanya baru diketahui setelah theme1.xml dibaca,
	 * dan `font` yang disebut langsung selalu menang atas rujukan ini.
	 */
	fontTheme?: string
	/** Warna heksa tanpa tanda pagar, atau 'auto'. */
	color?: string
	highlight?: string
	caps?: boolean
	smallCaps?: boolean
	vertAlign?: 'superscript' | 'subscript'
	/** Teks yang tidak boleh dieja-periksa; Word menandainya per run. */
	noProof?: boolean
}

/**
 * Menyalin nilai yang benar-benar ada.
 *
 * Sebaran objek biasa (`{...base, ...over}`) menimpa dengan `undefined`, dan di
 * sini `undefined` justru berarti "tidak berpendapat, pakai warisan induk".
 * Membedakan keduanya adalah seluruh inti pewarisan gaya Word.
 */
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

/** Membaca satu blok `w:pPr`. */
export function readParagraphProps(pPr: Element | null): ParagraphProps {
	if (!pPr) return {}

	const props: ParagraphProps = {}

	const outline = intVal(child(pPr, 'outlineLvl'))
	// 9 adalah nilai Word untuk "teks isi" - hadir, tapi justru berarti bukan judul.
	if (outline !== undefined && outline < 9) props.outlineLevel = outline

	const alignment = val(child(pPr, 'jc'))
	if (alignment && ALIGNMENTS[alignment]) props.alignment = ALIGNMENTS[alignment]

	const indent = child(pPr, 'ind')
	if (indent) {
		// `start`/`end` adalah nama baru untuk `left`/`right`; berkas dari Word
		// versi berbeda memakai salah satunya.
		props.indentLeft = twips(indent, 'left') ?? twips(indent, 'start')
		props.indentRight = twips(indent, 'right') ?? twips(indent, 'end')

		const firstLine = twips(indent, 'firstLine') ?? twips(indent, 'firstLineChars')
		const hanging = twips(indent, 'hanging') ?? twips(indent, 'hangingChars')
		// Word memisahkan menjorok dan menggantung jadi dua atribut; editor
		// menyatukannya pada satu sumbu, seperti `text-indent` di CSS.
		if (hanging !== undefined) props.indentFirstLine = -hanging
		else if (firstLine !== undefined) props.indentFirstLine = firstLine
	}

	const spacing = child(pPr, 'spacing')
	if (spacing) {
		props.line = twips(spacing, 'line')
		props.lineRule = LINE_RULES[attr(spacing, 'lineRule') ?? ''] ?? undefined

		// Jarak "otomatis" berarti Word yang menghitungnya, dan angka yang
		// tersimpan di sebelahnya diabaikan. Membacanya tetap sebagai jarak akan
		// memaku nilai yang bahkan tidak dipakai Word sendiri.
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

/** Membaca satu blok `w:rPr`. */
export function readRunProps(rPr: Element | null): RunProps {
	if (!rPr) return {}

	const props: RunProps = {}

	props.bold = onOff(child(rPr, 'b'))
	props.italic = onOff(child(rPr, 'i'))
	props.strike = onOff(child(rPr, 'strike'))
	props.caps = onOff(child(rPr, 'caps'))
	props.smallCaps = onOff(child(rPr, 'smallCaps'))
	props.noProof = onOff(child(rPr, 'noProof'))

	// Garis bawah bukan properti nyala/mati: nilainya menyebut jenis garis, dan
	// 'none' adalah cara mematikannya.
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

	// Kunci yang tidak berpendapat dibuang, supaya `merge` bisa membedakan
	// "tidak disebut" dari "disebut dan bernilai salah".
	for (const key of Object.keys(props) as (keyof RunProps)[]) {
		if (props[key] === undefined) delete props[key]
	}

	return props
}

/** Satu definisi gaya di `styles.xml`, sebelum rantai `basedOn`-nya ditelusuri. */
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
	/** Gaya bawaan dokumen, dari `w:docDefaults`. */
	defaultParagraph: ParagraphProps
	defaultRun: RunProps
	/** Gaya paragraf yang berlaku saat sebuah paragraf tidak menyebut gayanya. */
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

		// `w:default` adalah atribut pada elemen gayanya, bukan anak seperti
		// properti lain di styles.xml. Gaya inilah yang berlaku pada paragraf yang
		// tidak menyebut gayanya sendiri - di sebuah naskah, itu hampir seluruhnya.
		const isDefault = attr(style, 'default')
		if (type === 'paragraph' && isDefault !== undefined && isDefault !== '0' && isDefault !== 'false') {
			styles.defaultParagraphStyleId = id
		}
	}

	return styles
}

/**
 * Menelusuri rantai `basedOn` sampai ke akar, lalu menumpuk kembali ke bawah.
 *
 * Arah ini penting: gaya paling umum harus dipasang lebih dulu supaya turunan
 * yang lebih khusus bisa menimpanya. Inilah yang membuat `Heading awal` -
 * turunan `heading 1` yang hanya membatalkan penomoran - tetap dikenali sebagai
 * judul, dan `Caption Tabel` tetap tebal dan rata tengah meski keduanya
 * mewarisi sifat itu dari induknya, bukan menyebutkannya sendiri.
 */
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
