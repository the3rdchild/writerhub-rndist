'use client'

import type { JSONContent } from '@tiptap/core'
import { Fragment, type Node as PMNode } from '@tiptap/pm/model'
import { type DocumentTypography, resolveParagraphStyle } from '@writer-hub/shared'
import type { ParagraphChild } from 'docx'
import { COLUMN_BREAK_NODE } from '@/features/editor/column-break'
import { sanitizeDiagramSvg } from '@/features/editor/diagram-svg'
import { HTML_BLOCK } from '@/features/editor/html-block'
import { rasterizeSvg } from '@/features/editor/html-raster'
import { defaultNumberingType } from '@/features/editor/list-numbering'
import { PAGE_BREAK_NODE } from '@/features/editor/page-break'
import type { PageFurniture } from '@/features/editor/page-furniture/model'
import {
	type PageGeometry,
	type PageSetup,
	pageGeometry,
	resolvePageSize,
	sameSheetGeometry,
} from '@/features/editor/page-geometry'
import { SECTION_BREAK_NODE, type SectionSpan, sectionSpans } from '@/features/editor/section-break'
import type { TabStop } from '@/features/editor/tab-stops'
import { TOC_BLOCK } from '@/features/editor/toc-block'
import { readOutlineItems } from '@/features/editor/use-outline-plain'
import { DOCX_ALIGNMENT, docxTypographyStyles } from './docx/typography-styles'
import { createXmlParser } from './docx/xml'
import { LatexToOmml, ommlBuilder } from './export-docx-math'
import { finalizeDocx } from './export-docx-post'
import {
	CODE_FONT,
	CODE_SHADING,
	cssColorToHex,
	linkOfMarks,
	type RunStyle,
	runStyleOf,
} from './export-docx-runs'
import { captionParagraphStyles, QUOTE_COLOR, QUOTE_PARAGRAPH_STYLE } from './export-docx-styles'
import { cellTwips, tableGrid } from './export-docx-tables'
import {
	type TocEntry,
	tocAttrsOf,
	tocBlock,
	tocEntriesOf,
	tocLeaderOf,
	tocParagraphStyles,
} from './export-docx-toc'
import { watermarkAlpha, watermarkParagraphFactory } from './export-docx-watermark'
import { docxPositionedFurniture, docxSectionFurniture, type FurnitureContent } from './export-furniture'
import { collectImageSources, type ExportImage, imageBox, imageLabel, loadExportImage } from './export-images'

const TWIPS_PER_PX = 15

const px = (value: number) => Math.round(value * TWIPS_PER_PX)
const DEFAULT_COLUMN_GAP_PX = 24

// Inverse of toLineHeight in docx/units.ts (Word line multiple × 1.15 → CSS).
const CSS_LINE_TO_WORD = 1 / 1.15

type BorderStyleValue = 'single' | 'dashed' | 'dotted' | 'double'

const NO_BORDER = { style: 'none', size: 0, color: 'auto' } as const

const BORDER_STYLES: Record<string, BorderStyleValue> = {
	solid: 'single',
	dashed: 'dashed',
	dotted: 'dotted',
	double: 'double',
}

type BorderSpec = { style: BorderStyleValue; color: string; size: number } | typeof NO_BORDER

interface BorderAttrs {
	color?: unknown
	width?: unknown
	style?: unknown
}

/**
 * Garis (warna CSS, lebar px, gaya CSS) → garis docx, atau `null` bila tidak
 * ada yang diatur di tingkat ini (warisan dari tingkat di atasnya yang
 * berlaku).
 *
 * Cukup salah satu atribut: toolbar warna tabel hanya menulis `borderColor`,
 * dan di kanvas garis itu tampil dengan lebar bawaan 1 px. Dulu tanpa
 * `borderWidth` garisnya dibuang (TBL-11).
 */
function borderOf(own: BorderAttrs, inherited: BorderAttrs = {}): BorderSpec | null {
	if (!own.color && !own.width && !own.style) return null

	const width = Number(own.width) || Number(inherited.width) || 1
	// Lebar tanpa gaya digambar kanvas sebagai garis utuh, walau tabelnya polos.
	const style = String(own.style ?? (own.width ? 'solid' : (inherited.style ?? 'solid')))
	if (style === 'none' || style === 'hidden') return NO_BORDER

	const rawColor = own.color ?? inherited.color
	if (rawColor === 'transparent' && !own.width) return NO_BORDER
	const color = cssColorToHex(rawColor) ?? (own.width ? '000000' : 'auto')
	// docx size dalam perdelapan titik: px * 0.75 pt * 8 = px * 6.
	return { style: BORDER_STYLES[style] ?? 'single', color, size: Math.max(2, Math.round(width * 6)) }
}

function cellBordersOf(cell: PMNode, table: PMNode) {
	const border = borderOf(
		{ color: cell.attrs.borderColor, width: cell.attrs.borderWidth, style: cell.attrs.borderStyle },
		table.attrs.borderStyle === 'none'
			? { style: 'none' }
			: { color: table.attrs.borderColor, width: table.attrs.borderWidth, style: table.attrs.borderStyle },
	)
	if (!border) return null
	return { top: border, bottom: border, left: border, right: border }
}

/** CSS padding shorthand (px values) → [top, right, bottom, left] in px. */
function cellPaddingOf(cell: PMNode): [number, number, number, number] | null {
	const padding = cell.attrs.cellPadding as string | null | undefined
	if (!padding) return null
	const parts = padding
		.split(/\s+/)
		.filter(Boolean)
		.map((part) => Math.round(Number.parseFloat(part) || 0))
	if (parts.length === 0) return null
	const [top = 0, right = top, bottom = top, left = right] = parts
	return [top, right, bottom, left]
}

/** CSS padding shorthand (px values) → docx cell margins in twips. */
function cellMarginsOf(cell: PMNode) {
	const padding = cellPaddingOf(cell)
	if (!padding) return null
	const [top, right, bottom, left] = padding
	return { top: px(top), right: px(right), bottom: px(bottom), left: px(left) }
}

/** Margin kiri/kanan sel bawaan Word: 0,08 inci (108 twips). */
const WORD_CELL_MARGIN_PX = 108 / TWIPS_PER_PX

/** Lebar yang dimakan padding kiri dan kanan sel, dalam px. */
function cellInsetOf(cell: PMNode): number {
	const padding = cellPaddingOf(cell)
	return padding ? padding[1] + padding[3] : 2 * WORD_CELL_MARGIN_PX
}

const VERTICAL_ALIGN: Record<string, 'top' | 'center' | 'bottom'> = {
	top: 'top',
	middle: 'center',
	bottom: 'bottom',
}

/** Latar sel judul tabel di kanvas: `--overlay-hover` di atas kertas putih. */
const HEADER_FILL = cssColorToHex('rgba(15, 23, 42, 0.04)') ?? 'F5F6F7'

/** Garis kiri kutipan (`--border-strong` di atas putih, 3 px). */
const QUOTE_BORDER = {
	style: 'single' as const,
	size: 18,
	color: cssColorToHex('rgba(15, 23, 42, 0.14)') ?? 'DDDEE1',
	// Jarak garis ke teks, titik: ±1em kanvas.
	space: 10,
}

/** Lekukan isi kutipan: garis 3 px + padding 1em (px). */
const QUOTE_INDENT_PX = 18

/** Satu tingkat daftar di kanvas: `padding-left: 1.6em` (±24 px pada 11 pt). */
const LIST_STEP_PX = 24

/** Lebar kotak centang + jaraknya ke teks di kanvas (px). */
const TASK_INDENT_PX = 24

/** Warna butir centang yang selesai (`--foreground-subtle`, dicoret). */
const DONE_TASK_COLOR = '6B7280'

/** Rupa callout per jenis - warna garis kiri dan latar dari CSS kanvas. */
const CALLOUT_LOOK: Record<string, { border: string; fill: string }> = Object.fromEntries(
	(
		[
			['info', '3B82F6', 'rgba(59, 130, 246, 0.08)'],
			['note', '6B7280', 'rgba(107, 114, 128, 0.08)'],
			['tip', '10B981', 'rgba(16, 185, 129, 0.08)'],
			['warning', 'F59E0B', 'rgba(245, 158, 11, 0.1)'],
			['success', '22C55E', 'rgba(34, 197, 94, 0.08)'],
			['error', 'EF4444', 'rgba(239, 68, 68, 0.08)'],
		] as const
	).map(([type, border, fill]) => [type, { border, fill: cssColorToHex(fill) ?? 'F5F6F7' }]),
)

/**
 * `line-height` blok → `w:spacing` (TKS-6).
 *
 * Angka tanpa satuan, `em`, dan persen semuanya kelipatan ukuran huruf CSS:
 * `"200%"` dari tempelan Word sama dengan `2`. Dulu `parseFloat("200%")`
 * dibaca sebagai kelipatan 200 dan menjadi `w:line="41739"` - 174 kali spasi
 * tunggal. px dan pt menjadi tinggi baris tepat.
 */
export function lineSpacingOf(value: unknown): { line: number; lineRule: 'auto' | 'exact' } | null {
	if (typeof value !== 'string' && typeof value !== 'number') return null
	const text = String(value).trim().toLowerCase()
	if (!text || text === 'normal') return null
	const number = Number.parseFloat(text)
	if (!Number.isFinite(number) || number <= 0) return null

	if (text.endsWith('px')) return { line: px(number), lineRule: 'exact' }
	if (text.endsWith('pt')) return { line: Math.round(number * 20), lineRule: 'exact' }
	const factor = text.endsWith('%') ? number / 100 : number
	return { line: Math.round(factor * CSS_LINE_TO_WORD * 240), lineRule: 'auto' }
}

