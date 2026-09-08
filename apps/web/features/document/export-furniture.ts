import type { JSONContent } from '@tiptap/core'
import {
	PAGE_TOKEN,
	PAGES_TOKEN,
	type PageFurniture,
	type PageFurnitureLine,
} from '@/features/editor/page-furniture/model'

/**
 * Perakitan header/footer pustaka docx dari PageFurniture (T6).
 *
 * Pustaka docx di-inject sebagai parameter (bukan diimpor statis) supaya
 * pemuatan dinamisnya di export-docx tetap ringan; `headers`/`footers`
 * diletakkan di level section (saudara `properties`), mengikuti API
 * `addSection` pustaka.
 *
 * Isi kaya (fragmen ydoc, dibaca sebagai JSON) menang atas baris lama;
 * keduanya memecah teks pada token {page}/{pages} menjadi field PAGE/NUMPAGES.
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

/** Isi kaya per slot+varian — blok JSON dari fragmen ydoc. */
export type FurnitureContent = Partial<
	Record<'header' | 'footer', Partial<Record<'default' | 'first' | 'even', JSONContent[]>>>
>

function alignOf(docx: DocxModule, align: PageFurnitureLine['align']) {
	if (align === 'center') return docx.AlignmentType.CENTER
	if (align === 'right') return docx.AlignmentType.RIGHT
	return docx.AlignmentType.LEFT
}

/** Teks membawa token nomor ({page}/{pages})? */
const carriesToken = (text: string) => text.includes(PAGE_TOKEN) || text.includes(PAGES_TOKEN)

/** Seluruh teks blok fragmen, diratakan jadi satu — token bisa terpencar ke
 * node teks yang bersebelahan dan harus dibaca utuh, bukan per-node. */
function blocksTextOf(blocks: JSONContent[]): string {
	const parts: string[] = []
	const walk = (nodes: JSONContent[]) => {
		for (const node of nodes) {
			if (node.type === 'text' && node.text) parts.push(node.text)
			if (node.content) walk(node.content)
		}
	}
	walk(blocks)
	return parts.join('')
}

const blocksCarryNumber = (blocks: JSONContent[]) => carriesToken(blocksTextOf(blocks))

/** Fragmen kosong: tanpa teks tak-sekspasi dan tanpa gambar. Paragraf kosong
 * inilah bentuk footer paling umum peninggalan impor lama. */
function blocksAreEmpty(blocks: JSONContent[]): boolean {
	const hasImage = (nodes: JSONContent[]): boolean =>
		nodes.some((node) => node.type === 'image' || hasImage(node.content ?? []))
	return !hasImage(blocks) && blocksTextOf(blocks).trim() === ''
}

const MARKS: Record<string, () => Record<string, unknown>> = {
	bold: () => ({ bold: true }),
	italic: () => ({ italics: true }),
	underline: () => ({ underline: {} }),
	strike: () => ({ strike: true }),
	code: () => ({ font: 'Consolas' }),
}

type TextRunOf = InstanceType<DocxModule['TextRun']>
type ImageRunOf = InstanceType<DocxModule['ImageRun']>
type RunOf = TextRunOf | ImageRunOf

/**
 * `hideNumbers` menjatuhkan token alih-alih menerbitkan field PAGE/NUMPAGES.
 *
 * Word tidak punya bendera "sembunyikan nomor pada bagian ini" — caranya justru
 * dengan TIDAK menulis field-nya. Tanpa ini, penomoran yang pengguna bersihkan
 * di layar akan hidup kembali begitu dokumennya diekspor.
 */
function tokenRunsOf(
	docx: DocxModule,
	text: string,
	marks: Record<string, unknown>,
	hideNumbers: boolean,
): RunOf[] {
	return text
		.split(new RegExp(`(${PAGE_TOKEN}|${PAGES_TOKEN})`))
		.filter(Boolean)
		.filter((piece) => !(hideNumbers && (piece === PAGE_TOKEN || piece === PAGES_TOKEN)))
		.map(
			(piece): RunOf =>
				piece === PAGE_TOKEN
					? new docx.TextRun({ children: [docx.PageNumber.CURRENT] })
					: piece === PAGES_TOKEN
						? new docx.TextRun({ children: [docx.PageNumber.TOTAL_PAGES] })
						: new docx.TextRun({ text: piece, ...marks }),
		)
}

