'use client'

import type { Node as PMNode } from '@tiptap/pm/model'
import type { Editor } from '@tiptap/react'
import { PAGE_BREAK_NODE } from '@/features/editor/page-break'
import type { PageGeometry } from '@/features/editor/page-geometry'

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
 * Bangun berkas dan kembalikan sebagai Blob.
 *
 * `docx` diimpor dinamis: pustaka ini berat dan hanya dipakai saat pengguna
 * benar-benar menekan ekspor.
 */
export async function exportDocx(
	editor: Editor,
	{ title, geometry }: { title: string; geometry: PageGeometry },
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
				runs.push(new TextRun({ text: child.text, ...marksOf(child) }))
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

	const cellOf = (cell: PMNode) => {
		const children: InstanceType<typeof Paragraph>[] = []
		cell.forEach((block) => {
			if (block.isTextblock) children.push(paragraphOf(block))
		})
		// Sel kosong tetap butuh satu paragraf; Word menolak sel tanpa isi.
		if (children.length === 0) children.push(new Paragraph({}))
		return new TableCell({ children })
	}

	const tableOf = (node: PMNode) => {
		const rows: InstanceType<typeof TableRow>[] = []
		node.forEach((row) => {
			const cells: InstanceType<typeof TableCell>[] = []
			row.forEach((cell) => cells.push(cellOf(cell)))
			if (cells.length > 0) rows.push(new TableRow({ children: cells }))
		})

		return new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE } })
	}

	/** Satu blok tingkat atas jadi satu (atau beberapa) elemen Word. */
	const blockOf = (node: PMNode): unknown[] => {
		switch (node.type.name) {
			case 'heading': {
				const level = Math.min(6, Math.max(1, Number(node.attrs.level) || 1))
				return [paragraphOf(node, { heading: HEADINGS[level - 1] })]
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

			default:
				// Node tak dikenal tetap menyumbang teksnya daripada hilang diam-diam.
				return node.textContent ? [new Paragraph({ text: node.textContent })] : []
		}
	}

	const children: unknown[] = []
	editor.state.doc.forEach((node) => children.push(...blockOf(node)))

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
		sections: [
			{
				properties: {
					page: {
						// Margin halaman diambil dari geometri yang sama dengan yang
						// dipakai penggaris dan paginasi - satu sumber angka.
						margin: {
							top: px(geometry.margins.top),
							right: px(geometry.margins.right),
							bottom: px(geometry.margins.bottom),
							left: px(geometry.margins.left),
						},
						size: { width: px(geometry.width), height: px(geometry.height) },
					},
				},
				children: children as never,
			},
		],
	})

	return Packer.toBlob(document)
}
