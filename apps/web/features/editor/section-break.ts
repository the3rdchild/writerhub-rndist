import { type CommandProps, mergeAttributes, Node } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import type { EditorState, Transaction } from '@tiptap/pm/state'
import { DEFAULT_PAGE_SETUP, type PageSetup } from './page-geometry'

/**
 * Pembatas section: mulai dari sini, tata letak lembar berubah (§P8&P9).
 *
 * Setelan menempel pada potongan naskah, bukan pada nomor halaman - halaman
 * ke-3 bukan identitas yang stabil karena isi bergeser setiap kali teks
 * bertambah. Node ini menandai batasnya: ia memulai lembar baru, dan section
 * yang dimulai darinya mewarisi setelan section sebelumnya kecuali yang
 * disebutkan di atributnya (persis `sectPr` pada DOCX).
 *
 * Pengecualiannya pembatas MENERUS (`continuous`, E5): ia tidak membuka lembar
 * baru - yang berubah hanya kolomnya, di tengah halaman yang sama. Karena satu
 * lembar hanya punya satu ukuran kertas, pembatas menerus yang membawa
 * `pageSetup` sampai mengubah geometri lembar turun pangkat jadi pembatas
 * biasa (lihat `sameSheetGeometry`).
 *
 * Atributnya sengaja parsial: `pageSetup` hanya memuat yang berubah, dan
 * `columns` hanya ada bila section ini ditata berkolom (§P8).
 */

export const SECTION_BREAK_NODE = 'sectionBreak'

/** Atribut pembatas section; keduanya boleh null (mewarisi sepenuhnya). */
export interface SectionBreakAttrs {
	pageSetup: Partial<PageSetup> | null
	columns: { count: number; gap?: number } | null
	/** true = pembatas menerus (E5): hanya kolom yang berubah, lembar tidak. */
	continuous?: boolean
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
			applySectionColumns: (
				columns: SectionBreakAttrs['columns'],
				range: { from: number; to?: number },
				baseSetup?: PageSetup,
			) => ReturnType
			/** Kolomkan seleksi sebagai SECTION MENERUS (E5) - isi tidak pindah lembar. */
			setSectionColumns: (count: number) => ReturnType
			/** Hapus sepasang pembatas section berkolom yang melingkupi seleksi. */
			unsetSectionColumns: () => ReturnType
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
			continuous: {
				default: false,
				parseHTML: (element) => element.getAttribute('data-continuous') === 'true',
				renderHTML: (attributes) => (attributes.continuous ? { 'data-continuous': 'true' } : {}),
			},
		}
	},

	parseHTML() {
		return [{ tag: 'div[data-section-break]' }]
	},

	renderHTML({ node, HTMLAttributes }) {
		return [
			'div',
			mergeAttributes(HTMLAttributes, {
				'data-section-break': '',
				// Pembatas menerus tampil beda di layar dan tidak memenggal kertas.
				class: node.attrs.continuous ? 'section-break section-break-continuous' : 'section-break',
				'aria-label': node.attrs.continuous ? 'Pembatas section menerus' : 'Pembatas section',
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
						attrs: {
							pageSetup: attrs?.pageSetup ?? null,
							columns: attrs?.columns ?? null,
							continuous: attrs?.continuous ?? false,
						},
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
				({ tr, dispatch, state }) =>
					encloseSection(
						{ tr, dispatch, state },
						range,
						baseSetup,
						(before) => ({
							open: { pageSetup: patch, columns: before.columns ?? null },
							close: { pageSetup: before.setup, columns: before.columns ?? null },
						}),
					),

			/**
			 * Sama seperti `applySectionSetup`, tapi yang diubah jumlah kolomnya.
			 *
			 * Berdiri sebagai perintah tersendiri - bukan dirakit ulang di tiap
			 * pemanggil - karena tiga permukaan memakainya: menu Format, alat AI
			 * `set_columns`, dan (lewat rentang yang sama) dialog Penyiapan halaman.
			 *
			 * Kolom TIDAK diwarisi antar section: `sectionSpans` membaca atribut tiap
			 * pembatas apa adanya. Karena itu pembatas penutup yang membawa
			 * `columns: null` benar-benar berarti "kembali satu kolom", bukan
			 * "ikut yang sebelumnya".
			 */
			applySectionColumns:
				(columns, range, baseSetup = DEFAULT_PAGE_SETUP) =>
				({ tr, dispatch, state }) =>
					encloseSection({ tr, dispatch, state }, range, baseSetup, (before) => ({
						// pageSetup null = warisi; yang diubah hanya kolomnya.
						open: { pageSetup: null, columns },
						close: { pageSetup: null, columns: before.columns ?? null },
					})),

			setSectionColumns:
				(count) =>
				({ state, tr, dispatch }) =>
					setSectionColumnsCommand(state, tr, dispatch, count),

			unsetSectionColumns:
				() =>
				({ state, tr, dispatch }) =>
					unsetSectionColumnsCommand(state, tr, dispatch),
		}
	},
})

/**
 * Kurung sebuah rentang dengan pembatas section: satu membuka, satu menutup.
 *
 * Pembatas penutup mengembalikan keadaan yang tadi berlaku - tanpa itu,
 * perubahan yang diminta untuk satu halaman bocor sampai ujung naskah, dan itu
 * cakupan yang berbeda. Yang membuka dan yang menutup dirakit pemanggil lewat
 * `attrs`, karena hanya ia yang tahu bagian mana yang sedang diubah.
 */
