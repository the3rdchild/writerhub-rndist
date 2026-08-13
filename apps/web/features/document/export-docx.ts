'use client'

import type { JSONContent } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import { PAGE_BREAK_NODE } from '@/features/editor/page-break'
import {
	type PageGeometry,
	type PageSetup,
	pageGeometry,
	resolvePageSize,
	sameSheetGeometry,
} from '@/features/editor/page-geometry'
import { SECTION_BREAK_NODE, type SectionSpan, sectionSpans } from '@/features/editor/section-break'

/**
 * Menulis dokumen jadi berkas .docx.
 *
 * Dibangun dari dokumen ProseMirror, bukan dari HTML-nya, karena di sinilah
 * kita tahu persis apa yang dimaksud tiap node. Menebaknya lagi dari HTML
 * berarti mem-parsing balik sesuatu yang sudah kita miliki dalam bentuk yang
 * jauh lebih jelas.
 *
 * Yang ikut terbawa: heading, daftar, tabel, tebal/miring/garis bawah/coret,
 * perataan, indentasi, page break, dan margin halaman. Yang tidak: apa pun
 * yang memang tidak ada di skema kita.
 */

/** Twip - satuan panjang Word. 1 inci = 1440 twip; layar kita 96 px per inci. */
const TWIPS_PER_PX = 15

const px = (value: number) => Math.round(value * TWIPS_PER_PX)

/**
 * Jarak antar kolom bila section tidak menyebutkannya - sama dengan bawaan CSS
 * kita (1,5em ≈ 24px), bukan bawaan Word (0,5 inci), supaya berkas hasil ekspor
 * terbaca seperti yang tampil di layar.
 */
const DEFAULT_COLUMN_GAP_PX = 24

/**
 * Lebar tiap kolom tabel dalam piksel dokumen.
 *
 * Sumbernya `colwidth` - atribut yang sama yang ditulis `columnResizing` dan
 * penggaris, jadi tabel yang sudah diatur lebarnya diekspor persis seperti yang
 * terlihat. Versi DOM-nya ada di `features/editor/table-ops.ts`; di sini
 * pengukuran DOM tidak bisa dipakai karena ekspor juga melayani tab yang tidak
 * sedang terbuka.
 *
 * Tabel yang belum pernah diubah ukurannya tidak punya `colwidth` sama sekali -
 * di layar `table-layout: fixed` membaginya rata, jadi di sini pun dibagi rata
 * atas lebar area teks. Membiarkannya kosong bukan pilihan: `docx` lalu menulis
 * `<w:gridCol w:w="100"/>` untuk tiap kolom, dan tabelnya keluar setipis satu
 * huruf.
 */
function tableColumnWidths(table: PMNode, contentWidth: number): number[] {
	const header = table.firstChild
	const columns: number[] = []
	let complete = header !== null

	header?.forEach((cell) => {
		const colwidth = cell.attrs.colwidth as number[] | null | undefined
		const span = Math.max(1, Number(cell.attrs.colspan) || 1)
		for (let index = 0; index < span; index += 1) {
			const value = colwidth?.[index]
			if (!value) complete = false
			columns.push(value ?? 0)
		}
	})

	if (columns.length === 0) return [contentWidth]
	if (complete) return columns

	const even = contentWidth / columns.length
	return columns.map(() => even)
}

type Marks = { bold?: boolean; italics?: boolean; underline?: object; strike?: boolean }

function marksOf(node: PMNode): Marks {
	const result: Marks = {}
	for (const mark of node.marks) {
		if (mark.type.name === 'bold') result.bold = true
		if (mark.type.name === 'italic') result.italics = true
		if (mark.type.name === 'underline') result.underline = {}
		if (mark.type.name === 'strike') result.strike = true
	}
	return result
}

const ALIGNMENT: Record<string, 'left' | 'center' | 'right' | 'both'> = {
	left: 'left',
	center: 'center',
	right: 'right',
	justify: 'both',
}

/**
 * Gabungkan naskah beberapa tab menjadi satu dokumen: urut sesuai daftar,
 * dipisah page break di antara tab. Fungsi murni - ia sengaja tidak tahu
 * apa-apa tentang Y.Doc maupun pustaka docx supaya bisa diuji langsung.
 *
 * Tab kosong tetap menyumbang page break-nya: posisi sebuah tab dalam hasil
 * gabungan mencerminkan posisinya dalam dokumen, bukan panjang isinya.
 */