/** Paragraph spacing attrs (BlockSpacing) → docx spacing options. */
function spacingOf(node: PMNode): Record<string, unknown> {
	const before = Number(node.attrs.spaceBefore) || 0
	const after = Number(node.attrs.spaceAfter) || 0
	const line = lineSpacingOf(node.attrs.lineHeight)

	if (!before && !after && !line) return {}
	return {
		spacing: {
			...(before ? { before: px(before) } : {}),
			...(after ? { after: px(after) } : {}),
			...(line ?? {}),
		},
	}
}

/**
 * Saklar penanganan halaman milik satu blok (`features/editor/block-keep.ts`)
 * menjadi properti paragraf DOCX.
 *
 * Sebelumnya keempatnya berhenti di kanvas: butir menu "Tambah hentian halaman
 * sebelum" menghasilkan CSS `break-before` yang hanya berlaku saat mencetak,
 * dan tidak satu pun ikut ke berkas hasil ekspor.
 */
function blockKeepOf(node: PMNode): Record<string, unknown> {
	return {
		...(node.attrs.pageBreakBefore === true ? { pageBreakBefore: true } : {}),
		...(node.attrs.keepWithNext === true ? { keepNext: true } : {}),
		...(node.attrs.keepLines === true ? { keepLines: true } : {}),
		...(node.attrs.widowControl === false ? { widowControl: false } : {}),
	}
}

/**
 * Membaca URI `data:` PNG menjadi bita. Mengembalikan `null` untuk apa pun yang
 * bukan PNG - potretan yang gagal disimpan sebagai string kosong.
 */
function pngFromDataUrl(value: string): Uint8Array | null {
	const base64 = value.startsWith('data:image/png;base64,') ? value.slice(22) : null
	if (!base64) return null

	try {
		const binary = atob(base64)
		const bytes = new Uint8Array(binary.length)
		for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
		return bytes
	} catch {
		return null
	}
}

/**
 * SVG diagram di dokumen, tanpa kembar - dari kedua produsennya.
 *
 * Mermaid menyimpan hasil rendernya di atribut node, jadi ekspor menemukannya
 * sudah jadi. Diagram editorial tidak menyimpan apa pun: sumbernya **sudah**
 * SVG, dan yang perlu dilakukan di sini cuma menyaringnya - dengan penyaring
 * yang sama persis dengan yang dipakai layar, supaya yang tercetak tidak pernah
 * berbeda dari yang dilihat penulis.
 */
function collectDiagramSvgs(root: PMNode): Set<string> {
	const found = new Set<string>()
	root.descendants((node) => {
		if (node.type.name !== 'codeBlock') return

		if (node.attrs.language === 'mermaid') {
			const svg = String(node.attrs.mermaidSvg ?? '')
			if (svg) found.add(svg)
			return
		}

		if (node.attrs.language === 'diagram') {
			const { svg } = sanitizeDiagramSvg(node.textContent)
			if (svg) found.add(svg)
		}
	})
	return found
}

export function mergeTabContents(tabs: JSONContent[]): JSONContent {
	const content: JSONContent[] = []
	for (const [index, tab] of tabs.entries()) {
		if (index > 0) content.push({ type: PAGE_BREAK_NODE })
		content.push(...(tab.content ?? []))
	}
	if (content.length === 0) content.push({ type: 'paragraph' })
	return { type: 'doc', content }
}

/**
 * Isi catatan kaki yang tersimpan di rujukannya sendiri (`footnoteRef.attrs.content`,
 * larik node sebaris JSON) sebagai satu paragraf, atau `null` bila kosong.
 * Node blok yang nyasar dibuang; JSON yang tidak sah jatuh ke teksnya saja.
 */
function footnoteContentOf(root: PMNode, content: unknown): PMNode | null {
	if (!Array.isArray(content) || content.length === 0) return null
	const { schema } = root.type
	try {
		const inline: PMNode[] = []
		Fragment.fromJSON(schema, content).forEach((node) => {
			if (node.isInline) inline.push(node)
		})
		return inline.length > 0 ? schema.nodes.paragraph.create(null, inline) : null
	} catch {
		const parts: string[] = []
		const walk = (nodes: unknown[]) => {
			for (const node of nodes) {
				if (!node || typeof node !== 'object') continue
				const { text, content: children } = node as { text?: unknown; content?: unknown }
				if (typeof text === 'string') parts.push(text)
				if (Array.isArray(children)) walk(children)
			}
		}
		walk(content)
		const text = parts.join('')
		return text ? schema.nodes.paragraph.create(null, schema.text(text)) : null
	}
}

/**
 * Isi setiap catatan kaki, bernomor menurut urutan rujukannya (`footnoteRef`)
 * di naskah - nomor yang sama dengan yang tampil di kanvas.
 *
 * Urutan sumber isinya:
 * 1. `footnoteRef.attrs.content` - model sekarang: isi menumpang di rujukannya,
 *    jadi menghapus rujukan ikut menghapus catatannya.
 * 2. Node `footnote` lama dengan `id` yang sama.
 * 3. Node `footnote` lama tanpa `id` (alat AI dan importer DOCX lama menaruhnya
 *    berurutan di akhir naskah), dipasangkan menurut urutan dengan rujukan yang
 *    belum berisi.
 * 4. Selain itu catatan kosong - nomornya tetap ada, sama seperti di layar.
 *
 * Node `footnote` lama yang terpakai masuk `paired` dan tidak dicetak lagi di
 * badan naskah; yang tidak dirujuk siapa pun tetap di tempatnya, bukan hilang.
 */
export function pairFootnotes(root: PMNode): {
	ids: Map<PMNode, number>
	bodies: Map<number, PMNode | null>
	paired: Set<PMNode>
} {
	const refs: PMNode[] = []
	const notes: PMNode[] = []
	root.descendants((node) => {
		if (node.type.name === 'footnote') {
			notes.push(node)
			return false
		}
		if (node.type.name === 'footnoteRef') refs.push(node)
		return true
	})

	const idOf = (node: PMNode) => {
		const id = node.attrs.id
		return typeof id === 'string' && id ? id : null
	}
	const byId = new Map<string, PMNode>()
	for (const note of notes) {
		const id = idOf(note)
		if (id && !byId.has(id)) byId.set(id, note)
	}

	const ids = new Map<PMNode, number>()
	const bodies = new Map<number, PMNode | null>()
	const paired = new Set<PMNode>()
	const waiting: number[] = []
	refs.forEach((ref, index) => {
		const wordId = index + 1
		ids.set(ref, wordId)
		const id = idOf(ref)
		const note = id ? byId.get(id) : undefined
		const own = footnoteContentOf(root, ref.attrs.content)
		if (own) {
			bodies.set(wordId, own)
			// Node lama ber-id sama milik rujukan ini juga: jangan tercetak di naskah.
			if (note) paired.add(note)
			return
		}
		if (note) {
			bodies.set(wordId, note)
			paired.add(note)
		} else waiting.push(wordId)
	})

	// Hanya isi lama tanpa id yang dipasangkan menurut urutan; isi ber-id yang
	// tidak dirujuk adalah yatim dan tetap di badan naskah.
	const pool = notes.filter((note) => !paired.has(note) && !idOf(note))
	waiting.forEach((wordId, index) => {
		const note = pool[index] ?? null
		bodies.set(wordId, note)
		if (note) paired.add(note)
	})
	return { ids, bodies, paired }
}

/** Jarak antar-kolom section, px; nilai rusak jatuh ke bawaan. */
const gapOf = (columns: { gap?: number }) =>
	Number.isFinite(columns.gap) && (columns.gap ?? 0) >= 0 ? (columns.gap as number) : DEFAULT_COLUMN_GAP_PX

/**
 * Lebar tak-sama → anak `w:col`, bentuk yang dipakai Word sendiri.
 *
 * Lebar di `SectionColumns` adalah PROPORSI (px pada saat impor), jadi ia
 * diskalakan ke lebar kolom teks section ini: dokumen yang berganti ukuran
 * kertas atau margin setelah diimpor tetap pulang dengan perbandingan kolom
 * yang sama. Word menaruh jarak antar-kolom pada `w:space` milik kolom KIRI
 * tiap celah, dan kolom terakhir tidak punya celah di kanannya.
 *
 * Tanpa lebar - atau bila jumlahnya tidak cocok dengan `count` - hasilnya
 * `equalWidth: true`, persis perilaku sebelum lebar tak-sama ikut terbawa.
 */
function columnWidthsOf(
	docx: typeof import('docx'),
	columns: NonNullable<SectionSpan['columns']>,
	contentWidth: number,
): { equalWidth: boolean; children?: InstanceType<typeof import('docx').Column>[] } {
	const widths = columns.widths
	if (!widths || widths.length !== columns.count || widths.some((width) => !(width > 0))) {
		return { equalWidth: true }
	}

	const gaps = columns.gaps
	const gapAfter = (index: number) =>
		index >= columns.count - 1
			? undefined
			: gaps && gaps.length === columns.count - 1 && gaps.every(Number.isFinite)
				? gaps[index]
				: gapOf(columns)

	const total = widths.reduce((sum, width) => sum + width, 0)
	const gapTotal = widths.reduce((sum, _, index) => sum + (gapAfter(index) ?? 0), 0)
	const usable = Math.max(1, contentWidth - gapTotal)

	return {
		equalWidth: false,
		children: widths.map((width, index) => {
			const space = gapAfter(index)
			return new docx.Column({
				width: px((width / total) * usable),
				...(space === undefined ? {} : { space: px(space) }),
			})
		}),
	}
}

/**
 * Lebar kolom teks sebuah section: seluruh area teks, atau satu kolom bila
 * section-nya berkolom - tabel dan gambar di kolom tidak boleh melebihi
 * kolomnya. Kolom tak-sama: kolom tersempit.
 */
