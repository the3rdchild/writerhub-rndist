import { mergeAttributes, Node } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import { DEFAULT_PAGE_SETUP, type PageSetup } from './page-geometry'

/**
 * Pembatas section: mulai dari sini, tata letak lembar berubah (§P8&P9).
 *
 * Setelan menempel pada potongan naskah, bukan pada nomor halaman - halaman
 * ke-3 bukan identitas yang stabil karena isi bergeser setiap kali teks
 * bertambah. Node ini menandai batasnya: ia SELALU memulai lembar baru, dan
 * section yang dimulai darinya mewarisi setelan section sebelumnya kecuali
 * yang disebutkan di atributnya (persis `sectPr` pada DOCX).
 *
 * Atributnya sengaja parsial: `pageSetup` hanya memuat yang berubah, dan
 * `columns` hanya ada bila section ini ditata berkolom (§P8).
 */

export const SECTION_BREAK_NODE = 'sectionBreak'

/** Atribut pembatas section; keduanya boleh null (mewarisi sepenuhnya). */
export interface SectionBreakAttrs {
	pageSetup: Partial<PageSetup> | null
	columns: { count: number; gap?: number } | null
}

/** Satu rentang section: mulai dari `pos`, dengan setelan yang sudah digabung. */
export interface SectionSpan {
	/** Posisi node `sectionBreak` yang memulai section ini; 0 untuk yang pertama. */
	pos: number
	setup: PageSetup
	columns: { count: number; gap?: number } | null
}

declare module '@tiptap/core' {
	interface Commands<ReturnType> {
		sectionBreak: {
			setSectionBreak: (attrs?: Partial<SectionBreakAttrs>) => ReturnType
			applySectionSetup: (
				patch: Partial<PageSetup>,
				range: { from: number; to?: number },
				baseSetup?: PageSetup,
			) => ReturnType
		}
	}
}

function parseJsonAttribute<T>(element: HTMLElement, name: string): T | null {
	const raw = element.getAttribute(name)
	if (!raw) return null
	try {
		return JSON.parse(raw) as T
	} catch {
		return null
	}
}

export const SectionBreak = Node.create({
	name: SECTION_BREAK_NODE,

	group: 'block',
	atom: true,
	selectable: true,

	addAttributes() {
		return {
			pageSetup: {
				default: null,
				parseHTML: (element) => parseJsonAttribute<Partial<PageSetup>>(element, 'data-page-setup'),
				renderHTML: (attributes) =>
					attributes.pageSetup === null
						? {}
						: { 'data-page-setup': JSON.stringify(attributes.pageSetup) },
			},
			columns: {
				default: null,
				parseHTML: (element) =>
					parseJsonAttribute<SectionBreakAttrs['columns']>(element, 'data-columns'),
				renderHTML: (attributes) =>
					attributes.columns === null ? {} : { 'data-columns': JSON.stringify(attributes.columns) },
			},
		}
	},

	parseHTML() {
		return [{ tag: 'div[data-section-break]' }]
	},

	renderHTML({ HTMLAttributes }) {
		return [
			'div',
			mergeAttributes(HTMLAttributes, {
				'data-section-break': '',
				class: 'section-break',
				'aria-label': 'Pembatas section',
			}),
		]
	},

	addCommands() {
		return {
			setSectionBreak:
				(attrs) =>
				({ chain, state }) => {
					const atEnd = state.selection.to >= state.doc.content.size - 1
					const node = {
						type: this.name,
						attrs: { pageSetup: attrs?.pageSetup ?? null, columns: attrs?.columns ?? null },
					}
					// Node atom di ujung dokumen tidak menyisakan tempat untuk kursor.
					const content = atEnd ? [node, { type: 'paragraph' }] : [node]
					return chain().insertContent(content).run()
				},

			/**
			 * Terapkan setelan halaman pada satu rentang naskah (§P8&P9).
			 *
			 * Dengan `to`: rentangnya dikurung dua pembatas - satu membuka section
			 * baru, satu MENUTUPNYA dengan mengembalikan setelan yang tadi berlaku.
			 * Tanpa pembatas penutup, "halaman ini saja" akan bocor sampai ujung
			 * naskah, dan itu justru cakupan yang berbeda.
			 *
			 * Tanpa `to`: satu pembatas saja - "dari sini dan seterusnya".
			 *
			 * Pembatas penutup membawa setelan sebelumnya SELENGKAPNYA, bukan
			 * selisihnya: selisih hanya benar selama section di antaranya tidak
			 * ikut berubah, dan yang membacanya nanti tidak punya cara tahu itu.
			 */
			applySectionSetup:
				(patch, range, baseSetup = DEFAULT_PAGE_SETUP) =>
				({ tr, dispatch, state }) => {
					const type = state.schema.nodes[SECTION_BREAK_NODE]
					if (!type) return false

					const spans = sectionSpans(state.doc, baseSetup)
					// Setelan yang berlaku tepat sebelum rentang ini - itulah yang harus
					// dipulihkan sesudahnya.
					const before = spans.filter((span) => span.pos <= range.from).pop() ?? spans[0]

					if (!dispatch) return true

					// Sisipkan dari posisi TERBESAR lebih dulu: menyisipkan di `from`
					// menggeser `to`, sebaliknya tidak.
					if (range.to !== undefined && range.to < state.doc.content.size) {
						tr.insert(
							range.to,
							type.create({ pageSetup: before.setup, columns: before.columns ?? null }),
						)
					}
					tr.insert(range.from, type.create({ pageSetup: patch, columns: before.columns ?? null }))

					return true
				},
		}
	},
})