function runsOfNode(docx: DocxModule, node: JSONContent, hideNumbers: boolean): RunOf[] {
	const runs: RunOf[] = []
	for (const child of node.content ?? []) {
		if (child.type === 'text' && child.text) {
			const marks: Record<string, unknown> = {}
			for (const mark of child.marks ?? []) {
				const factory = MARKS[mark.type]
				if (factory) Object.assign(marks, factory())
			}
			runs.push(...tokenRunsOf(docx, child.text, marks, hideNumbers))
		} else if (child.type === 'hardBreak') {
			runs.push(new docx.TextRun({ break: 1 }))
		} else if (child.type === 'image') {
			const image = imageRunOf(docx, child)
			if (image) runs.push(image)
		}
	}
	return runs
}

/** Gambar base64 (logo kop surat) → ImageRun; tanpa ukuran atau bukan
 * base64 png/jpeg, dilewati — docx menuntut transformation yang jujur. */
function imageRunOf(docx: DocxModule, node: JSONContent): RunOf | null {
	const src = typeof node.attrs?.src === 'string' ? node.attrs.src : ''
	const match = /^data:image\/(png|jpeg|jpg);base64,(.+)$/.exec(src)
	if (!match) return null

	const width = Number(node.attrs?.width) || 0
	const height = Number(node.attrs?.height) || 0
	if (width <= 0 || height <= 0) return null

	const binary = atob(match[2])
	const data = new Uint8Array(binary.length)
	for (let index = 0; index < binary.length; index += 1) data[index] = binary.charCodeAt(index)

	return new docx.ImageRun({
		data,
		type: match[1] === 'png' ? 'png' : 'jpg',
		transformation: { width: Math.round(width), height: Math.round(height) },
	})
}

function richParagraphOf(
	docx: DocxModule,
	block: JSONContent,
	hideNumbers: boolean,
): InstanceType<DocxModule['Paragraph']> | null {
	if (block.type !== 'paragraph') return null
	const align = block.attrs?.textAlign
	const alignment =
		align === 'center' ? docx.AlignmentType.CENTER : align === 'right' ? docx.AlignmentType.RIGHT : undefined
	const runs = runsOfNode(docx, block, hideNumbers)
	return new docx.Paragraph({ children: runs, ...(alignment ? { alignment } : {}) })
}

function childrenOf(docx: DocxModule, line: PageFurnitureLine, hideNumbers: boolean) {
	const runs = tokenRunsOf(docx, line.text, {}, hideNumbers)
	return [new docx.Paragraph({ children: runs, alignment: alignOf(docx, line.align) })]
}

function childrenOfBlocks(
	docx: DocxModule,
	blocks: JSONContent[],
	hideNumbers: boolean,
): InstanceType<DocxModule['Paragraph']>[] {
	const children: InstanceType<DocxModule['Paragraph']>[] = []
	for (const block of blocks) {
		const paragraph = richParagraphOf(docx, block, hideNumbers)
		if (paragraph) children.push(paragraph)
	}
	return children.length > 0 ? children : [new docx.Paragraph({})]
}

/**
 * Footer sintesis penutup celah ekspor: satu paragraf tengah berisi field
 * PAGE — padanan gaya "Plain Number 2" Word untuk lencana cadangan layar.
 * Saat nomor disembunyikan ia tetap dibuat, tapi kosong: section yang nomornya
 * dibersihkan mewarisi perabot section sebelumnya di Word, jadi tanpa part
 * sendiri field PAGE yang sudah dibersihkan akan hidup kembali di bawahnya.
 */
function synthesizedFooterOf(docx: DocxModule, hideNumbers: boolean): InstanceType<DocxModule['Footer']> {
	return new docx.Footer({
		children: [
			new docx.Paragraph({
				alignment: docx.AlignmentType.CENTER,
				...(hideNumbers ? {} : { children: [new docx.TextRun({ children: [docx.PageNumber.CURRENT] })] }),
			}),
		],
	})
}