function columnTextWidth(span: SectionSpan | undefined, fallback: PageGeometry): number {
	const width = span ? pageGeometry(span.setup).contentWidth : fallback.contentWidth
	const columns = span?.columns
	if (!columns || columns.count < 2) return width

	const gapTotal =
		columns.gaps && columns.gaps.length === columns.count - 1 && columns.gaps.every(Number.isFinite)
			? columns.gaps.reduce((sum, gap) => sum + gap, 0)
			: gapOf(columns) * (columns.count - 1)
	const usable = Math.max(1, width - gapTotal)
	const widths = columns.widths
	if (widths && widths.length === columns.count && widths.every((value) => value > 0)) {
		const total = widths.reduce((sum, value) => sum + value, 0)
		return Math.min(...widths.map((value) => (value / total) * usable))
	}
	return usable / columns.count
}

/** Wadah tempat sebuah blok sedang dibangun - pengganti pewarisan CSS kanvas. */
interface BlockContext {
	/** Lekukan kiri tambahan dari wadah (kutipan, butir daftar), px. */
	indent: number
	/**
	 * Di dalam wadah (sel, daftar, kutipan, callout): gaya paragraf badan naskah
	 * tidak berlaku, sama seperti `.document-body > p` di kanvas.
	 */
	nested: boolean
	/** Di dalam kutipan: garis kiri. */
	quote: boolean
	/** Rupa run warisan wadah (judul tabel tebal, kutipan miring, centang dicoret). */
	run: RunStyle
}