export function mergeTabContents(tabs: JSONContent[]): JSONContent {
	const content: JSONContent[] = []
	for (const [index, tab] of tabs.entries()) {
		if (index > 0) content.push({ type: PAGE_BREAK_NODE })
		content.push(...(tab.content ?? []))
	}
	// Skema mewajibkan dokumen berisi minimal satu blok.
	if (content.length === 0) content.push({ type: 'paragraph' })
	return { type: 'doc', content }
}

/**
 * Bangun berkas dan kembalikan sebagai Blob.
 *
 * Menerima root dokumen ProseMirror, bukan instance Editor: tab yang tidak
 * sedang terbuka tidak punya editor, dan naskahnya dirakit lewat
 * `fragmentToJSON` + `buildSchema().nodeFromJSON` (lihat dialog ekspor).
 *
 * `docx` diimpor dinamis: pustaka ini berat dan hanya dipakai saat pengguna
 * benar-benar menekan ekspor.
 */
export async function exportDocx(
	root: PMNode,
	{
		title,
		geometry,
		setup,
	}: {
		title: string
		geometry: PageGeometry
		/**
		 * Setelan dasar naskah. Diberikan, `sectionBreak` di dalam dokumen ikut
		 * diterjemahkan jadi section DOCX tersendiri (§P8&P9); tanpa itu seluruh
		 * naskah jadi satu section seperti sebelumnya.
		 */
		setup?: PageSetup
	},
): Promise<Blob> {
	const docx = await import('docx')
	const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, HeadingLevel, WidthType } =
		docx

	const HEADINGS = [
		HeadingLevel.HEADING_1,
		HeadingLevel.HEADING_2,
		HeadingLevel.HEADING_3,
		HeadingLevel.HEADING_4,
		HeadingLevel.HEADING_5,
		HeadingLevel.HEADING_6,
	]

	/** Isi sebuah blok teks jadi deretan run bergaya. */
	const runsOf = (node: PMNode) => {
		const runs: InstanceType<typeof TextRun>[] = []
		node.forEach((child) => {
			if (child.isText && child.text) {
				// Baris baru di DALAM satu simpul teks - datang dari tempel Markdown
				// dan impor DOCX - tidak punya arti apa pun di `<w:t>`: Word
				// membacanya sebagai spasi biasa, jadi lima baris judul sampul
				// menyatu jadi satu baris panjang. Dipecah jadi `<w:br/>`, sama
				// seperti hardBreak.
				const marks = marksOf(child)
				child.text.split('\n').forEach((piece, index) => {
					if (index > 0) runs.push(new TextRun({ break: 1 }))
					if (piece) runs.push(new TextRun({ text: piece, ...marks }))
				})
			} else if (child.type.name === 'hardBreak') {
				runs.push(new TextRun({ break: 1 }))
			}
		})
		return runs
	}

	const paragraphOf = (
		node: PMNode,
		extra: Record<string, unknown> = {},
	): InstanceType<typeof Paragraph> => {
		const alignment = ALIGNMENT[node.attrs.textAlign as string]

		return new Paragraph({
			children: runsOf(node),
			...(alignment ? { alignment } : {}),
			indent: {
				left: px(Number(node.attrs.indentLeft) || 0),
				right: px(Number(node.attrs.indentRight) || 0),
				firstLine: Math.max(0, px(Number(node.attrs.indentFirstLine) || 0)),
				// Nilai negatif di editor berarti hanging indent, dan Word memakai
				// field tersendiri untuk itu.
				hanging: Math.max(0, px(-(Number(node.attrs.indentFirstLine) || 0))),
			},
			...extra,
		})
	}

	const cellOf = (cell: PMNode, width?: number) => {
		const children: InstanceType<typeof Paragraph>[] = []
		cell.forEach((block) => {
			if (block.isTextblock) children.push(paragraphOf(block))
		})
		// Sel kosong tetap butuh satu paragraf; Word menolak sel tanpa isi.
		if (children.length === 0) children.push(new Paragraph({}))

		return new TableCell({
			children,
			...(width && width > 0
				? {
						width: { size: px(width), type: WidthType.DXA },
						columnSpan: Math.max(1, Number(cell.attrs.colspan) || 1),
					}
				: {}),
		})
	}

	/**
	 * Lebar area teks section yang sedang dirakit - dasar pembagian kolom tabel
	 * yang belum pernah diatur lebarnya. Diperbarui perulangan section di bawah.
	 */
	let sectionContentWidth = geometry.contentWidth

	const tableOf = (node: PMNode) => {
		const widths = tableColumnWidths(node, sectionContentWidth)

		const rows: InstanceType<typeof TableRow>[] = []
		node.forEach((row) => {
			const cells: InstanceType<typeof TableCell>[] = []
			let column = 0
			row.forEach((cell) => {
				const span = Math.max(1, Number(cell.attrs.colspan) || 1)
				// Lebar ditulis di selnya juga, bukan hanya di tblGrid: sebagian
				// pembaca (Google Docs di antaranya) memakai `w:tcW` saat menata
				// ulang, dan tanpa itu kolomnya menyempit ke lebar isi terpendek.
				const width = widths.slice(column, column + span).reduce((sum, value) => sum + value, 0)
				cells.push(cellOf(cell, width))
				column += span
			})
			if (cells.length > 0) rows.push(new TableRow({ children: cells }))
		})

		return new Table({
			rows,
			width: { size: 100, type: WidthType.PERCENTAGE },
			// Tanpa ini `docx` menulis `<w:gridCol w:w="100"/>` untuk tiap kolom -
			// 100 twip, sekitar 1,8 mm - dan tabelnya keluar setipis satu huruf.
			columnWidths: widths.map(px),
		})
	}

	/** Satu blok tingkat atas jadi satu (atau beberapa) elemen Word. */
	const blockOf = (node: PMNode): unknown[] => {
		switch (node.type.name) {
			case 'heading': {
				const level = Math.max(1, Number(node.attrs.level) || 1)
				if (level <= 6) {
					return [paragraphOf(node, { heading: HEADINGS[level - 1] })]
				}
				// 7–9: Word tak punya style heading bawaan di atas 6, jadi pakai HEADING_6
				// sebagai dasar gayanya (satu tangga di bawah tingkat sebelumnya) dan
				// setel outlineLevel ke tingkat sebenarnya supaya panel navigasi Word
				// menempatkannya dengan benar (§A4.2).
				return [paragraphOf(node, { heading: HeadingLevel.HEADING_6, outlineLevel: level - 1 })]
			}

			case 'paragraph':
				return [paragraphOf(node)]

			case 'blockquote': {
				const inner: unknown[] = []
				node.forEach((child) => inner.push(...blockOf(child)))
				return inner
			}

			case 'bulletList':
			case 'orderedList': {
				const ordered = node.type.name === 'orderedList'
				const items: unknown[] = []

				node.forEach((item) => {
					item.forEach((block) => {
						if (!block.isTextblock) return
						items.push(
							paragraphOf(block, ordered ? { numbering: { reference: 'ol', level: 0 } } : { bullet: { level: 0 } }),
						)
					})
				})
				return items
			}

			case 'table':
				return [tableOf(node)]

			case PAGE_BREAK_NODE:
				return [new Paragraph({ children: [new TextRun({ break: 1 })], pageBreakBefore: true })]

			case 'horizontalRule':
				return [new Paragraph({ text: '', border: { bottom: { style: 'single', size: 6, color: 'CCCCCC' } } })]

			// Kolom tidak punya padanan langsung di sini, tapi isinya blok biasa.
			// Ditelusuri satu per satu, bukan dibiarkan jatuh ke `default` yang
			// meratakan seluruh isinya jadi satu paragraf teks polos - heading,
			// daftar, dan tabel di dalam kolom akan hilang bentuknya.
			case 'columns':
			case 'column': {
				const inner: unknown[] = []
				node.forEach((child) => inner.push(...blockOf(child)))
				return inner
			}

			case 'tocBlock': {
				// Blok daftar isi (A5): isinya sudah dihasilkan NodeView dari kerangka,
				// jadi ekspor memakai snapshot teks terakhir - satu paragraf per baris.
				const snapshot = String(node.attrs.snapshot ?? '')
				return snapshot
					.split('\n')
					.filter((line) => line.trim())
					.map((line) => new Paragraph({ text: line }))
			}

			default:
				// Node tak dikenal tetap menyumbang teksnya daripada hilang diam-diam.
				return node.textContent ? [new Paragraph({ text: node.textContent })] : []
		}
	}

	/**
	 * Properti satu section DOCX.
	 *
	 * Ukuran kertas ditulis dalam bentuk TEGAK, bukan yang sudah ditukar
	 * orientasi. `pageGeometry` menukar lebar↔tinggi untuk lanskap - itu yang
	 * dibutuhkan layar - tapi `docx` menukarnya sekali lagi begitu `orientation`
	 * bernilai landscape (lihat `createPageSize` di pustakanya), jadi mengirim
	 * angka yang sudah tertukar menghasilkan lembar yang kembali tegak. Yang
	 * dikirim karena itu ukuran tegaknya, dan `w:orient` yang menentukan arah.
	 *
	 * `w:orient` sendiri tetap perlu: tanpa itu Google Docs menggambar halamannya
	 * benar tapi dialog penyiapan halamannya menyebutnya potret.
	 *
	 * Margin tidak ikut ditukar - ia diambil dari geometri yang sama dengan yang
	 * dipakai penggaris dan paginasi, satu sumber angka.
	 */
	const sectionProperties = (span: SectionSpan | null) => {
		const geo = span ? pageGeometry(span.setup) : geometry
		const columns = span?.columns
		const upright = span
			? resolvePageSize({ ...span.setup, orientation: 'portrait' })
			: { width: geometry.width, height: geometry.height }

		return {
			page: {
				margin: {
					top: px(geo.margins.top),
					right: px(geo.margins.right),
					bottom: px(geo.margins.bottom),
					left: px(geo.margins.left),
				},
				size: {
					width: px(upright.width),
					height: px(upright.height),
					// Tanpa section, geometrinya sudah tertukar sejak dari pemanggil dan
					// tidak ada `setup` untuk membaca arahnya - perilaku lama dibiarkan.
					...(span ? { orientation: span.setup.orientation } : {}),
				},
			},
			// Kolom di DOCX SELALU properti section, tidak pernah properti paragraf -
			// karena itu hanya kolom per-section yang bisa dibawa apa adanya. Blok
			// `columns` gaya lama (dari `setColumns` pada seleksi) diratakan jadi satu
			// kolom di atas; memecahnya jadi section sendiri akan menyisipkan
			// pemenggalan halaman yang tidak pernah diminta penulis.
			...(columns && columns.count > 1
				? {
						column: {
							count: columns.count,
							space: px(columns.gap ?? DEFAULT_COLUMN_GAP_PX),
							equalWidth: true,
						},
					}
				: {}),
			// Pembatas menerus yang sah ditulis sebagai `continuous` (E5): Word dan
			// Google Docs mengenalinya sebagai section yang tidak membuka lembar.
			...(span && continuousPos.has(span.pos) ? { type: docx.SectionType.CONTINUOUS } : {}),
		}
	}

	/**
	 * Bagi naskah jadi beberapa section DOCX di tiap `sectionBreak`.
	 *
	 * `sectionSpans` sudah menggabungkan pewarisan antar section, jadi span ke-n
	 * memuat setelan LENGKAP - bukan patch - dan bisa langsung jadi `sectPr`.
	 * Urutannya sejalan: span pertama milik isi sebelum pembatas pertama.
	 */
	const spans = setup ? sectionSpans(root, setup) : []
	// Pembatas menerus yang SAH (E5): atributnya berbunyi menerus DAN geometri
	// lembarnya sama dengan section sebelumnya. Yang mengubah geometri sudah
	// turun pangkat jadi pembatas biasa - section-nya ditulis tanpa `w:type`.
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
	const sections: { properties: ReturnType<typeof sectionProperties>; children: unknown[] }[] = []
	let current: unknown[] = []
	let spanIndex = 0

	const contentWidthOf = (span: SectionSpan | undefined) =>
		span ? pageGeometry(span.setup).contentWidth : geometry.contentWidth

	sectionContentWidth = contentWidthOf(spans[0])

	root.forEach((node) => {
		if (node.type.name === SECTION_BREAK_NODE && spans.length > 0) {
			sections.push({ properties: sectionProperties(spans[spanIndex] ?? null), children: current })
			spanIndex += 1
			current = []
			// Tabel di section berikutnya dibagi atas lebar area teks SECTION ITU -
			// section lanskap punya area teks jauh lebih lebar, dan tabel yang
			// dibagi memakai angka section sebelumnya akan menyempit tanpa alasan.
			sectionContentWidth = contentWidthOf(spans[spanIndex])
			return
		}
		current.push(...blockOf(node))
	})
	sections.push({ properties: sectionProperties(spans[spanIndex] ?? null), children: current })

	const document = new Document({
		title,
		numbering: {
			config: [
				{
					reference: 'ol',
					levels: [{ level: 0, format: 'decimal', text: '%1.', alignment: 'left' }],
				},
			],
		},
		sections: sections.map((section) => ({
			properties: section.properties,
			children: section.children as never,
		})) as never,
	})

	return Packer.toBlob(document)
}
