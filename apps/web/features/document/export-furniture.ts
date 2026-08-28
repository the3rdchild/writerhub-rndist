import {
	PAGE_TOKEN,
	type PageFurniture,
	type PageFurnitureLine,
} from '@/features/editor/page-furniture/model'

/**
 * Perakitan header/footer pustaka docx dari PageFurniture.
 *
 * Pustaka docx di-inject sebagai parameter (bukan diimpor statis) supaya
 * pemuatan dinamisnya di export-docx tetap ringan; `headers`/`footers`
 * diletakkan di level section (saudara `properties`), mengikuti API
 * `addSection` pustaka.
 */

type DocxModule = typeof import('docx')

export interface SectionFurniture {
	/** Referensi header per varian — dipasang di section pertama; section lain mewarisi. */
	headers?: Record<string, InstanceType<DocxModule['Header']>>
	footers?: Record<string, InstanceType<DocxModule['Footer']>>
	/** true bila ada varian first → wajib <w:titlePg/>. */
	titlePage?: boolean
	/** true bila ada varian even → settings.xml menyalakan header genap/ganjil. */
	evenAndOdd?: boolean
}

function alignOf(docx: DocxModule, align: PageFurnitureLine['align']) {
	if (align === 'center') return docx.AlignmentType.CENTER
	if (align === 'right') return docx.AlignmentType.RIGHT
	return docx.AlignmentType.LEFT
}

function childrenOf(docx: DocxModule, line: PageFurnitureLine) {
	const runs = line.text
		.split(new RegExp(`(${PAGE_TOKEN})`))
		.filter(Boolean)
		.map((piece) =>
			piece === PAGE_TOKEN
				? new docx.TextRun({ children: [docx.PageNumber.CURRENT] })
				: new docx.TextRun(piece),
		)
	return [new docx.Paragraph({ children: runs, alignment: alignOf(docx, line.align) })]
}

/** Properti perabot untuk new Document; kosong bila tak ada perabot. */
export function docxSectionFurniture(
	furniture: PageFurniture | null | undefined,
	docx: DocxModule,
): SectionFurniture {
	if (!furniture) return {}

	const headers: Record<string, InstanceType<DocxModule['Header']>> = {}
	for (const [variant, line] of Object.entries(furniture.header ?? {})) {
		if (line) headers[variant] = new docx.Header({ children: childrenOf(docx, line) })
	}
	const footers: Record<string, InstanceType<DocxModule['Footer']>> = {}
	for (const [variant, line] of Object.entries(furniture.footer ?? {})) {
		if (line) footers[variant] = new docx.Footer({ children: childrenOf(docx, line) })
	}

	const hasFirst = Boolean(headers.first || footers.first)
	const hasEven = Boolean(headers.even || footers.even)
	return {
		...(Object.keys(headers).length > 0 ? { headers } : {}),
		...(Object.keys(footers).length > 0 ? { footers } : {}),
		...(hasFirst ? { titlePage: true } : {}),
		...(hasEven ? { evenAndOdd: true } : {}),
	}
}