export async function exportDocx(
	root: PMNode,
	{
		title,
		geometry,
		setup,
		furniture,
		furnitureContent,
		typography,
		showPageNumbers = true,
	}: {
		title: string
		geometry: PageGeometry
		setup?: PageSetup
		/** Header/footer dokumen (baris lama); null berarti tanpa perabot halaman. */
		furniture?: PageFurniture | null
		/** Isi kaya per slot+varian — menang atas baris lama. */
		furnitureContent?: FurnitureContent | null
		/**
		 * Rupa huruf dokumen. Tanpa ini Word memakai gaya judul bawaannya, dan
		 * berkas hasil ekspor tidak lagi serupa dengan yang tampil di kanvas.
		 */
		typography?: DocumentTypography | null
		/**
		 * Nomor halaman otomatis (lencana layar) menyala? Bila ya dan tak ada
		 * perabot yang membawa nomor, ekspor menyintesis footer berisi field
		 * PAGE — menutup celah "bernomor di layar, tanpa nomor di DOCX". Dokumen
		 * pageless tidak bernomor di layar, jadi tidak disintesis.
		 */
		showPageNumbers?: boolean
	},
): Promise<Blob> {
	const docx = await import('docx')
	const {
		Document,
		Packer,
		Paragraph,
		TextRun,
		Table,
		TableRow,
		TableCell,
		HeadingLevel,
		WidthType,
		LevelFormat,
		ImageRun,
		Tab,
		TabStopType,
	} = docx
	const parseXml = await createXmlParser()
	const omml = ommlBuilder(docx)

	/** Gaya paragraf badan naskah (docDefaults) - yang tidak berlaku di dalam wadah. */
	const body = typography ? resolveParagraphStyle(typography) : null
	const basePt = typography?.baseFont.sizePt ?? 11

	const HEADINGS = [
		HeadingLevel.HEADING_1,
		HeadingLevel.HEADING_2,
		HeadingLevel.HEADING_3,
		HeadingLevel.HEADING_4,
		HeadingLevel.HEADING_5,
		HeadingLevel.HEADING_6,
	]

	let ctx: BlockContext = { indent: 0, nested: false, quote: false, run: {} }
	const within = <T>(patch: Partial<BlockContext>, build: () => T): T => {
		const outer = ctx
		ctx = { ...outer, ...patch, run: { ...outer.run, ...patch.run } }
		try {
			return build()
		} finally {
			ctx = outer
		}
	}

	const footnotes = pairFootnotes(root)

	/*
	 * Daftar isi: entri setiap blok dan penanda `_Toc…` pada judul yang
	 * dirujuknya, disiapkan sebelum penelusuran supaya judul tahu ia sasaran
	 * tautan sebuah entri.
	 */
	const outline = readOutlineItems(root)
	const tocEntries = new Map<PMNode, TocEntry[]>()
	const headingBookmarks = new Map<PMNode, string>()
	let firstToc: ReturnType<typeof tocAttrsOf> | null = null
	root.descendants((node) => {
		if (node.type.name !== TOC_BLOCK) return true
		const attrs = tocAttrsOf(node.attrs)
		firstToc ??= attrs
		const entries = tocEntriesOf(attrs, outline)
		tocEntries.set(node, entries)
		for (const entry of entries) {
			const heading = entry.heading ? root.nodeAt(entry.heading.pos) : null
			if (heading && !headingBookmarks.has(heading)) {
				headingBookmarks.set(heading, `_Toc${100000000 + headingBookmarks.size + 1}`)
			}
		}
		return false
	})
	const bookmarkOf = (entry: TocEntry) => {
		const heading = entry.heading ? root.nodeAt(entry.heading.pos) : null
		return heading ? headingBookmarks.get(heading) : undefined
	}

	/** Rumus dalam baris: persamaan Word, atau sumber LaTeX berhuruf lebar-tetap. */
	const inlineMath = (latex: string): ParagraphChild[] => {
		const items = LatexToOmml.convert(latex, false, parseXml)
		if (items) return [omml.inline(items) as ParagraphChild]
		return latex.trim()
			? [
					new TextRun({
						text: latex,
						font: CODE_FONT,
						shading: { type: 'clear', fill: CODE_SHADING, color: 'auto' },
					}),
				]
			: []
	}

	const runsOf = (node: PMNode, lead: ParagraphChild[] = []): ParagraphChild[] => {
		const out: ParagraphChild[] = [...lead]
		/*
		 * Tautan: run berurutan dengan alamat yang sama menjadi satu
		 * `w:hyperlink` eksternal (TKS-4). Dulu mark `link` diabaikan dan
		 * teksnya keluar sebagai teks biasa.
		 */
		let link: { href: string; runs: InstanceType<typeof TextRun>[] } | null = null
		const flush = () => {
			if (link) out.push(new docx.ExternalHyperlink({ link: link.href, children: link.runs }))
			link = null
		}

		node.forEach((child) => {
			if (child.isText && child.text) {
				const href = linkOfMarks(child.marks)
				if (href !== (link?.href ?? null)) flush()
				if (href && !link) link = { href, runs: [] }
				const target: ParagraphChild[] = link ? link.runs : out
				const style = runStyleOf(child.marks, ctx.run, basePt)
				const options = link ? { style: 'Hyperlink', ...style } : style

				// VT (\v) adalah baris baru Word di papan klip teks polos.
				child.text
					.replace(/\v/g, '\n')
					.split('\n')
					.forEach((piece, index) => {
						if (index > 0) target.push(new TextRun({ break: 1 }))
						// Karakter \t di teks (impor lama) diterjemahkan ke run tab.
						piece.split('\t').forEach((part, i) => {
							if (i > 0) target.push(new TextRun({ children: [new Tab()], ...options }))
							if (part) target.push(new TextRun({ text: part, ...options }))
						})
					})
				return
			}

			flush()
			switch (child.type.name) {
				case 'hardBreak':
					out.push(new TextRun({ break: 1 }))
					break
				case 'tab':
					out.push(new TextRun({ children: [new Tab()] }))
					break
				case 'mathInline':
					out.push(...inlineMath(String(child.attrs.latex ?? '')))
					break
				case 'footnoteRef': {
					const id = footnotes.ids.get(child)
					if (id) out.push(new docx.FootnoteReferenceRun(id))
					break
				}
				default:
					// Atom sebaris lain: teksnya ikut, bukan hilang diam-diam.
					if (child.textContent) {
						out.push(new TextRun({ text: child.textContent, ...runStyleOf(child.marks, ctx.run, basePt) }))
					}
			}
		})
		flush()
		return out
	}

	const TAB_TYPE = {
		left: TabStopType.LEFT,
		right: TabStopType.RIGHT,
		center: TabStopType.CENTER,
	} as const

	/** Menerjemahkan `tabStops` paragraf ke opsi tab stop docx. */
	const tabStopsOf = (node: PMNode) => {
		const stops = (node.attrs.tabStops as TabStop[] | null | undefined)?.filter((stop) =>
			Number.isFinite(stop?.posPt),
		)
		if (!stops || stops.length === 0) return undefined
		return stops.map((s) => ({
			type: TAB_TYPE[s.type] ?? TabStopType.LEFT,
			// Posisinya dalam pt, bukan px: 1 pt = 20 twip. `px()` di sini membuat
			// tab stop 120 pt mendarat di 90 pt dan titik dua surat tidak sejajar.
			position: Math.round(s.posPt * 20),
		}))
	}

	/**
	 * Lekukan paragraf. Nilai 0 berarti "tidak diatur" - sama seperti kanvas,
	 * yang tidak menulis gaya apa pun untuknya - jadi lekukan gaya dokumen
	 * (baris pertama skripsi, lekukan judul) tetap berlaku. Dulu setiap
	 * paragraf menulis `w:ind` nol dan menimpanya.
	 *
	 * Di dalam wadah (sel, daftar, kutipan) gaya badan naskah tidak berlaku di
	 * kanvas, jadi lekukan baris pertama dan rata kanan-kirinya dinolkan.
	 */
	const indentOf = (node: PMNode, resetsBody: boolean): Record<string, number> | undefined => {
		const left = (Number(node.attrs.indentLeft) || 0) + ctx.indent
		const right = Number(node.attrs.indentRight) || 0
		const first = Number(node.attrs.indentFirstLine) || 0
		const indent: Record<string, number> = {}
		if (left) indent.left = px(left)
		else if (resetsBody && body?.indentPt) indent.left = 0
		if (right) indent.right = px(right)
		if (first > 0) indent.firstLine = px(first)
		else if (first < 0) indent.hanging = px(-first)
		else if (resetsBody && body?.firstLinePt) indent.firstLine = 0
		return Object.keys(indent).length > 0 ? indent : undefined
	}

	const paragraphOf = (
		node: PMNode,
		extra: Record<string, unknown> = {},
		lead: ParagraphChild[] = [],
	): InstanceType<typeof Paragraph> => {
		const textAlign = DOCX_ALIGNMENT[node.attrs.textAlign as string]
		const isParagraph = node.type.name === 'paragraph'
		/*
		 * Gaya badan naskah hanya untuk paragraf tingkat atas; baris rata
		 * tengah/kanan (sampul, tanda tangan) juga tidak membawa lekukan baris
		 * pertamanya - aturan yang sama dengan lembar gaya kanvas.
		 */
		const resetsBody = isParagraph && (ctx.nested || textAlign === 'center' || textAlign === 'right')
		const alignment =
			textAlign ?? (isParagraph && ctx.nested && body && body.align !== 'left' ? 'left' : undefined)
		const tabStops = tabStopsOf(node)
		const indent = indentOf(node, resetsBody)

		let children = runsOf(node, lead)
		const bookmark = headingBookmarks.get(node)
		if (bookmark) children = [new docx.Bookmark({ id: bookmark, children }) as unknown as ParagraphChild]

		return new Paragraph({
			children,
			...(ctx.quote && !['heading', 'style', 'bullet', 'numbering'].some((key) => key in extra)
				? { style: QUOTE_PARAGRAPH_STYLE.id }
				: {}),
			...(alignment ? { alignment } : {}),
			...(tabStops ? { tabStops } : {}),
			...blockKeepOf(node),
			...spacingOf(node),
			...(indent ? { indent } : {}),
			...(ctx.quote ? { border: { left: QUOTE_BORDER } } : {}),
			...extra,
		})
	}

	/** Paragraf pembawa objek (gambar, rumus, kode) di dalam wadah saat ini. */
	const objectParagraphProps = (resetBody = false): Record<string, unknown> => {
		const indent: Record<string, number> = {}
		if (ctx.indent) indent.left = px(ctx.indent)
		if (resetBody && body?.firstLinePt) indent.firstLine = 0
		return {
			...(Object.keys(indent).length > 0 ? { indent } : {}),
			...(ctx.quote ? { border: { left: QUOTE_BORDER } } : {}),
		}
	}

	let sectionContentWidth = geometry.contentWidth
	let sectionContentHeight = geometry.contentHeight

	/*
	 * Tinggi terbesar gambar: tinggi area isi dikurangi jarak paragraf badan
	 * naskah. Gambar yang lebih tinggi dari halaman dipotong Word (OBJ-14).
	 */
	const imageHeightRoom = () =>
		Math.max(1, sectionContentHeight - (body ? ((body.spaceBeforePt + body.spaceAfterPt) * 4) / 3 : 0) - 4)

	/*
	 * Spasi tunggal untuk paragraf gambar: Word mengalikan tinggi baris gambar
	 * dengan kelipatan spasi dokumen, jadi gambar setinggi halaman di naskah
	 * berspasi 1,5 tetap meluber.
	 */
	const IMAGE_SPACING = { spacing: { line: 240, lineRule: docx.LineRuleType.AUTO } }

	/*
	 * Dua tabel yang bersentuhan dilebur Word menjadi satu tabel - dua callout
	 * berurutan, atau tabel tepat sesudah callout, akan kehilangan batasnya.
	 * Di antara keduanya disisipkan paragraf setinggi satu em, kira-kira jarak
	 * `margin: 1em` callout di kanvas.
	 */
	const separateTables = <T>(blocks: T[]): T[] => {
		const out: T[] = []
		for (const block of blocks) {
			if (block instanceof Table && out.at(-1) instanceof Table) {
				out.push(
					new Paragraph({
						spacing: {
							before: 0,
							after: 0,
							line: Math.round(basePt * 20),
							lineRule: docx.LineRuleType.EXACT,
						},
					}) as T,
				)
			}
			out.push(block)
		}
		return out
	}

	const cellOf = (cell: PMNode, table: PMNode, widthTwips: number, span: number, rowSpan: number) => {
		/*
		 * Isi sel dibangun lewat `blockOf`, jalur yang sama dengan badan naskah.
		 * Dulu hanya blok teks yang diambil, jadi daftar, tabel bersarang, dan
		 * gambar di dalam sel hilang dari berkas walau tampil di layar dan PDF
		 * (UC9: grafik batang di sel terakhir Tabel 1.1), dan diagram tercetak
		 * sebagai sumber SVG-nya. Selama isinya dibangun, lebar area teks adalah
		 * lebar sel tanpa padding, supaya gambar dan tabel bersarang mengecil ke
		 * selnya, bukan ke lebar halaman.
		 */
		const header = cell.type.name === 'tableHeader'
		const plain = table.attrs.borderStyle === 'none'
		const children: InstanceType<typeof Paragraph | typeof Table>[] = []
		const outerWidth = sectionContentWidth
		sectionContentWidth = Math.max(1, widthTwips / TWIPS_PER_PX - cellInsetOf(cell))
		try {
			within(
				// Sel judul tebal seperti di kanvas (`th { font-weight: 600 }`) - TBL-12.
				{ indent: 0, nested: true, quote: false, run: header ? { bold: true } : {} },
				() => {
					cell.forEach((block) => {
						children.push(...(blockOf(block) as typeof children))
					})
				},
			)
		} finally {
			sectionContentWidth = outerWidth
		}
		if (children.length === 0) children.push(new Paragraph({}))
		const content = separateTables(children)

		// Latar sel judul bawaan kanvas (`th`), kecuali tabel polos - TBL-12.
		const fill =
			cell.attrs.backgroundColor === 'transparent'
				? null
				: (cssColorToHex(cell.attrs.backgroundColor) ?? (header && !plain ? HEADER_FILL : null))
		const margins = cellMarginsOf(cell)
		const borders = cellBordersOf(cell, table)
		const verticalAlign = VERTICAL_ALIGN[cell.attrs.verticalAlign as string]
		return new TableCell({
			children: content,
			// rowSpan > 1 otomatis membuat sel lanjutan vMerge di baris berikutnya.
			...(rowSpan > 1 ? { rowSpan } : {}),
			width: { size: widthTwips, type: WidthType.DXA },
			...(span > 1 ? { columnSpan: span } : {}),
			...(fill ? { shading: { type: docx.ShadingType.CLEAR, fill, color: 'auto' } } : {}),
			...(margins ? { margins } : {}),
			...(borders ? { borders } : {}),
			...(verticalAlign ? { verticalAlign } : {}),
		})
	}

	/*
	 * Diagram Mermaid yang sudah diratakan jadi PNG, berkunci SVG-nya.
	 *
	 * Dikumpulkan lebih dulu karena `blockOf` sinkron sementara rasterisasi
	 * tidak: satu-satunya cara gambar itu sampai ke sana adalah sudah jadi
	 * sebelum penelusuran dokumen dimulai. Kuncinya SVG dan bukan node-nya
	 * supaya dua diagram yang sama cukup digambar sekali.
	 */
	const mermaidImages = new Map<string, { png: Uint8Array; width: number; height: number }>()

	/** Isi berkas gambar naskah, berkunci `src`; `null` untuk yang gagal diambil. */
	const imageFiles = new Map<string, ExportImage | null>()

	const tableOf = (node: PMNode): unknown[] => {
		const indentLeft = ctx.indent + (Number(node.attrs.indentLeft) || 0)
		const indentRight = Number(node.attrs.indentRight) || 0
		// Indentasi tabel memakan ruang: tabel tidak boleh lewat margin kanan (TBL-6).
		const grid = tableGrid(node, sectionContentWidth - indentLeft - indentRight)
		const tableTwips = grid.columns.reduce((sum, value) => sum + value, 0)

		/*
		 * Baris tanpa sel tidak ditulis - Word menolak `w:tr` kosong. Baris
		 * seperti itu sah di ProseMirror: gabung sel 2×2 di tabel dua kolom
		 * meninggalkan baris yang seluruhnya tertutup rowspan dari atas. Rowspan
		 * lalu dihitung ulang atas baris yang benar-benar ditulis; tanpa itu sel
		 * lanjutan vMerge jatuh ke baris berikutnya dan menggeser sel-selnya ke
		 * luar kisi.
		 */
		const written: number[] = [0]
		node.forEach((row) => {
			written.push((written.at(-1) ?? 0) + (row.childCount > 0 ? 1 : 0))
		})
		const rowSpanOf = (rowIndex: number, cell: PMNode) => {
			const span = Math.max(1, Number(cell.attrs.rowspan) || 1)
			const end = Math.min(node.childCount, rowIndex + span)
			return Math.max(1, (written[end] ?? 0) - (written[rowIndex] ?? 0))
		}

		const repeatHeader = node.attrs.repeatHeader !== false
		const rows: InstanceType<typeof TableRow>[] = []
		let rowIndex = 0
		node.forEach((row) => {
			const cells: InstanceType<typeof TableCell>[] = []
			let headerRow = false
			let cellIndex = 0
			const places = grid.rows[rowIndex] ?? []
			row.forEach((cell) => {
				if (cell.type.name === 'tableHeader') headerRow = true
				const place = places[cellIndex] ?? { left: cellIndex, span: 1 }
				cells.push(cellOf(cell, node, cellTwips(grid, place), place.span, rowSpanOf(rowIndex, cell)))
				cellIndex += 1
			})
			rowIndex += 1
			const rowHeight = Number(row.attrs.rowHeight) || 0
			if (cells.length > 0) {
				rows.push(
					new TableRow({
						children: cells,
						...(rowHeight > 0 ? { height: { value: px(rowHeight), rule: docx.HeightRule.ATLEAST } } : {}),
						...(row.attrs.cantSplit === true ? { cantSplit: true } : {}),
						...(headerRow && repeatHeader ? { tableHeader: true } : {}),
					}),
				)
			}
		})
		// Tabel yang semua barisnya kosong tidak menjadi `w:tbl` tanpa `w:tr`.
		if (rows.length === 0) return []

		const tableBorder =
			node.attrs.borderStyle === 'none'
				? NO_BORDER
				: borderOf({
						color: node.attrs.borderColor,
						width: node.attrs.borderWidth,
						style: node.attrs.borderStyle,
					})
		const table = new Table({
			rows,
			// tblW, gridCol, dan tcW dari satu kisi - jumlahnya selalu sama (TBL-7).
			width: { size: tableTwips, type: WidthType.DXA },
			columnWidths: grid.columns,
			// Lebar tetap seperti kanvas (`table-layout: fixed`): Word tidak
			// melebarkan kolom mengikuti isinya.
			layout: docx.TableLayoutType.FIXED,
			...(indentLeft > 0 ? { indent: { size: px(indentLeft), type: WidthType.DXA } } : {}),
			/* Tabel polos (sampul, blok tanda tangan) harus tetap polos di Word:
			 * tanpa penanda ini docx memberi garis bawaan ke setiap tabel. */
			...(tableBorder
				? {
						borders: {
							top: tableBorder,
							bottom: tableBorder,
							left: tableBorder,
							right: tableBorder,
							insideHorizontal: tableBorder,
							insideVertical: tableBorder,
						},
					}
				: {}),
		})
		return [table]
	}

	// Referensi penomoran orderedList: format huruf/romawi dan nilai start non-1
	// butuh definisi abstract terpisah, jadi referensinya dirakit per kombinasi.
	const TYPE_FORMAT: Record<string, (typeof LevelFormat)[keyof typeof LevelFormat]> = {
		a: LevelFormat.LOWER_LETTER,
		A: LevelFormat.UPPER_LETTER,
		i: LevelFormat.LOWER_ROMAN,
		I: LevelFormat.UPPER_ROMAN,
	}

	/*
	 * Daftar tanpa gaya sendiri memakai penanda bawaan tiap tingkat seperti
	 * kanvas (1. → a. → i., `list-numbering.ts`); dulu semua tingkat "1." di Word
	 * sementara kanvas menulis a. dan i.
	 */
	const DEFAULT_LEVEL_FORMAT: Record<string, (typeof LevelFormat)[keyof typeof LevelFormat]> = {
		'1': LevelFormat.DECIMAL,
		...TYPE_FORMAT,
	}
	const orderedLevels = (
		format: (typeof LevelFormat)[keyof typeof LevelFormat] | 'per-level',
		start: number,
	) =>
		Array.from({ length: 9 }, (_, level) => ({
			level,
			format: format === 'per-level' ? DEFAULT_LEVEL_FORMAT[defaultNumberingType(level)] : format,
			text: `%${level + 1}.`,
			alignment: 'left' as const,
			/*
			 * Setiap node daftar punya instance penomoran sendiri, dan referensi
			 * ini hanya dipakai daftar dengan `start` yang sama - jadi `start`
			 * berlaku di tingkat mana pun daftarnya berada. Dulu hanya tingkat 0,
			 * dan daftar bernomor bersarang `start: 3` mulai dari 1.
			 */
			start,
			// Level 0 dibiarkan tanpa indent (perilaku lama); level dalam digeser ala Word.
			...(level > 0 ? { style: { paragraph: { indent: { left: 720 * (level + 1), hanging: 360 } } } } : {}),
		}))

	const orderedConfigs = new Map<string, ReturnType<typeof orderedLevels>>([
		['ol', orderedLevels('per-level', 1)],
	])
	// Tiap node list mendapat instance sendiri supaya penomorannya selalu mulai ulang,
	// bukan melanjutkan list sebelumnya yang kebetulan mereferensikan format sama.
	let listInstance = 0

	const orderedReferenceOf = (list: PMNode): string => {
		const type = String(list.attrs.type ?? '')
		const start = Number(list.attrs.start) || 1
		let reference = type && (TYPE_FORMAT[type] || type === '1') ? `ol-${type}` : 'ol'
		if (start !== 1) reference += `-s${start}`

		if (!orderedConfigs.has(reference)) {
			orderedConfigs.set(
				reference,
				orderedLevels(type === '1' ? LevelFormat.DECIMAL : (TYPE_FORMAT[type] ?? 'per-level'), start),
			)
		}
		return reference
	}

	/*
	 * Butir daftar. Lekukannya ditulis langsung - `LIST_STEP_PX` per tingkat,
	 * seperti `padding-left: 1.6em` kanvas - dan ditambah lekukan wadahnya
	 * (daftar di dalam kutipan). Dulu setiap butir menulis `w:ind` nol, jadi
	 * daftar bertingkat rata kiri semua di Word. Hanya blok teks pertama butir
	 * yang membawa nomor/poin; paragraf berikutnya di butir yang sama sejajar
	 * dengan teksnya.
	 */
	const listBlocksOf = (list: PMNode, level: number): unknown[] => {
		const ordered = list.type.name === 'orderedList'
		const numbering = ordered ? { reference: orderedReferenceOf(list), instance: listInstance++ } : undefined
		const items: unknown[] = []
		const textLeft = ctx.indent + LIST_STEP_PX * (level + 1)

		list.forEach((item) => {
			let first = true
			within({ nested: true }, () => {
				item.forEach((block) => {
					/*
					 * Hanya paragraf yang dibangun langsung. Blok teks lain - kode,
					 * diagram, judul, isi catatan kaki lama - lewat `blockOf`, supaya
					 * kode tetap berhuruf lebar-tetap, diagram tetap gambar, dan isi
					 * catatan kaki tidak tercetak dua kali.
					 */
					if (block.type.name === 'paragraph') {
						const left = px(textLeft + (Number(block.attrs.indentLeft) || 0))
						items.push(
							paragraphOf(
								block,
								first
									? {
											...(ordered
												? {
														numbering: {
															reference: numbering?.reference as string,
															level,
															instance: numbering?.instance,
														},
													}
												: { bullet: { level } }),
											indent: { left, hanging: px(LIST_STEP_PX) },
										}
									: { indent: { left } },
							),
						)
					} else if (block.type.name === 'bulletList' || block.type.name === 'orderedList') {
						// List bersarang diekspor di level berikutnya agar menjorok di Word.
						items.push(...listBlocksOf(block, level + 1))
					} else {
						// Blok lain di dalam item direkursi agar isinya tidak hilang.
						items.push(...within({ indent: textLeft }, () => blockOf(block)))
					}
					first = false
				})
			})
		})
		return items
	}

	/*
	 * Kotak centang Word 2010 (`w14:checkbox`) dalam bentuk yang ditulis Word
	 * sendiri: glifnya `w:t` berhuruf MS Gothic. Kelas `CheckBox` pustaka docx
	 * memakai `w:sym`, yang kotak kosongnya (☐) tidak tergambar di LibreOffice.
	 */
	const checkboxOf = (checked: boolean): ParagraphChild => {
		const element = (name: string, children: unknown[] = [], attrs?: Record<string, string>) =>
			new docx.BuilderElement({
				name,
				attributes: attrs
					? Object.fromEntries(Object.entries(attrs).map(([key, value]) => [key, { key, value }]))
					: undefined,
				children: children as never,
			})
		const gothic = {
			'w:ascii': 'MS Gothic',
			'w:eastAsia': 'MS Gothic',
			'w:hAnsi': 'MS Gothic',
			'w:hint': 'eastAsia',
		}
		return element('w:sdt', [
			element('w:sdtPr', [
				element('w14:checkbox', [
					element('w14:checked', [], { 'w14:val': checked ? '1' : '0' }),
					element('w14:checkedState', [], { 'w14:val': '2612', 'w14:font': 'MS Gothic' }),
					element('w14:uncheckedState', [], { 'w14:val': '2610', 'w14:font': 'MS Gothic' }),
				]),
			]),
			element('w:sdtContent', [
				element('w:r', [
					element('w:rPr', [element('w:rFonts', [], gothic)]),
					element('w:t', [checked ? '\u2612' : '\u2610']),
				]),
			]),
		]) as unknown as ParagraphChild
	}

	/*
	 * Daftar centang: satu paragraf per butir, kotak centang Word 2010
	 * (`w14:checkbox`, ☐/☒) menggantung di depan teksnya (TKS-5). Dulu seluruh
	 * daftar jatuh ke cabang `default` dan menjadi satu paragraf dengan teks
	 * butir yang tergabung tanpa spasi. Butir selesai dicoret dan diabukan,
	 * seperti di kanvas.
	 */
	const taskListBlocksOf = (list: PMNode): unknown[] => {
		const items: unknown[] = []
		const base = ctx.indent
		list.forEach((item) => {
			const checked = item.attrs.checked === true
			let first = true
			within({ nested: true, run: checked ? { strike: true, color: DONE_TASK_COLOR } : {} }, () => {
				item.forEach((block) => {
					if (first && block.type.name === 'paragraph') {
						items.push(
							paragraphOf(
								block,
								{ indent: { left: px(base + TASK_INDENT_PX), hanging: px(TASK_INDENT_PX) } },
								[checkboxOf(checked), new TextRun({ children: [new Tab()] })],
							),
						)
					} else {
						items.push(...within({ indent: base + TASK_INDENT_PX }, () => blockOf(block)))
					}
					first = false
				})
			})
		})
		return items
	}

	/*
	 * Callout: tabel satu sel berlatar dan bergaris kiri berwarna menurut
	 * jenisnya, dengan ikonnya di depan paragraf pertama (TKS-5). Tabel menjaga
	 * semua anaknya - paragraf, daftar, tabel - dalam satu kotak, di Word
	 * maupun LibreOffice. Dulu isinya dilebur jadi satu paragraf.
	 */
	const calloutOf = (node: PMNode): unknown[] => {
		const look = CALLOUT_LOOK[String(node.attrs.calloutType)] ?? CALLOUT_LOOK.info
		const width = Math.max(1, sectionContentWidth - ctx.indent)
		const padding = { top: 12, bottom: 12, left: 15, right: 15 }
		const emoji = String(node.attrs.emoji ?? '').trim()
		const children: InstanceType<typeof Paragraph | typeof Table>[] = []
		const outerWidth = sectionContentWidth
		sectionContentWidth = Math.max(1, width - padding.left - padding.right)
		try {
			within({ indent: 0, nested: true, quote: false }, () => {
				let lead: ParagraphChild[] = emoji ? [new TextRun({ text: `${emoji} ` })] : []
				node.forEach((child) => {
					if (lead.length > 0 && child.type.name === 'paragraph') {
						children.push(paragraphOf(child, {}, lead))
						lead = []
						return
					}
					if (lead.length > 0) {
						children.push(new Paragraph({ children: lead }))
						lead = []
					}
					children.push(...(blockOf(child) as typeof children))
				})
				if (lead.length > 0) children.push(new Paragraph({ children: lead }))
			})
		} finally {
			sectionContentWidth = outerWidth
		}
		if (children.length === 0) children.push(new Paragraph({}))

		const widthTwips = px(width)
		return [
			new Table({
				width: { size: widthTwips, type: WidthType.DXA },
				columnWidths: [widthTwips],
				layout: docx.TableLayoutType.FIXED,
				...(ctx.indent > 0 ? { indent: { size: px(ctx.indent), type: WidthType.DXA } } : {}),
				borders: {
					top: NO_BORDER,
					bottom: NO_BORDER,
					left: NO_BORDER,
					right: NO_BORDER,
					insideHorizontal: NO_BORDER,
					insideVertical: NO_BORDER,
				},
				rows: [
					new TableRow({
						children: [
							new TableCell({
								children: separateTables(children),
								width: { size: widthTwips, type: WidthType.DXA },
								shading: { type: docx.ShadingType.CLEAR, fill: look.fill, color: 'auto' },
								margins: {
									top: px(padding.top),
									bottom: px(padding.bottom),
									left: px(padding.left),
									right: px(padding.right),
								},
								borders: {
									top: NO_BORDER,
									bottom: NO_BORDER,
									right: NO_BORDER,
									left: { style: 'single', size: 24, color: look.border },
								},
							}),
						],
					}),
				],
			}),
		]
	}

	/** Isi paragraf satu gambar, dibatasi lebar DAN tinggi area isi. */
	const fittedImage = (width: number, height: number) => {
		// Lekukan wadah (kutipan, butir daftar) memakan lebar yang tersedia.
		const room = Math.max(1, sectionContentWidth - ctx.indent)
		const scale = Math.min(1, room / width, imageHeightRoom() / height)
		return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
	}

	const blockOf = (node: PMNode): unknown[] => {
		switch (node.type.name) {
			case 'heading': {
				const level = Math.max(1, Number(node.attrs.level) || 1)
				if (level <= 6) {
					return [paragraphOf(node, { heading: HEADINGS[level - 1] })]
				}
				// Caption (7-9) memakai gaya "heading 7..9" sendiri, bukan Heading 6.
				return [
					paragraphOf(node, { style: `Heading${Math.min(9, level)}`, outlineLevel: Math.min(9, level) - 1 }),
				]
			}

			case 'paragraph':
				return [paragraphOf(node)]

			/*
			 * Kutipan: anak-anaknya menjorok dengan garis kiri, miring, dan
			 * berwarna redup - rupa kanvas - bertumpuk dengan lekukan wadahnya
			 * (TKS-5). Dulu ia direkursi tanpa gaya apa pun.
			 */
			case 'blockquote':
				return within(
					{
						indent: ctx.indent + (Number(node.attrs.indentLeft) || 0) + QUOTE_INDENT_PX,
						nested: true,
						quote: true,
						run: { italics: true, color: QUOTE_COLOR },
					},
					() => {
						const inner: unknown[] = []
						node.forEach((child) => {
							inner.push(...blockOf(child))
						})
						return inner
					},
				)

			case 'bulletList':
			case 'orderedList':
				return listBlocksOf(node, 0)

			case 'taskList':
				return taskListBlocksOf(node)

			case 'callout':
				return calloutOf(node)

			case 'table':
				return tableOf(node)

			/*
			 * `w:br w:type="page"` di paragrafnya sendiri - bentuk Ctrl+Enter
			 * Word. Dulu paragraf `pageBreakBefore` berisi `w:br` biasa, jadi
			 * halaman baru selalu dibuka dua baris kosong.
			 */
			case PAGE_BREAK_NODE:
				return [new Paragraph({ children: [new docx.PageBreak()] })]

			/* `w:br w:type="column"` — pindah kolom, bukan pindah halaman.
			 * Tanpa ini ia pulang sebagai paragraf kosong dan tata letak
			 * berkolom yang baru saja terbawa masuk hilang lagi saat diekspor. */
			case COLUMN_BREAK_NODE:
				return [new Paragraph({ children: [new docx.ColumnBreak()] })]

			case 'horizontalRule':
				return [
					new Paragraph({ text: '', border: { bottom: { style: 'single', size: 6, color: 'CCCCCC' } } }),
				]
			case 'columns':
			case 'column': {
				const inner: unknown[] = []
				node.forEach((child) => {
					inner.push(...blockOf(child))
				})
				return inner
			}

			/*
			 * Rumus blok: persamaan Word (`m:oMathPara`) rata tengah yang bisa
			 * disunting (OBJ-2). Dulu ia jatuh ke `default`, yang memakai
			 * `textContent` - kosong untuk atom - jadi rumusnya hilang tanpa jejak.
			 */
			case 'mathBlock': {
				const latex = String(node.attrs.latex ?? '')
				const items = LatexToOmml.convert(latex, true, parseXml)
				if (items)
					return [new Paragraph({ ...objectParagraphProps(true), children: [omml.block(items) as never] })]
				if (!latex.trim()) return []
				return [
					new Paragraph({
						...objectParagraphProps(true),
						alignment: docx.AlignmentType.CENTER,
						children: [
							new TextRun({
								text: latex,
								font: CODE_FONT,
								shading: { type: 'clear', fill: CODE_SHADING, color: 'auto' },
							}),
						],
					}),
				]
			}

			/*
			 * Isi catatan kaki pindah ke bagian footnotes Word, di bawah halaman
			 * tempat rujukannya - tidak dicetak lagi di badan naskah. Isi tanpa
			 * rujukan tetap di tempatnya supaya tidak hilang.
			 */
			case 'footnote':
				return footnotes.paired.has(node) ? [] : [paragraphOf(node)]

			// Blok HTML masuk sebagai gambar: Word tidak mengenal HTML, jadi
			// rancangannya diratakan menjadi potretan yang diambil
			// `refreshHtmlBlocks` tepat sebelum ekspor. Tanpa potretan - blok
			// yang gagal digambar - ia dilewati, bukan menggagalkan ekspor.
			case HTML_BLOCK: {
				const png = pngFromDataUrl(String(node.attrs.snapshot ?? ''))
				if (!png) return []

				const width = Number(node.attrs.snapshotWidth) || 0
				const height = Number(node.attrs.snapshotHeight) || 0
				if (width <= 0 || height <= 0) return []

				/*
				 * Mode halaman diekspor sebagai gambar berjangkar ke **kertas**,
				 * bukan ke kolom teks: ukurannya dipakai apa adanya dan titik
				 * awalnya sudut lembar, jadi warnanya sampai tepi persis seperti
				 * di kanvas. Tanpa jangkar ini ia diperkecil masuk ke dalam margin
				 * dan berkasnya tidak lagi serupa dengan yang dilihat penulis.
				 *
				 * Ia juga memulai halaman baru. Word tidak tahu blok ini "milik"
				 * satu lembar - tanpa pemenggal, naskah lain bisa ikut mendarat di
				 * halaman yang sama lalu tertimpa gambarnya.
				 */
				if (node.attrs.fit === 'page') {
					return [
						new Paragraph({
							pageBreakBefore: true,
							children: [
								new ImageRun({
									data: png,
									type: 'png',
									transformation: { width: Math.round(width), height: Math.round(height) },
									floating: {
										horizontalPosition: { relative: 'page', offset: 0 },
										verticalPosition: { relative: 'page', offset: 0 },
										behindDocument: true,
										allowOverlap: true,
									},
								}),
							],
						}),
					]
				}

				return [
					new Paragraph({
						...objectParagraphProps(true),
						...IMAGE_SPACING,
						children: [new ImageRun({ data: png, type: 'png', transformation: fittedImage(width, height) })],
					}),
				]
			}

			/*
			 * Blok kode. Mermaid ikut sebagai gambar - Word tidak mengenal
			 * diagram - sementara bahasa lain jadi paragraf berhuruf mesin ketik.
			 *
			 * Tanpa case ini keduanya jatuh ke `default` di bawah dan keluar
			 * sebagai paragraf teks biasa: diagram tercetak sebagai kodenya, dan
			 * kode kehilangan huruf lebar-tetapnya sehingga indentasinya tidak
			 * lagi lurus.
			 */
			case 'codeBlock': {
				const diagramSvg =
					node.attrs.language === 'mermaid'
						? String(node.attrs.mermaidSvg ?? '')
						: node.attrs.language === 'diagram'
							? (sanitizeDiagramSvg(node.textContent).svg ?? '')
							: ''

				if (diagramSvg) {
					const image = mermaidImages.get(diagramSvg)
					if (image) {
						return [
							new Paragraph({
								...objectParagraphProps(true),
								...IMAGE_SPACING,
								children: [
									new ImageRun({
										data: image.png,
										type: 'png',
										transformation: fittedImage(image.width, image.height),
									}),
								],
							}),
						]
					}
					// Diagram yang belum sempat dirender jatuh ke sumbernya di
					// bawah: kode yang masih bisa dibaca lebih berguna daripada
					// lubang kosong di naskah.
				}

				return node.textContent.split('\n').map(
					(line) =>
						new Paragraph({
							...objectParagraphProps(true),
							...(body && body.align !== 'left' ? { alignment: docx.AlignmentType.LEFT } : {}),
							children: [new TextRun({ text: line, font: CODE_FONT })],
						}),
				)
			}

			/*
			 * Gambar naskah. Letaknya mengikuti layar: rata kiri/tengah/kanan,
			 * atau digeser dari kiri sejauh `offsetX`. Gambar yang gagal diambil
			 * (CORS, tautan mati, format tak terbaca) meninggalkan penanda di
			 * tempatnya, supaya penulis tahu ada yang tidak ikut.
			 */
			case 'image': {
				const offsetX = Number(node.attrs.offsetX)
				const shifted = Number.isFinite(offsetX) && node.attrs.offsetX !== null
				const alignment = shifted ? undefined : DOCX_ALIGNMENT[node.attrs.align as string]
				const left = ctx.indent + (shifted && offsetX > 0 ? offsetX : 0)
				const placement = {
					...objectParagraphProps(true),
					...(alignment ? { alignment } : {}),
					...(left > 0 ? { indent: { left: px(left), ...(body?.firstLinePt ? { firstLine: 0 } : {}) } } : {}),
				}

				const image = imageFiles.get(String(node.attrs.src ?? ''))
				if (!image) {
					return [
						new Paragraph({
							...placement,
							children: [
								new TextRun({
									text: `[Gambar tidak ikut diekspor: ${imageLabel(node.attrs)}]`,
									italics: true,
									color: '808080',
								}),
							],
						}),
					]
				}

				const room = sectionContentWidth - ctx.indent - (shifted ? Math.max(0, offsetX) : 0)
				const box = imageBox(node.attrs, image, room, imageHeightRoom())
				const alt = String(node.attrs.alt ?? '').trim()
				return [
					new Paragraph({
						...placement,
						...IMAGE_SPACING,
						children: [
							new ImageRun({
								data: image.data,
								type: image.type,
								transformation: box,
								...(alt ? { altText: { name: alt, description: alt } } : {}),
							}),
						],
					}),
				]
			}

			case TOC_BLOCK: {
				const attrs = tocAttrsOf(node.attrs)
				return tocBlock(docx, {
					attrs,
					entries: tocEntries.get(node) ?? tocEntriesOf(attrs, outline),
					widthTwips: px(Math.max(1, sectionContentWidth - ctx.indent)),
					bookmarkOf,
				})
			}

			default: {
				/*
				 * Node tanpa penanganan khusus diturunkan ke anak-anaknya, bukan
				 * dilebur lewat `textContent` - itulah yang dulu membuat daftar
				 * centang dan callout jadi satu paragraf tanpa pemisah (TKS-5).
				 */
				if (node.isTextblock) return [paragraphOf(node)]
				if (node.isLeaf) {
					return node.textContent
						? [new Paragraph({ children: [new TextRun({ text: node.textContent })] })]
						: []
				}
				const inner: unknown[] = []
				node.forEach((child) => {
					inner.push(...blockOf(child))
				})
				return inner
			}
		}
	}
	/*
	 * `continued`: bagian Word hasil pemecahan per bab (lihat di bawah) - ia
	 * melanjutkan hitungan bagian induknya, jadi tidak membawa `start`.
	 */
	const sectionProperties = (span: SectionSpan | null, continued = false) => {
		const geo = span ? pageGeometry(span.setup) : geometry
		const columns = span?.columns
		const upright = span
			? resolvePageSize({ ...span.setup, orientation: 'portrait' })
			: { width: geometry.width, height: geometry.height }
		const numbering = span?.setup.pageNumbering
		const numberFormat = numbering
			? {
					decimal: undefined,
					'lower-roman': docx.NumberFormat.LOWER_ROMAN,
					'upper-roman': docx.NumberFormat.UPPER_ROMAN,
					'lower-alpha': docx.NumberFormat.LOWER_LETTER,
					'upper-alpha': docx.NumberFormat.UPPER_LETTER,
				}[numbering.format]
			: undefined
		/*
		 * Mulai 1 di bagian PERTAMA sama dengan tanpa `start` - Word memulai dari
		 * 1. Di bagian lain tidak: tanpa `start` Word melanjutkan hitungan, dan
		 * BAB I sesudah bagian depan romawi terbaca halaman 8, bukan 1.
		 */
		const first = span === null || span.pos === 0
		const startAt =
			!continued && numbering && typeof numbering.restart === 'number' && !(first && numbering.restart === 1)
				? numbering.restart
				: undefined

		return {
			page: {
				margin: {
					top: px(geo.margins.top),
					right: px(geo.margins.right),
					bottom: px(geo.margins.bottom),
					left: px(geo.margins.left),
					...(span && span.setup.headerMargin !== undefined ? { header: px(span.setup.headerMargin) } : {}),
					...(span && span.setup.footerMargin !== undefined ? { footer: px(span.setup.footerMargin) } : {}),
				},
				size: {
					width: px(upright.width),
					height: px(upright.height),
					...(span ? { orientation: span.setup.orientation } : {}),
				},
				/* w:pgNumType — format & mulai penomoran per bagian (T4/T6). */
				...(numberFormat || startAt !== undefined
					? {
							pageNumbers: {
								...(numberFormat ? { formatType: numberFormat } : {}),
								...(startAt !== undefined ? { start: startAt } : {}),
							},
						}
					: {}),
			},
			...(columns && columns.count > 1
				? {
						column: {
							count: columns.count,
							space: px(gapOf(columns)),
							...columnWidthsOf(docx, columns, geo.contentWidth),
						},
					}
				: {}),
			...(span && continuousPos.has(span.pos) ? { type: docx.SectionType.CONTINUOUS } : {}),
		}
	}
	const spans = setup ? sectionSpans(root, setup) : []
	const continuousPos = new Set(
		spans
			.filter(
				(span, index) =>
					index > 0 &&
					root.nodeAt(span.pos)?.attrs.continuous === true &&
					sameSheetGeometry(span.setup, spans[index - 1].setup),
			)
			.map((span) => span.pos),
	)
	const sections: {
		properties: ReturnType<typeof sectionProperties>
		children: unknown[]
		span: SectionSpan | null
		/** Blok pertamanya judul bab: halaman pertamanya halaman pembuka bab. */
		opensChapter: boolean
	}[] = []
	let current: unknown[] = []
	let spanIndex = 0
	/*
	 * Nomor yang letaknya berbeda di halaman pembuka bab (tengah bawah) dan di
	 * halaman lain (kanan atas) hanya bisa dinyatakan Word lewat "halaman
	 * pertama berbeda" - yang berlaku per section. Karena itu bagian seperti
	 * itu dipecah menjadi satu section Word per bab, masing-masing melanjutkan
	 * hitungan bagian induknya.
	 */
	const splitsChapters = (span: SectionSpan | undefined) => {
		const numbering = span?.setup.pageNumbering
		return Boolean(numbering?.openingPosition && numbering.openingPosition !== (numbering.position ?? null))
	}
	const chapterBreaks = typography?.headings?.[1]?.pageBreakBefore === true
	let continued = false
	let opensChapter = false
	/* Paragraf pemenggal terakhir: pemenggal tepat sebelum judul bab dibuang
	 * saat bagiannya dipecah, karena section baru sudah membuka halaman baru. */
	let lastBreak: unknown = null
	/* Apakah node sebelumnya adalah blok HTML `fit: 'page'`; dipakai untuk
	 * melewatkan paragraf kosong sesudahnya (EX-2). */
	let prevWasPageFit = false

	const contentHeightOf = (span: SectionSpan | undefined) =>
		span ? pageGeometry(span.setup).contentHeight : geometry.contentHeight

	sectionContentWidth = columnTextWidth(spans[0], geometry)
	sectionContentHeight = contentHeightOf(spans[0])

	/*
	 * Gambar watermark dari aset proyek diambil lewat rute BFF sesumber (bukan
	 * URL bertanda tangan penyimpanan, yang butuh CORS) sebelum dokumen
	 * dibangun, seperti gambar naskah.
	 */
	const watermark = setup?.watermark
	const loadWatermarkImage = async (): Promise<ExportImage | null> => {
		if (watermark?.kind !== 'image') return null
		if (watermark.imageDataUrl) return loadExportImage(watermark.imageDataUrl)
		if (!watermark.assetId) return null
		try {
			const { fetchAssetDataUrl } = await import('@/features/assets/api')
			return loadExportImage(await fetchAssetDataUrl(watermark.assetId))
		} catch {
			return null
		}
	}
	let watermarkImage: ExportImage | null = null

	// Semua diagram diratakan dan semua gambar diambil sekaligus, sebelum satu
	// pun blok dibangun.
	await Promise.all([
		...[...collectDiagramSvgs(root)].map(async (svg) => {
			const raster = await rasterizeSvg(svg)
			if (!raster) return
			const png = pngFromDataUrl(raster.png)
			if (png) mermaidImages.set(svg, { png, width: raster.width, height: raster.height })
		}),
		...collectImageSources(root).map(async (src) => {
			imageFiles.set(src, await loadExportImage(src))
		}),
		loadWatermarkImage().then((image) => {
			watermarkImage = image
		}),
	])

	root.forEach((node) => {
		if (node.type.name === SECTION_BREAK_NODE && spans.length > 0) {
			sections.push({
				properties: sectionProperties(spans[spanIndex] ?? null, continued),
				children: current,
				span: spans[spanIndex] ?? null,
				opensChapter,
			})
			spanIndex += 1
			current = []
			continued = false
			opensChapter = false
			lastBreak = null
			sectionContentWidth = columnTextWidth(spans[spanIndex], geometry)
			sectionContentHeight = contentHeightOf(spans[spanIndex])
			prevWasPageFit = false
			return
		}

		/*
		 * Paragraf kosong sesudah blok `fit: 'page'` dilewati di DOCX (EX-2):
		 * blok itu sudah memulai halaman baru lewat `pageBreakBefore`, dan
		 * paragraf kosong sesudahnya hanya menambah halaman kosong di Word.
		 * Paragraf berisi teks tetap diekspor.
		 */
		if (prevWasPageFit && node.type.name === 'paragraph' && node.content.size === 0) {
			prevWasPageFit = false
			return
		}

		const chapter =
			node.type.name === 'heading' &&
			Number(node.attrs.level) === 1 &&
			(chapterBreaks || node.attrs.pageBreakBefore === true || lastBreak !== null || current.length === 0)
		if (chapter && splitsChapters(spans[spanIndex])) {
			if (current.at(-1) === lastBreak && lastBreak !== null) current.pop()
			if (current.length > 0) {
				sections.push({
					properties: sectionProperties(spans[spanIndex] ?? null, continued),
					children: current,
					span: spans[spanIndex] ?? null,
					opensChapter,
				})
				current = []
				continued = true
			}
			opensChapter = true
		} else if (chapter && current.length === 0) {
			opensChapter = true
		}

		const blocks = blockOf(node)
		current.push(...blocks)
		lastBreak = node.type.name === PAGE_BREAK_NODE ? (blocks[0] ?? null) : null
		prevWasPageFit = node.type.name === HTML_BLOCK && node.attrs.fit === 'page'
	})
	sections.push({
		properties: sectionProperties(spans[spanIndex] ?? null, continued),
		children: current,
		span: spans[spanIndex] ?? null,
		opensChapter,
	})

	// Perabot halaman dipasang di section pertama; section berikutnya mewarisi
	// referensinya di Word, meniru perilaku dokumen asal.
	const hiddenOf = (span: SectionSpan | null) => span?.setup.pageNumbering?.show === false
	const baseHidden = hiddenOf(sections[0]?.span ?? null)
	/* Nomor otomatis mengikuti lencana layar: tanpa nomor bila pengguna
	 * mematikannya atau dokumennya pageless. */
	const autoNumbers = showPageNumbers && setup?.pageless !== true
	/*
	 * Dua bundel perabot yang isinya berbeda hanya di tokennya: bernomor dan
	 * tanpa nomor — termasuk footer sintesisnya. Section pertama memakai bundel
	 * sesuai keadaannya sendiri; section yang visibilitas nomornya BERBEDA dari
	 * section sebelumnya menulis referensi perabotnya sendiri, karena Word
	 * mewarisi milik section sebelumnya. Tanpa itu field PAGE yang sudah
	 * dibersihkan hidup kembali — dan sebaliknya: nomor yang dinyalakan lagi
	 * setelah section pembuka yang menyembunyikannya tidak pernah balik, karena
	 * dulu `furnitureExtras` dibangun memakai keadaan section pertama.
	 */
	const furnitureExtras = docxSectionFurniture(furniture, docx, furnitureContent, false, autoNumbers)
	const furnitureHidden = docxSectionFurniture(furniture, docx, furnitureContent, true, autoNumbers)
	const furnitureBase = baseHidden ? furnitureHidden : furnitureExtras
	const overrides: (typeof furnitureExtras | null)[] = sections.map(() => null)
	let effectiveHidden = baseHidden
	for (const [index, section] of sections.entries()) {
		if (index === 0) continue
		const hidden = hiddenOf(section.span)
		if (hidden === effectiveHidden) continue
		overrides[index] = hidden ? furnitureHidden : furnitureExtras
		effectiveHidden = hidden
	}

	/*
	 * Bagian yang aturan penomorannya menyebut letak (romawi tengah bawah,
	 * angka kanan atas...) menulis header/footer-nya sendiri; sisanya tetap
	 * lewat perabot tab seperti sebelumnya.
	 */
	const positioned = sections.map((section, index) => {
		const numbering = section.span?.setup.pageNumbering
		if (!numbering?.position && !numbering?.openingPosition) return null
		const cover = index === 0 && furnitureBase.titlePage === true
		return docxPositionedFurniture(docx, furniture, furnitureContent, {
			position: numbering.position ?? null,
			opening: section.opensChapter && !cover ? (numbering.openingPosition ?? null) : null,
			cover,
			hidden: numbering.show === false,
		})
	})

	type HeaderOf = InstanceType<typeof docx.Header>
	type HeaderSet = Partial<Record<'default' | 'first' | 'even', HeaderOf>>
	let assembled: {
		properties: Record<string, unknown>
		headers?: HeaderSet
		footers?: Partial<Record<'default' | 'first' | 'even', InstanceType<typeof docx.Footer>>>
		children: unknown[]
	}[] = sections.map((section, index) => {
		const own = positioned[index]
		if (own) {
			return {
				properties: own.titlePage ? { ...section.properties, titlePage: true } : section.properties,
				headers: own.headers,
				footers: own.footers,
				children: section.children,
			}
		}
		return {
			properties:
				index === 0 && furnitureBase.titlePage
					? { ...section.properties, titlePage: true }
					: section.properties,
			...(index === 0 && furnitureBase.headers
				? { headers: furnitureBase.headers }
				: overrides[index]?.headers
					? { headers: overrides[index]?.headers }
					: {}),
			...(index === 0 && furnitureBase.footers
				? { footers: furnitureBase.footers }
				: overrides[index]?.footers
					? { footers: overrides[index]?.footers }
					: {}),
			children: section.children,
		}
	})

	/*
	 * Watermark di setiap header yang mungkin tampil (KOL-12). Word mewarisi
	 * header per jenis (default/first/even) dari section sebelumnya, dan
	 * halaman pertama section bertitlePg tanpa header "first" kosong sama
	 * sekali - jadi setiap section menulis header lengkapnya sendiri: isi yang
	 * akan diwarisinya, ditambah paragraf watermark untuk geometri lembarnya.
	 */
	const watermarkParagraph = watermarkParagraphFactory(docx, watermark, watermarkImage)
	if (watermarkParagraph) {
		const evenAndOdd = furnitureExtras.evenAndOdd === true
		let inherited: HeaderSet = {}
		assembled = assembled.map((section, index) => {
			inherited = { ...inherited, ...(section.headers ?? {}) }
			const span = sections[index]?.span
			const geo = span ? pageGeometry(span.setup) : geometry
			const variants: ('default' | 'first' | 'even')[] = [
				'default',
				...(section.properties.titlePage === true ? (['first'] as const) : []),
				...(evenAndOdd ? (['even'] as const) : []),
			]
			const headers: HeaderSet = {}
			for (const variant of variants) {
				// Jenis yang tidak pernah ditulis kosong di Word - tetap kosong, plus watermark.
				const base = inherited[variant]
				headers[variant] = new docx.Header({
					children: [watermarkParagraph(geo), ...((base?.options.children ?? []) as never[])],
				})
			}
			return { ...section, headers }
		})
	}

	/*
	 * Catatan kaki Word (TKS-1): isinya satu paragraf bergaya "Footnote Text";
	 * pustaka docx menaruh tanda nomornya di depan.
	 */
	const footnoteParts: Record<number, { children: InstanceType<typeof Paragraph>[] }> = {}
	for (const [id, note] of footnotes.bodies) {
		footnoteParts[id] = {
			children: [
				new Paragraph({
					style: 'FootnoteText',
					children: [
						new TextRun({ text: ' ' }),
						...(note ? within({ nested: true }, () => runsOf(note)) : []),
					],
				}),
			],
		}
	}

	const tocStyle = firstToc as ReturnType<typeof tocAttrsOf> | null
	const document = new Document({
		title,
		styles: {
			...(typography ? docxTypographyStyles(typography) : {}),
			paragraphStyles: [
				...captionParagraphStyles(typography),
				QUOTE_PARAGRAPH_STYLE,
				...(tocStyle
					? tocParagraphStyles({
							widthTwips: px(columnTextWidth(spans[0], geometry)),
							stepPx: tocStyle.indentPerLevel,
							leader: tocLeaderOf(tocStyle),
						})
					: []),
			],
		},
		...(furnitureExtras.evenAndOdd ? { evenAndOddHeaderAndFooters: true } : {}),
		numbering: {
			config: [...orderedConfigs].map(([reference, levels]) => ({ reference, levels })),
		},
		...(Object.keys(footnoteParts).length > 0 ? { footnotes: footnoteParts } : {}),
		sections: assembled.map((section) => ({
			properties: section.properties,
			...(section.headers ? { headers: section.headers } : {}),
			...(section.footers ? { footers: section.footers } : {}),
			children: separateTables(section.children),
		})) as never,
	})

	const packed = new Uint8Array(await (await Packer.toBlob(document)).arrayBuffer())
	const finished = finalizeDocx(packed, {
		watermarkAlpha: watermarkParagraph ? watermarkAlpha(watermark) : null,
	})
	return new Blob([finished as BlobPart], {
		type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
	})
}