function encloseSection(
	{ tr, dispatch, state }: Pick<CommandProps, 'tr' | 'dispatch' | 'state'>,
	range: { from: number; to?: number },
	baseSetup: PageSetup,
	attrs: (before: SectionSpan) => { open: SectionBreakAttrs; close: SectionBreakAttrs },
): boolean {
	const type = state.schema.nodes[SECTION_BREAK_NODE]
	if (!type) return false

	const spans = sectionSpans(state.doc, baseSetup)
	// Keadaan yang berlaku tepat sebelum rentang ini - itulah yang dipulihkan.
	const before = spans.filter((span) => span.pos <= range.from).pop() ?? spans[0]
	const { open, close } = attrs(before)

	if (!dispatch) return true

	// Sisipkan dari posisi TERBESAR lebih dulu: menyisipkan di `from` menggeser
	// `to`, sebaliknya tidak.
	if (range.to !== undefined && range.to < state.doc.content.size) {
		tr.insert(range.to, type.create(close))
	}
	tr.insert(range.from, type.create(open))

	return true
}

/**
 * Rentang section berkolom yang melingkupi sebuah posisi, bila ada.
 *
 * Dipakai kedua perintah kolom-seleksi: di dalam rentang, mengubah kolom
 * berarti menyunting pembatas pembukanya - bukan menambah sepasang pembatas
 * baru di dalam rentang yang sudah ada.
 */
function enclosingColumnSpan(spans: readonly SectionSpan[], from: number, docSize: number): SectionSpan | null {
	// slice(1), bukan saring posisi: pembatas DI POSISI 0 pun membuka section
	// nyata, dan posisinya berbagi angka yang sama dengan section dasar.
	const columned = spans.slice(1).filter((span) => (span.columns?.count ?? 0) >= 2)
	const candidate = columned.filter((span) => span.pos <= from).pop()
	if (!candidate) return null
	const next = spans[spans.indexOf(candidate) + 1]
	return from < (next?.pos ?? docSize) ? candidate : null
}

/**
 * Kolomkan seleksi sebagai SECTION MENERUS (E5 langkah 2).
 *
 * Berbeda dari `applySectionColumns` (cakupan halaman/section): kedua pembatas
 * membawa `continuous`, jadi isi terpilih TIDAK didorong ke lembar berikutnya -
 * "kolomkan dua paragraf ini" berarti mengolomkannya di tempat, bukan
 * memindahkannya. Di dalam rentang yang sudah berkolom, perintah ini cukup
 * mengganti jumlah kolom pada pembatas pembukanya.
 *
 * Mengikuti konvensi perintah ProseMirror: perubahan ditulis ke `tr` yang
 * diberikan, dan `dispatch` hanya penanda "boleh mengubah dokumen". Diekspor
 * (bukan hanya lewat perintah editor) supaya bisa diuji tanpa DOM.
 */
export function setSectionColumnsCommand(
	state: EditorState,
	tr: Transaction,
	dispatch: ((tr: Transaction) => void) | undefined,
	count: number,
): boolean {
	if (!Number.isFinite(count) || count < 2) return false

	const spans = sectionSpans(state.doc)
	const enclosing = enclosingColumnSpan(spans, state.selection.from, state.doc.content.size)
	if (enclosing) {
		if (!dispatch) return true
		const node = state.doc.nodeAt(enclosing.pos)
		if (!node) return false
		const columns = { ...(node.attrs.columns as SectionBreakAttrs['columns']), count }
		tr.setNodeMarkup(enclosing.pos, undefined, { ...node.attrs, columns })
		return true
	}

	// Rentangnya blok-blok tingkat atas yang tersentuh seleksi, dihitung dari
	// LUAR bloknya - before/after, bukan start/end: menyisipkan pembatas di
	// dalam paragraf (start/end) justru membelah paragraf itu jadi dua.
	// Seleksi lipat berarti blok tempat kursor berada.
	const { $from, $to } = state.selection
	const from = $from.depth >= 1 ? $from.before(1) : 0
	const to = $to.depth >= 1 ? $to.after(1) : state.doc.content.size

	return encloseSection({ tr, dispatch, state }, { from, to }, DEFAULT_PAGE_SETUP, (before) => ({
		open: { pageSetup: null, columns: { count }, continuous: true },
		close: { pageSetup: null, columns: before.columns ?? null, continuous: true },
	}))
}

/**
 * Hapus sepasang pembatas section berkolom yang melingkupi seleksi (E5 langkah
 * 3): isinya kembali mengalir satu kolom. Pembatas penutup dibuang lebih dulu
 * supaya posisi pembatas pembuka tidak bergeser.
 *
 * Aman untuk pasangan bikinan `setSectionColumns` maupun `applySectionColumns`:
 * keduanya menulis `pageSetup: null` pada kedua pembatasnya, jadi membuangnya
 * tidak menjatuhkan setelan halaman apa pun.
 */
export function unsetSectionColumnsCommand(
	state: EditorState,
	tr: Transaction,
	dispatch: ((tr: Transaction) => void) | undefined,
): boolean {
	const spans = sectionSpans(state.doc)
	const enclosing = enclosingColumnSpan(spans, state.selection.from, state.doc.content.size)
	if (!enclosing) return false
	if (!dispatch) return true

	const next = spans[spans.indexOf(enclosing) + 1]
	if (next) {
		const closing = state.doc.nodeAt(next.pos)
		if (closing) tr.delete(next.pos, next.pos + closing.nodeSize)
	}
	const open = state.doc.nodeAt(enclosing.pos)
	if (open) tr.delete(enclosing.pos, enclosing.pos + open.nodeSize)
	return true
}

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