/** Properti perabot untuk new Document; kosong bila tak ada perabot. */
export function docxSectionFurniture(
	furniture: PageFurniture | null | undefined,
	docx: DocxModule,
	content?: FurnitureContent | null,
	/** Bagian ini tanpa nomor halaman (`pageNumbering.show === false`). */
	hideNumbers = false,
	/** Jaminan footer pembawa nomor untuk dokumen bernomor yang perabotnya
	 * tidak membawanya (penutup celah ekspor, opsi A rencana header/footer). */
	ensureNumberFooter = false,
): SectionFurniture {
	const richHeader = content?.header ?? {}
	const richFooter = content?.footer ?? {}

	const headers: Record<string, InstanceType<DocxModule['Header']>> = {}
	for (const variant of ['default', 'first', 'even'] as const) {
		const blocks = richHeader[variant]
		if (blocks && blocks.length > 0)
			headers[variant] = new docx.Header({ children: childrenOfBlocks(docx, blocks, hideNumbers) })
		else if (furniture?.header?.[variant])
			headers[variant] = new docx.Header({
				children: childrenOf(docx, furniture.header[variant], hideNumbers),
			})
	}

	const footers: Record<string, InstanceType<DocxModule['Footer']>> = {}
	for (const variant of ['default', 'first', 'even'] as const) {
		const blocks = richFooter[variant]
		if (blocks && blocks.length > 0)
			footers[variant] = new docx.Footer({ children: childrenOfBlocks(docx, blocks, hideNumbers) })
		else if (furniture?.footer?.[variant])
			footers[variant] = new docx.Footer({
				children: childrenOf(docx, furniture.footer[variant], hideNumbers),
			})
	}

	const hasFirst = Boolean(headers.first || footers.first)
	const hasEven = Boolean(headers.even || footers.even)

	/*
	 * Penutup celah ekspor: dokumen tanpa perabot bernomor di layar lewat
	 * lencana cadangan, tapi DOCX-nya keluar tanpa nomor karena tidak ada
	 * footer pembawanya. Bila diminta, footer disintesis bila tidak ada atau
	 * kosong — dengan aturan yang sama dengan lencana: yang menghentikan
	 * sintesis bukan "ada perabot", melainkan perabot yang SUDAH membawa nomor,
	 * di footer ataupun header (supaya nomornya tidak digambar dua kali).
	 * Footer berisi teks statis tidak disentuh — menempel field ke konten
	 * pengguna adalah sisa yang dicatat di rencana. Varian first tidak pernah
	 * disintesis: footer first yang kosong adalah keputusan sadar ("Show on
	 * first page" dimatikan), bukan kekosongan. Varian even hanya disintesis
	 * bila evenAndOdd memang menyala; tanpa itu halaman genap memakai default.
	 */
	if (ensureNumberFooter) {
		const carries = (slot: 'header' | 'footer', variant: 'default' | 'even') => {
			const blocks = content?.[slot]?.[variant]
			return blocks && blocks.length > 0
				? blocksCarryNumber(blocks)
				: carriesToken(furniture?.[slot]?.[variant]?.text ?? '')
		}
		const missingOrEmpty = (variant: 'default' | 'even') => {
			const blocks = content?.footer?.[variant]
			if (blocks && blocks.length > 0) return blocksAreEmpty(blocks)
			const line = furniture?.footer?.[variant]
			return line ? (line.text ?? '').trim() === '' : true
		}
		for (const variant of hasEven ? (['default', 'even'] as const) : (['default'] as const)) {
			if (carries('footer', variant) || carries('header', variant)) continue
			if (!missingOrEmpty(variant)) continue
			footers[variant] = synthesizedFooterOf(docx, hideNumbers)
		}
	}

	return {
		...(Object.keys(headers).length > 0 ? { headers } : {}),
		...(Object.keys(footers).length > 0 ? { footers } : {}),
		...(hasFirst ? { titlePage: true } : {}),
		...(hasEven ? { evenAndOdd: true } : {}),
	}
}
