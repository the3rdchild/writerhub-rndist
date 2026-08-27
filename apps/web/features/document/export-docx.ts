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

const TWIPS_PER_PX = 15

const px = (value: number) => Math.round(value * TWIPS_PER_PX)
const DEFAULT_COLUMN_GAP_PX = 24

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

export function mergeTabContents(tabs: JSONContent[]): JSONContent {
	const content: JSONContent[] = []
	for (const [index, tab] of tabs.entries()) {
		if (index > 0) content.push({ type: PAGE_BREAK_NODE })
		content.push(...(tab.content ?? []))
	}
	if (content.length === 0) content.push({ type: 'paragraph' })
	return { type: 'doc', content }
}

export async function exportDocx(
	root: PMNode,
	{
		title,
		geometry,
		setup,
	}: {
		title: string
		geometry: PageGeometry
		setup?: PageSetup
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
	} = docx

	const HEADINGS = [
		HeadingLevel.HEADING_1,
		HeadingLevel.HEADING_2,
		HeadingLevel.HEADING_3,
		HeadingLevel.HEADING_4,
		HeadingLevel.HEADING_5,
		HeadingLevel.HEADING_6,
	]
	const runsOf = (node: PMNode) => {
		const runs: InstanceType<typeof TextRun>[] = []
		node.forEach((child) => {
			if (child.isText && child.text) {
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

	const paragraphOf = (node: PMNode, extra: Record<string, unknown> = {}): InstanceType<typeof Paragraph> => {
		const alignment = ALIGNMENT[node.attrs.textAlign as string]

		return new Paragraph({
			children: runsOf(node),
			...(alignment ? { alignment } : {}),
			indent: {
				left: px(Number(node.attrs.indentLeft) || 0),
				right: px(Number(node.attrs.indentRight) || 0),
				firstLine: Math.max(0, px(Number(node.attrs.indentFirstLine) || 0)),
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
		if (children.length === 0) children.push(new Paragraph({}))

		const rowSpan = Math.max(1, Number(cell.attrs.rowspan) || 1)
		return new TableCell({
			children,
			// rowSpan > 1 otomatis membuat sel lanjutan vMerge di baris berikutnya.
			...(rowSpan > 1 ? { rowSpan } : {}),
			...(width && width > 0
				? {
						width: { size: px(width), type: WidthType.DXA },
						columnSpan: Math.max(1, Number(cell.attrs.colspan) || 1),
					}
				: {}),
		})
	}
	let sectionContentWidth = geometry.contentWidth

	const tableOf = (node: PMNode) => {
		const widths = tableColumnWidths(node, sectionContentWidth)

		const rows: InstanceType<typeof TableRow>[] = []
		node.forEach((row) => {
			const cells: InstanceType<typeof TableCell>[] = []
			let column = 0
			row.forEach((cell) => {
				const span = Math.max(1, Number(cell.attrs.colspan) || 1)
				const width = widths.slice(column, column + span).reduce((sum, value) => sum + value, 0)
				cells.push(cellOf(cell, width))
				column += span
			})
			if (cells.length > 0) rows.push(new TableRow({ children: cells }))
		})

		return new Table({
			rows,
			width: { size: 100, type: WidthType.PERCENTAGE },
			columnWidths: widths.map(px),
		})
	}

	// Referensi penomoran orderedList: format huruf/romawi dan nilai start non-1
	// butuh definisi abstract terpisah, jadi referensinya dirakit per kombinasi.
	const TYPE_FORMAT: Record<string, (typeof LevelFormat)[keyof typeof LevelFormat]> = {
		a: LevelFormat.LOWER_LETTER,
		A: LevelFormat.UPPER_LETTER,
		i: LevelFormat.LOWER_ROMAN,
		I: LevelFormat.UPPER_ROMAN,
	}

	const orderedLevels = (format: (typeof LevelFormat)[keyof typeof LevelFormat], start: number) =>
		Array.from({ length: 9 }, (_, level) => ({
			level,
			format,
			text: `%${level + 1}.`,
			alignment: 'left' as const,
			start: level === 0 ? start : 1,
			// Level 0 dibiarkan tanpa indent (perilaku lama); level dalam digeser ala Word.
			...(level > 0 ? { style: { paragraph: { indent: { left: 720 * (level + 1), hanging: 360 } } } } : {}),
		}))

	const orderedConfigs = new Map<string, ReturnType<typeof orderedLevels>>([
		['ol', orderedLevels(LevelFormat.DECIMAL, 1)],
	])
	// Tiap node list mendapat instance sendiri supaya penomorannya selalu mulai ulang,
	// bukan melanjutkan list sebelumnya yang kebetulan mereferensikan format sama.
	let listInstance = 0

	const orderedReferenceOf = (list: PMNode): string => {
		const type = String(list.attrs.type ?? '')
		const start = Number(list.attrs.start) || 1
		let reference = type && TYPE_FORMAT[type] ? `ol-${type}` : 'ol'
		if (start !== 1) reference += `-s${start}`

		if (!orderedConfigs.has(reference)) {
			orderedConfigs.set(reference, orderedLevels(TYPE_FORMAT[type] ?? LevelFormat.DECIMAL, start))
		}
		return reference
	}

	const listBlocksOf = (list: PMNode, level: number): unknown[] => {
		const ordered = list.type.name === 'orderedList'
		const numbering = ordered ? { reference: orderedReferenceOf(list), instance: listInstance++ } : undefined
		const items: unknown[] = []

		list.forEach((item) => {
			item.forEach((block) => {
				if (block.isTextblock) {
					items.push(
						paragraphOf(
							block,
							ordered
								? {
										numbering: {
											reference: numbering?.reference as string,
											level,
											instance: numbering?.instance,
										},
									}
								: { bullet: { level } },
						),
					)
				} else if (block.type.name === 'bulletList' || block.type.name === 'orderedList') {
					// List bersarang diekspor di level berikutnya agar menjorok di Word.
					items.push(...listBlocksOf(block, level + 1))
				} else {
					// Blok lain di dalam item direkursi agar isinya tidak hilang.
					items.push(...blockOf(block))
				}
			})
		})
		return items
	}

	const blockOf = (node: PMNode): unknown[] => {
		switch (node.type.name) {
			case 'heading': {
				const level = Math.max(1, Number(node.attrs.level) || 1)
				if (level <= 6) {
					return [paragraphOf(node, { heading: HEADINGS[level - 1] })]
				}
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
			case 'orderedList':
				return listBlocksOf(node, 0)

			case 'table':
				return [tableOf(node)]

			case PAGE_BREAK_NODE:
				return [new Paragraph({ children: [new TextRun({ break: 1 })], pageBreakBefore: true })]

			case 'horizontalRule':
				return [
					new Paragraph({ text: '', border: { bottom: { style: 'single', size: 6, color: 'CCCCCC' } } }),
				]
			case 'columns':
			case 'column': {
				const inner: unknown[] = []
				node.forEach((child) => inner.push(...blockOf(child)))
				return inner
			}

			case 'tocBlock': {
				const snapshot = String(node.attrs.snapshot ?? '')
				return snapshot
					.split('\n')
					.filter((line) => line.trim())
					.map((line) => new Paragraph({ text: line }))
			}

			default:
				return node.textContent ? [new Paragraph({ text: node.textContent })] : []
		}
	}
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
					...(span ? { orientation: span.setup.orientation } : {}),
				},
			},
			...(columns && columns.count > 1
				? {
						column: {
							count: columns.count,
							space: px(columns.gap ?? DEFAULT_COLUMN_GAP_PX),
							equalWidth: true,
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
			sectionContentWidth = contentWidthOf(spans[spanIndex])
			return
		}
		current.push(...blockOf(node))
	})
	sections.push({ properties: sectionProperties(spans[spanIndex] ?? null), children: current })

	const document = new Document({
		title,
		numbering: {
			config: [...orderedConfigs].map(([reference, levels]) => ({ reference, levels })),
		},
		sections: sections.map((section) => ({
			properties: section.properties,
			children: section.children as never,
		})) as never,
	})

	return Packer.toBlob(document)
}