/**
 * Daftar rentang section sebuah dokumen, dari puncak sampai akhir.
 *
 * Section pertama memakai setelan dasar tab; tiap `sectionBreak` memulai
 * section baru yang mewarisi setelan section SEBELUMNYA kecuali yang ia ubah
 * sendiri. Murni aritmetika atas struktur dokumen - diekspor demi pengujian.
 */
export function sectionSpans(doc: PMNode, baseSetup: PageSetup = DEFAULT_PAGE_SETUP): SectionSpan[] {
	const spans: SectionSpan[] = [{ pos: 0, setup: baseSetup, columns: null }]

	doc.forEach((node, offset) => {
		if (node.type.name !== SECTION_BREAK_NODE) return
		const previous = spans[spans.length - 1]
		const patch = (node.attrs.pageSetup ?? {}) as Partial<PageSetup>
		spans.push({
			pos: offset,
			setup: { ...previous.setup, ...patch, margins: { ...previous.setup.margins, ...patch.margins } },
			columns: (node.attrs.columns as SectionBreakAttrs['columns']) ?? null,
		})
	})

	return spans
}

/** Rentang dokumen yang ditata berkolom oleh section-nya (§P8). */
export interface ColumnRegion {
	/** Posisi blok pertama sesudah pembatas section-nya. */
	from: number
	/** Posisi pembatas section berikutnya, atau ujung dokumen. */
	to: number
	span: SectionSpan
}

/**
 * Rentang-rentang section berkolom sebuah dokumen. Dipakai dua plugin sekaligus:
 * tata letak kolom menata isi rentangnya, dan paginasi memperlakukan tiap
 * rentang sebagai satu blok self-paginate supaya tidak mendorong isinya satu
 * per satu. Dihitung dari satu `sectionSpans`, jadi keduanya selalu sepakat.
 */
export function columnRegions(doc: PMNode, baseSetup: PageSetup = DEFAULT_PAGE_SETUP): ColumnRegion[] {
	const spans = sectionSpans(doc, baseSetup)
	const regions: ColumnRegion[] = []

	spans.forEach((span, index) => {
		if (index === 0) return
		if (!span.columns || span.columns.count < 2) return

		const breakNode = doc.nodeAt(span.pos)
		if (!breakNode) return
		regions.push({
			from: span.pos + breakNode.nodeSize,
			to: spans[index + 1]?.pos ?? doc.content.size,
			span,
		})
	})

	return regions
}
