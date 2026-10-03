import { Extension } from '@tiptap/core'
import { DOMSerializer, type Node as PMNode } from '@tiptap/pm/model'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { TableMap } from '@tiptap/pm/tables'
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view'
import type { PageNumbering } from '@writer-hub/shared'
import { COLUMN_BREAK_NODE } from './column-break'
import {
	assignFootnotes,
	type FootnoteSizes,
	footnoteRefPositions,
	measureFootnotes,
	notesHeight,
	notesSignature,
	type PageNotes,
	renderFootnoteArea,
} from './footnote-layout'
import { HTML_BLOCK } from './html-block'
import { PAGE_BREAK_NODE } from './page-break'
import {
	PAGE_GAP,
	type PageGeometry,
	type PageSetup,
	pageGeometry,
	type SheetGeometry,
	sameSheetGeometry,
	sameSheetSize,
} from './page-geometry'
import { columnRegions, SECTION_BREAK_NODE, sectionSpans } from './section-break'
import { attachTablePrintHeaders } from './table-print-header'

export const paginationKey = new PluginKey<PaginationState>('pagination')
export type SpacerKind = 'block' | 'row'

export interface Spacer {
	pos: number
	height: number
	kind: SpacerKind
	columns?: number
	headerPos?: number
	/** Catatan kaki lembar yang ditutup spacer ini, digambar di dasarnya (TKS-1). */
	notes?: PageNotes
	/** Spacer khusus catatan sebelum pemenggal: tidak memenggal sendiri saat dicetak. */
	notesOnly?: boolean
}

export interface Measurement {
	pos: number
	top: number
	bottom: number
	isBreak: boolean
	/** Blok ini membuka lembar baru sebelum dirinya sendiri. */
	breakBefore?: boolean
	isSectionBreak?: boolean
	kind: SpacerKind
	columns?: number
	headerPos?: number
	headerHeight?: number
	selfPaginate?: boolean
	internal?: number
	keepWithNext?: boolean
	/** Posisi kontainer untuk blok yang diukur di dalam kontainer (anak list,
	 * blockquote, callout). Penyesuaian margin dan label section ditempelkan ke
	 * kontainernya, bukan ke tiap anak. */
	container?: number
	/** Judul tingkat satu di tingkat teratas: lembar yang dibukanya adalah halaman pembuka bab. */
	opensChapter?: boolean
	/** Paragraf kosong yang langsung mengikuti blok `fit: 'page'`; tidak boleh
	 * melahirkan lembar baru di kanvas (EX-2). */
	trailingPageFit?: boolean
	/** Posisi rujukan catatan kaki di dalam blok ini. */
	footnotes?: number[]
	/** Akhir rentang naskah yang diwakili ukuran ini, bila lebih dari satu
	 * blok teratas - wilayah berkolom diukur sebagai satu ukuran. */
	end?: number
}

/*
 * Jenis blok yang tidak boleh ditinggal sendirian di dasar halaman: ia harus
 * turun bersama blok sesudahnya. Dipakai dua mesin - computeSpacers di sini
 * dan flowColumns di columns.ts - supaya naskah yang sama terpaginasi sama
 * di satu kolom maupun dua kolom.
 */
export const KEEP_WITH_NEXT = new Set(['heading'])

interface PaginationState {
	spacers: Spacer[]
	decorations: DecorationSet
	pageCount: number
	geometry: PageGeometry
	setup?: PageSetup
	sheets: SheetGeometry[]
	marginAdjustments: MarginAdjustment[]
	blockPages: BlockPage[]
	blockSections: BlockSection[]
	pageless: boolean
	breakBeforeLevels: number[]
	trailing?: PlacedNotes
}

/** Area catatan lembar terakhir, ditempatkan sesudah blok teratas yang memuat isi terakhir. */
interface PlacedNotes {
	pos: number
	notes: PageNotes
}

export interface PaginationOptions {
	geometry: PageGeometry
	setup?: PageSetup
	/** Tingkat judul yang selalu memulai lembar baru; dari tipografi dokumen. */
	breakBeforeLevels?: number[]
	onPageCountChange?: (pageCount: number) => void
	onSheetsChange?: (sheets: SheetGeometry[]) => void
	onSectionsChange?: (setups: PageSetup[]) => void
	pageless?: boolean
}

export interface PaginationMeta {
	spacers?: Spacer[]
	pageCount?: number
	sheets?: SheetGeometry[]
	marginAdjustments?: MarginAdjustment[]
	blockPages?: BlockPage[]
	blockSections?: BlockSection[]
	geometry?: PageGeometry
	setup?: PageSetup
	pageless?: boolean
	breakBeforeLevels?: number[]
	trailing?: PlacedNotes | null
}

function measureBlocks(view: EditorView): Measurement[] {
	const inserted = insertedHeights(view)
	const measurements: Measurement[] = []
	let cumulative = 0
	const state = paginationKey.getState(view.state)
	const setup = state?.setup
	const breakLevels = state?.breakBeforeLevels ?? []

	/*
	 * Dua sumber hentian halaman, keduanya murah.
	 *
	 * Atribut `pageBreakBefore` datang dari butir menu "Tambah hentian halaman
	 * sebelum" (`block-keep.ts`); dulu ia hanya menghasilkan CSS `break-before`,
	 * jadi ia bekerja saat mencetak tapi kanvasnya tidak ikut berubah.
	 *
	 * Aturan tingkat judul datang dari tipografi template - itulah yang membuat
	 * tiap BAB membuka lembar baru, termasuk bab yang ditambahkan besok dan
	 * tidak membawa atribut apa pun.
	 */
	const breaksBefore = (node: PMNode): boolean => {
		if (node.attrs.pageBreakBefore === true) return true
		return node.type.name === 'heading' && breakLevels.includes(Number(node.attrs.level))
	}
	const regions = setup ? columnRegions(view.state.doc, setup) : []

	/*
	 * Node sebelumnya dipakai untuk menandai paragraf kosong yang mengikuti
	 * blok `fit: 'page'` - ia tidak boleh melahirkan lembar baru di kanvas
	 * (EX-2). `trailingPageFit` hanya true bila node sebelumnya adalah blok HTML
	 * mode halaman dan node ini paragraf kosong.
	 */
	let prevWasPageFit = false

	view.state.doc.forEach((node, offset) => {
		cumulative += inserted.get(offset) ?? 0

		/*
		 * Paragraf kosong sesudah blok `fit: 'page'` ditandai di sini supaya
		 * `computeSpacers` tahu untuk tidak mendorong lembar baru karenanya.
		 * Diperiksa sebelum logika pengukuran manapun berjalan, supaya semua
		 * jalur (region, selfPaginate, split, biasa) lewat titik yang sama.
		 */
		const isTrailingPageFit = prevWasPageFit && node.type.name === 'paragraph' && node.content.size === 0

		const region = regions.find((entry) => offset >= entry.from && offset < entry.to)
		if (region) {
			if (offset !== region.from) {
				prevWasPageFit = false
				return
			}

			const placeholder = view.dom.querySelector(`[${REGION_SPACE_ATTRIBUTE}="${region.from}"]`)
			if (placeholder instanceof HTMLElement) {
				const top = placeholder.offsetTop - cumulative
				const internal = Number(placeholder.getAttribute(REGION_SHEET_GAP_ATTRIBUTE)) || 0
				cumulative += internal
				measurements.push({
					pos: offset,
					top,
					bottom: top + placeholder.offsetHeight,
					isBreak: false,
					kind: 'block',
					selfPaginate: true,
					internal,
					end: region.to,
				})
				prevWasPageFit = false
				return
			}
		}

		const dom = view.nodeDOM(offset)
		if (!(dom instanceof HTMLElement)) {
			prevWasPageFit = false
			return
		}
		const top = dom.offsetTop - cumulative

		if (node.type.name === 'table') {
			cumulative = measureTable(view, node, offset, top, dom, cumulative, inserted, measurements)
			prevWasPageFit = false
			return
		}

		if (dom.hasAttribute(SELF_PAGINATE_ATTRIBUTE) || dom.querySelector(`[${SELF_PAGINATE_ATTRIBUTE}]`)) {
			let internal = 0
			for (const element of dom.querySelectorAll<HTMLElement>(`[${SPACER_ATTRIBUTE}]`)) {
				internal += element.offsetHeight
			}
			cumulative += internal
			measurements.push({
				pos: offset,
				top,
				bottom: top + dom.offsetHeight,
				isBreak: false,
				kind: 'block',
				selfPaginate: true,
				internal,
			})
			prevWasPageFit = node.type.name === HTML_BLOCK && node.attrs.fit === 'page'
			return
		}

		if (SPLIT_CONTAINERS.has(node.type.name)) {
			cumulative = measureContainerChildren(view, node, offset, top, dom, cumulative, inserted, measurements)
			prevWasPageFit = false
			return
		}

		measurements.push({
			pos: offset,
			top,
			bottom: top + dom.offsetHeight,
			/* Pindah kolom di LUAR wilayah berkolom: Word memenggal halaman.
			 * Yang di dalam wilayah tidak sampai ke sini - blok wilayah
			 * diwakili satu pengganjal dan diatur `flowColumns`. */
			isBreak: node.type.name === PAGE_BREAK_NODE || node.type.name === COLUMN_BREAK_NODE,
			breakBefore: breaksBefore(node) || undefined,
			isSectionBreak: node.type.name === SECTION_BREAK_NODE || undefined,
			kind: 'block',
			keepWithNext: KEEP_WITH_NEXT.has(node.type.name) || undefined,
			opensChapter: (node.type.name === 'heading' && Number(node.attrs.level) === 1) || undefined,
			trailingPageFit: isTrailingPageFit || undefined,
		})
		/* Blok HTML tidak memaginasi dirinya sendiri, jadi ia diukur di jalur
		 * biasa ini - di sinilah tandanya harus dipasang. Dulu selalu `false`,
		 * dan paragraf kosong sesudah flyer tetap melahirkan lembar kedua (UC5). */
		prevWasPageFit = node.type.name === HTML_BLOCK && node.attrs.fit === 'page'
	})

	return measurements
}

/*
 * Jumlah kolom sebuah tabel bukan jumlah sel di baris pertamanya: satu sel
 * ber-colspan menutupi beberapa kolom sekaligus, dan sel ber-rowspan dari baris
 * di atasnya memakan tempat tanpa muncul sebagai anak baris ini. TableMap sudah
 * memecahkan keduanya - `childCount` tidak, dan angkanya dipakai sebagai colSpan
 * baris pengisi di batas halaman, jadi selisihnya langsung terlihat sebagai
 * garis tabel yang putus.
 */
export function tableColumnCount(table: PMNode): number {
	return TableMap.get(table).width || 1
}

function measureTable(
	view: EditorView,
	table: PMNode,
	tablePos: number,
	tableTop: number,
	tableDom: HTMLElement,
	cumulativeAtTable: number,
	inserted: Map<number, number>,
	out: Measurement[],
): number {
	let cumulative = cumulativeAtTable

	const headerRow = table.firstChild
	const hasHeader = headerRow?.firstChild?.type.name === 'tableHeader'
	const repeat = hasHeader && table.attrs.repeatHeader !== false
	const columns = tableColumnCount(table)
	const headerPos = repeat ? tablePos + 1 : undefined

	let headerHeight = 0
	let isFirstRow = true

	table.forEach((_row, rowOffset) => {
		const rowPos = tablePos + 1 + rowOffset
		cumulative += inserted.get(rowPos) ?? 0

		const rowDom = view.nodeDOM(rowPos)
		if (!(rowDom instanceof HTMLElement)) return
		const top = tableDom.offsetTop + rowDom.offsetTop - cumulative
		const bottom = top + rowDom.offsetHeight

		if (isFirstRow) {
			isFirstRow = false
			headerHeight = rowDom.offsetHeight
			out.push({ pos: tablePos, top: tableTop, bottom, isBreak: false, kind: 'block' })
			return
		}

		out.push({
			pos: rowPos,
			top,
			bottom,
			isBreak: false,
			kind: 'row',
			columns,
			headerPos,
			headerHeight: repeat ? headerHeight : 0,
		})
	})

	return cumulative
}

/*
 * Kontainer non-tabel diukur per anak, bukan sebagai satu blok atomik. Daftar
 * bernomor panjang, blockquote, dan callout harus punya titik penggal di batas
 * halaman seperti paragraf biasa; tanpa ini, satu kontainer yang lebih tinggi
 * dari satu halaman meluber menembus batas lembar karena tidak ada posisi yang
 * bisa diberi spacer. Anak diukur pada posisinya sendiri persis seperti baris
 * tabel - spacer-nya pun disisipkan di dalam kontainer, tepat sebelum anak yang
 * mengawali lembar baru.
 */
const SPLIT_CONTAINERS = new Set(['orderedList', 'bulletList', 'taskList', 'blockquote', 'callout'])

function measureContainerChildren(
	view: EditorView,
	container: PMNode,
	containerPos: number,
	containerTop: number,
	containerDom: HTMLElement,
	cumulativeAtContainer: number,
	inserted: Map<number, number>,
	out: Measurement[],
): number {
	let cumulative = cumulativeAtContainer

	container.forEach((child, childOffset) => {
		const childPos = containerPos + 1 + childOffset
		cumulative += inserted.get(childPos) ?? 0

		const childDom = view.nodeDOM(childPos)
		if (!(childDom instanceof HTMLElement)) return
		/*
		 * offsetTop selalu relatif ke offsetParent. Anak kontainer biasanya
		 * berbagi offsetParent dengan kontainernya, jadi offsetTop-nya sudah
		 * sebidang dengan `containerTop`; hanya bila kontainernya sendiri yang
		 * menjadi offsetParent (mis. ia ber-position) keduanya perlu dijumlahkan.
		 */
		const top =
			childDom.offsetParent === containerDom
				? containerTop + childDom.offsetTop - (cumulative - cumulativeAtContainer)
				: childDom.offsetTop - cumulative

		out.push({
			pos: childPos,
			top,
			bottom: top + childDom.offsetHeight,
			isBreak: false,
			kind: 'block',
			keepWithNext: KEEP_WITH_NEXT.has(child.type.name) || undefined,
			container: containerPos,
		})
	})

	return cumulative
}

export const SPACER_ATTRIBUTE = 'data-spacer-for'
export const REGION_SPACE_ATTRIBUTE = 'data-columns-region'
export const REGION_SHEET_GAP_ATTRIBUTE = 'data-sheet-gap'
export const SELF_PAGINATE_ATTRIBUTE = 'data-self-paginate'

function insertedHeights(view: EditorView): Map<number, number> {
	const heights = new Map<number, number>()

	for (const element of view.dom.querySelectorAll<HTMLElement>(`[${SPACER_ATTRIBUTE}]`)) {
		if (element.closest(`[${SELF_PAGINATE_ATTRIBUTE}]`)) continue
		const pos = Number(element.getAttribute(SPACER_ATTRIBUTE))
		if (Number.isNaN(pos)) continue
		heights.set(pos, (heights.get(pos) ?? 0) + element.offsetHeight)
	}

	return heights
}

/**
 * Section mana yang mengalir terus di lembar berjalan (tidak membuka lembar
 * baru): yang menerus dengan geometri lembar yang sama - dan pembatas di
 * posisi 0, karena sebelum dia belum ada isi apa pun. Tanpa pengecualian itu
 * pembatas "next page" di awal naskah (sisa perintah kolom "This page" lama)
 * mengosongkan halaman 1 (KOL-4). Indeks sejajar `spans`; span pertama selalu
 * false.
 */
export function sectionContinuity(
	doc: PMNode,
	spans: readonly { pos: number; setup: PageSetup }[],
): boolean[] {
	return spans.map((span, index) => {
		if (index === 0) return false
		const node = doc.nodeAt(span.pos)
		const flowing = node?.attrs.continuous === true || span.pos === 0
		return flowing && sameSheetSize(span.setup, spans[index - 1].setup)
	})
}

export interface SectionGeometry {
	pos: number
	geometry: PageGeometry
	continuous?: boolean
	/** Indeks section (span) pembuka; 0 tidak pernah muncul di daftar ini. */
	index: number
	/** Aturan penomoran halaman section ini (dari setup yang sudah digabung). */
	pageNumbering?: PageNumbering | null
}

export interface BlockPage {
	pos: number
	page: number
}

export function pageOfPos(blockPages: readonly BlockPage[], pos: number): number | null {
	let page: number | null = null
	for (const block of blockPages) {
		if (block.pos > pos) break
		page = block.page
	}
	return page
}

export function pageBlockRange(
	blockPages: readonly BlockPage[],
	page: number,
	docSize: number,
): { from: number; to: number } | null {
	const first = blockPages.find((block) => block.page === page)
	if (!first) return null
	const next = blockPages.find((block) => block.page > page)
	return { from: first.pos, to: next?.pos ?? docSize }
}

/** Catatan kaki lembar terakhir: digambar sesudah blok isi terakhir, bukan di spacer. */
export interface TrailingNotes extends PageNotes {
	/** Posisi di dalam blok isi terakhir - area catatan menyusul blok teratasnya.
	 * Untuk wilayah berkolom: posisi di blok TERAKHIR wilayahnya, bukan awal
	 * wilayah, supaya urutan bacanya tetap isi lalu catatan. */
	afterPos: number
}

/*
 * Ruang aman di bawah area catatan lembar terakhir: jarak bawah blok terakhir
 * tidak terukur, dan area yang melewati dasar lembar terdorong ke lembar
 * berikutnya saat dicetak.
 */
const TRAILING_NOTES_SAFETY = 16

export function computeSpacers(
	blocks: readonly Measurement[],
	geometry: PageGeometry,
	sections: readonly SectionGeometry[] = [],
	baseNumbering?: PageNumbering | null,
	footnoteSizes?: FootnoteSizes,
): {
	spacers: Spacer[]
	pageCount: number
	sheets: SheetGeometry[]
	blockPages: BlockPage[]
	trailingNotes?: TrailingNotes
} {
	const spacers: Spacer[] = []
	const blockPages: BlockPage[] = []
	let cumulative = 0
	let pageStart = 0
	let forceNext = false
	let pendingGeometry: PageGeometry | null = null
	/* Penomoran section tidak diwarisi antar-lembar lewat merges di sini;
	 * keduanya menempel pada section dan diteruskan ke lembar yang dibuka
	 * break-nya. `pendingSection === undefined` berarti warisi lembar sebelumnya. */
	let pendingSection: { index: number; pageNumbering: PageNumbering | null } | undefined

	const baseMargins = geometry.margins
	const sheets: SheetGeometry[] = [
		{ ...geometry, index: 0, top: 0, sectionIndex: 0, pageNumbering: baseNumbering ?? null },
	]
	const contentTop = (sheet: SheetGeometry) => sheet.top + sheet.margins.top - baseMargins.top
	/*
	 * Lembar terakhir yang sudah berisi blok. Judul tingkat satu yang menjadi
	 * blok pertama lembarnya menandai lembar itu halaman pembuka bab - tempat
	 * pedoman karya ilmiah menaruh nomor di tengah bawah.
	 */
	let filledSheet = -1
	/*
	 * Catatan kaki lembar yang sedang diisi (TKS-1). Ruangnya dipesan dari
	 * dasar lembar: blok yang - bersama catatannya sendiri - tidak muat lagi
	 * turun ke lembar berikutnya membawa catatannya.
	 */
	let pageNotes: number[] = []
	const reserveWith = (more: readonly number[] | undefined) =>
		notesHeight(more && more.length > 0 ? [...pageNotes, ...more] : pageNotes, footnoteSizes)
	const takeNotes = (sheet: SheetGeometry, flow: number): PageNotes | undefined => {
		if (pageNotes.length === 0) return undefined
		const height = notesHeight(pageNotes, footnoteSizes)
		const bottom = contentTop(sheet) + sheet.contentHeight
		const notes: PageNotes = { refs: pageNotes, height, before: Math.max(0, bottom - height - flow) }
		pageNotes = []
		return notes
	}
	/* Pemenggal paksa menutup lembarnya sendiri - catatannya digambar sebelum pemenggal. */
	const emitNotesBefore = (block: Measurement) => {
		const notes = takeNotes(sheets[sheets.length - 1], block.top + cumulative)
		if (!notes) return
		const height = notes.before + notes.height
		spacers.push({ pos: block.pos, height, kind: 'block', notes, notesOnly: true })
		cumulative += height
	}
	const place = (block: Measurement) => {
		const page = sheets.length - 1
		if (block.opensChapter && filledSheet !== page) sheets[page].opensChapter = true
		filledSheet = page
		if (block.footnotes) pageNotes.push(...block.footnotes)
	}
	const pushSheet = (): SheetGeometry => {
		const last = sheets[sheets.length - 1]
		const next: SheetGeometry = {
			...(pendingGeometry ?? last),
			index: sheets.length,
			top: last.top + last.height + PAGE_GAP,
			sectionIndex: pendingSection?.index ?? last.sectionIndex ?? 0,
			pageNumbering: pendingSection ? pendingSection.pageNumbering : (last.pageNumbering ?? null),
			// Disebar dari lembar sebelumnya - tanda pembuka bab tidak ikut diwarisi.
			opensChapter: undefined,
		}
		sheets.push(next)
		pendingGeometry = null
		pendingSection = undefined
		return next
	}

	for (const [index, block] of blocks.entries()) {
		if (block.isSectionBreak) {
			blockPages.push({ pos: block.pos, page: sheets.length - 1 })
			const section = sections.find((section) => section.pos === block.pos)
			if (section) {
				const rule = { index: section.index, pageNumbering: section.pageNumbering ?? null }
				if (section.continuous) {
					/*
					 * Section menerus tidak membuka lembar; aturannya berlaku pada
					 * lembar yang sedang berjalan (satu nomor per lembar, seperti Word
					 * yang hanya punya satu nomor per halaman).
					 *
					 * Yang TIDAK boleh ikut: mulai-ulang. Section menerus yang cuma
					 * berkata "lanjutkan" tidak sedang meminta apa-apa soal nomor,
					 * dan menimpakan aturannya menghapus mulai-ulang yang sudah
					 * berlaku di lembar ini - dokumen yang mulai di halaman 32
					 * kembali mulai dari 1 begitu section pertamanya berkolom.
					 * Identitas sectionnya pun ditahan, karena pergantian section
					 * itulah yang dibaca `formatSheetNumbers` sebagai penanda
					 * mulai-ulang; memindahkannya di lembar yang sama berarti
					 * membakar mulai-ulang yang belum sempat dipakai.
					 */
					const current = sheets[sheets.length - 1]
					if (rule.pageNumbering && typeof rule.pageNumbering.restart === 'number') {
						current.sectionIndex = rule.index
						current.pageNumbering = rule.pageNumbering
					} else if (rule.pageNumbering) {
						/* Format dan visibilitas tetap berlaku - keduanya tidak
						 * memulai ulang apa pun. */
						current.pageNumbering = {
							...rule.pageNumbering,
							restart: current.pageNumbering?.restart ?? 'continue',
						}
					}
				} else {
					pendingSection = rule
				}
			}
			if (!section?.continuous) {
				emitNotesBefore(block)
				forceNext = true
				pendingGeometry = section?.geometry ?? null
			} else {
				/* Menerus dengan margin berbeda (kertasnya sama, `sameSheetSize`):
				 * lembar berjalan tetap; margin atas/bawah section ini berlaku mulai
				 * lembar berikutnya, seperti Word. Kiri/kanan sudah digeser per blok
				 * (`marginAdjustments`). */
				pendingGeometry = section.geometry
			}
			continue
		}

		if (block.isBreak) {
			/*
			 * Pemenggal bertinggi nol tidak menempati ruang, jadi ia tidak
			 * pernah meluap dan tidak pernah menjadi penerima spacer biasa.
			 * Tugasnya satu: menandai bahwa blok sesudahnya membuka lembar
			 * baru. Pemenggal BERUNTUN adalah satu-satunya pengecualian:
			 * penulis meminta lembar kosong di antaranya, jadi tiap
			 * pemenggal tambahan mengosongkan satu lembar di tempat -
			 * bukan dengan spacer miliknya, melainkan lembar kosong
			 * sungguhan lewat pushSheet (spacer milik pemenggal yang dulu
			 * ikut mendorong blok SESUDAHNYA dua kali - itulah asal dua
			 * lembar kosong liar setelah blok daftar isi yang meluber).
			 */
			blockPages.push({ pos: block.pos, page: sheets.length - 1 })
			emitNotesBefore(block)
			if (forceNext) pushSheet()
			forceNext = true
			continue
		}

		const sheet = sheets[sheets.length - 1]
		/*
		 * `isFirstOnPage` hanya menjaga luapan: blok yang lebih tinggi dari satu
		 * halaman memang meluber, tapi lembarnya sudah dimulai, jadi mendorongnya
		 * lagi cuma melahirkan lembar kosong beruntun.
		 *
		 * Pemenggalan yang dipaksa tidak boleh ikut dijaga. Node pemenggal
		 * bertinggi nol (lihat .page-break dan .section-break di globals.css),
		 * jadi blok sesudahnya berbagi `top` yang sama persis dengan pemenggalnya
		 * - begitu pemenggal itu jatuh di awal halaman, blok sesudahnya ikut
		 * terbaca "sudah di awal halaman" dan permintaan penulis ditelan tanpa
		 * jejak: pemenggal di awal dokumen hilang sama sekali, dan dua pemenggal
		 * berurutan kehilangan lembar kosong di antaranya.
		 */
		const isFirstOnPage = block.top <= pageStart + 0.5
		const noteReserve = reserveWith(block.footnotes)
		const overflows = block.bottom + noteReserve > pageStart + sheet.contentHeight

		/*
		 * Blok yang minta membuka lembar baru, tapi kebetulan sudah berada di
		 * awal lembar, dibiarkan. Mendorongnya hanya melahirkan halaman kosong -
		 * dan itulah yang akan terjadi pada BAB I di halaman pertama.
		 */
		if (block.breakBefore && !isFirstOnPage) forceNext = true

		/*
		 * keepWithNext: blok yang memintanya tidak boleh tertinggal sendirian di
		 * dasar halaman. Yang diuji muat bukan bloknya sendiri, melainkan seluruh
		 * rangkaiannya - dia, blok-blok ber-keepWithNext sesudahnya, dan blok
		 * pertama yang tidak memintanya. Rangkaian yang lebih tinggi dari satu
		 * halaman dibiarkan: mendorongnya hanya memindahkan luapan, bukan
		 * menghilangkannya, dan halaman yang sudah dimulai tidak dikosongkan.
		 */
		let keepOverflows = false
		if (block.keepWithNext && !isFirstOnPage) {
			let last = index
			while (last + 1 < blocks.length && blocks[last].keepWithNext) last += 1
			const groupBottom = blocks[last].bottom
			keepOverflows =
				groupBottom + noteReserve > pageStart + sheet.contentHeight &&
				groupBottom - block.top <= sheet.contentHeight + 0.5
		}

		if (block.selfPaginate) {
			if (forceNext) {
				const previous = sheets[sheets.length - 1]
				const flow = block.top + cumulative
				const target = contentTop(pushSheet())
				const spacerHeight = Math.max(0, target - flow)
				spacers.push({
					pos: block.pos,
					height: spacerHeight,
					kind: block.kind,
					notes: takeNotes(previous, flow),
				})
				cumulative += spacerHeight
			}

			blockPages.push({ pos: block.pos, page: sheets.length - 1 })
			place(block)
			const canvasBottom = block.bottom + cumulative + baseMargins.top
			while (nextContentTop() < canvasBottom - 0.5) pushSheet()
			cumulative += block.internal ?? 0
			pageStart = contentTop(sheets[sheets.length - 1]) - cumulative

			forceNext = false
			continue
		}

		/*
		 * Paragraf kosong sesudah blok `fit: 'page'` tidak boleh melahirkan
		 * lembar baru di kanvas (EX-2). Blok sebelumnya mengisi tepat satu
		 * lembar, jadi paragraf ini pasti meluap - tetapi isinya kosong, jadi
		 * luapannya tidak terlihat. Ia ditaruh di lembar yang sama tanpa
		 * mendorong lembar baru, supaya penulis masih bisa mengetik di situ.
		 *
		 * Paragraf yang sudah berisi teks tidak membawa bendera ini (lihat
		 * `measureBlocks`), jadi ia tetap membuka halaman baru seperti biasa.
		 */
		if (block.trailingPageFit) {
			if (block.kind === 'block') blockPages.push({ pos: block.pos, page: sheets.length - 1 })
			place(block)
			forceNext = false
			continue
		}

		if (forceNext || ((overflows || keepOverflows) && !isFirstOnPage)) {
			const previous = sheets[sheets.length - 1]
			const flow = block.top + cumulative
			const target = contentTop(pushSheet())
			const spacerHeight = Math.max(0, target - flow)
			const headerHeight = block.headerHeight ?? 0

			spacers.push({
				pos: block.pos,
				height: spacerHeight,
				kind: block.kind,
				columns: block.columns,
				headerPos: headerHeight > 0 ? block.headerPos : undefined,
				notes: takeNotes(previous, flow),
			})
			cumulative += spacerHeight + headerHeight
			pageStart = block.top - headerHeight
		}
		if (block.kind === 'block') blockPages.push({ pos: block.pos, page: sheets.length - 1 })
		place(block)

		/*
		 * Permintaan lembar baru sudah dipenuhi oleh blok ini; tanpa reset,
		 * ia menular ke semua blok sesudahnya dan tiap blok mendapat lembarnya
		 * sendiri. (Dulu bagian dari `forceNext = block.isBreak`; pemenggal
		 * kini berhenti lebih awal, jadi nilainya selalu false di sini.)
		 */
		forceNext = false
		const canvasBottom = block.bottom + cumulative + baseMargins.top
		const before = sheets.length
		while (nextContentTop() < canvasBottom - 0.5) pushSheet()

		if (sheets.length > before) {
			forceNext = true
		}
	}
	let trailingNotes: TrailingNotes | undefined
	const lastContent = blocks.findLast((block) => !block.isBreak && !block.isSectionBreak)
	if (pageNotes.length > 0 && lastContent) {
		const sheet = sheets[sheets.length - 1]
		const height = notesHeight(pageNotes, footnoteSizes)
		const bottom = contentTop(sheet) + sheet.contentHeight
		const flow = lastContent.bottom + cumulative
		trailingNotes = {
			refs: pageNotes,
			height,
			before: Math.max(0, bottom - height - flow - TRAILING_NOTES_SAFETY),
			afterPos:
				lastContent.end !== undefined && lastContent.end > lastContent.pos
					? lastContent.end - 1
					: lastContent.pos,
		}
	}
	if (blocks[blocks.length - 1]?.isBreak) pushSheet()

	return { spacers, pageCount: sheets.length, sheets, blockPages, trailingNotes }
	function nextContentTop(): number {
		const last = sheets[sheets.length - 1]
		return last.top + last.height + PAGE_GAP + (pendingGeometry ?? last).margins.top
	}
}

function sameNotes(a: PageNotes | undefined, b: PageNotes | undefined): boolean {
	if (!a || !b) return a === b
	return (
		a.signature === b.signature &&
		a.refs.length === b.refs.length &&
		a.refs.every((ref, index) => ref === b.refs[index]) &&
		Math.abs(a.height - b.height) < 1 &&
		Math.abs(a.before - b.before) < 1
	)
}

function samePlacedNotes(a: PlacedNotes | undefined, b: PlacedNotes | undefined): boolean {
	if (!a || !b) return a === b
	return a.pos === b.pos && sameNotes(a.notes, b.notes)
}

function sameBlockPages(a: readonly BlockPage[], b: readonly BlockPage[]): boolean {
	return (
		a.length === b.length &&
		a.every((entry, index) => entry.pos === b[index].pos && entry.page === b[index].page)
	)
}

function sameSpacers(a: readonly Spacer[], b: readonly Spacer[]): boolean {
	return (
		a.length === b.length &&
		a.every((spacer, index) => {
			const other = b[index]
			return (
				spacer.pos === other.pos &&
				spacer.kind === other.kind &&
				spacer.headerPos === other.headerPos &&
				sameNotes(spacer.notes, other.notes) &&
				Math.abs(spacer.height - other.height) < 1
			)
		})
	)
}

/*
 * Diekspor untuk uji: kegagalannya pernah buta terhadap `show` — kotak centang
 * "Show page numbers" di dialog Page numbers tidak pernah terlihat di UI
 * karena lembar baru dianggap sama dengan yang lama.
 */
export function sameSheets(a: readonly SheetGeometry[], b: readonly SheetGeometry[]): boolean {
	return (
		a.length === b.length &&
		a.every((sheet, index) => {
			const other = b[index]
			return (
				sheet.top === other.top &&
				sheet.width === other.width &&
				sheet.height === other.height &&
				sheet.sectionIndex === other.sectionIndex &&
				(sheet.pageNumbering?.format ?? null) === (other.pageNumbering?.format ?? null) &&
				(sheet.pageNumbering?.restart ?? null) === (other.pageNumbering?.restart ?? null) &&
				/*
				 * Visibilitas (`show`) juga bagian dari lembar: mematikannya tidak
				 * menggeser apa pun secara geometri, jadi tanpa pembanding ini
				 * `onSheetsChange` tidak pernah menyala dan lencana sudut terus
				 * memakai nomor lamanya. Yang dibandingkan hanya "eksplisit
				 * disembunyikan" — `true` dan kosong sama-sama berarti tampil, supaya
				 * dokumen lama tanpa medan `show` tidak memicu pemancaran semu.
				 */
				(sheet.pageNumbering?.show === false) === (other.pageNumbering?.show === false) &&
				// Letak nomor dan halaman pembuka bab juga tidak menggeser geometri apa pun.
				(sheet.pageNumbering?.position ?? null) === (other.pageNumbering?.position ?? null) &&
				(sheet.pageNumbering?.openingPosition ?? null) === (other.pageNumbering?.openingPosition ?? null) &&
				Boolean(sheet.opensChapter) === Boolean(other.opensChapter)
			)
		})
	)
}

export interface MarginAdjustment {
	pos: number
	left: number
	right: number
}

export function marginAdjustments(
	blockPositions: readonly number[],
	spans: readonly { pos: number; width: number; margins: PageSetup['margins'] }[],
	canvasWidth: number,
	baseMargins: PageSetup['margins'],
): MarginAdjustment[] {
	const adjustments: MarginAdjustment[] = []

	for (const pos of blockPositions) {
		let span = spans[0]
		for (const candidate of spans) {
			if (candidate.pos > pos) break
			span = candidate
		}
		if (!span) continue

		const center = (canvasWidth - span.width) / 2
		const left = center + span.margins.left - baseMargins.left
		const right = center + span.margins.right - baseMargins.right
		if (Math.abs(left) < 0.5 && Math.abs(right) < 0.5) continue
		adjustments.push({ pos, left: Math.round(left), right: Math.round(right) })
	}

	return adjustments
}

/**
 * Nama halaman cetak sebuah blok: indeks section-nya, ditambah akhiran bila
 * lembarnya butuh aturan `@page` sendiri.
 *
 * - `o` - lembar pembuka bab di bagian yang nomornya berpindah tempat di
 *   halaman pembuka (tengah bawah) dibanding halaman lain (kanan atas).
 * - `f` - lembar pertama bagian yang mulai ulang dari angka selain 1.
 *
 * Peramban tidak bisa memilih "halaman pertama tiap bab" lewat CSS (`@page
 * nama:first` hanya berlaku untuk halaman pertama dokumen), jadi lembar-lembar
 * itu diberi nama halaman sendiri. Pergantian nama memaksa pemenggalan persis
 * di batas lembar layar - yang di situ memang sudah ada pemenggalannya.
 */
export interface BlockSection {
	pos: number
	section: number
	variant?: 'o' | 'f' | 'fo'
}

/**
 * Nama halaman cetak per section, dan dari blok mana tiap nama berlaku.
 *
 * Section yang memulai halaman baru mendapat nama baru tepat di pembatasnya.
 * Section menerus yang margin-nya berbeda (kertas sama, `sameSheetSize`) tidak
 * boleh berganti nama di pembatasnya - pergantian nama memaksa pemenggalan -
 * jadi namanya baru berlaku di blok pertama yang jatuh di lembar berikutnya,
 * tempat kanvas juga mulai memakai margin itu. Section menerus yang
 * geometrinya sama tidak butuh nama sendiri.
 */
export function printPageNames(
	spans: readonly { pos: number; setup: PageSetup }[],
	continuous: readonly boolean[],
	blockPositions: readonly number[],
	blockPages: readonly BlockPage[],
): { setups: PageSetup[]; entries: { pos: number; name: number }[] } {
	if (spans.length === 0) return { setups: [], entries: [] }
	const setups: PageSetup[] = [spans[0].setup]
	const entries = [{ pos: spans[0].pos, name: 0 }]
	spans.forEach((span, index) => {
		if (index === 0) return
		if (!continuous[index]) {
			setups.push(span.setup)
			entries.push({ pos: span.pos, name: setups.length - 1 })
			return
		}
		if (sameSheetGeometry(span.setup, setups[setups.length - 1])) return
		const limit = spans.find((_later, at) => at > index && !continuous[at])?.pos ?? Number.POSITIVE_INFINITY
		const breakSheet = pageOfPos(blockPages, span.pos)
		const boundary = blockPositions.find(
			(pos) => pos > span.pos && pos < limit && (pageOfPos(blockPages, pos) ?? -1) > (breakSheet ?? -1),
		)
		if (boundary === undefined) return
		setups.push(span.setup)
		entries.push({ pos: boundary, name: setups.length - 1 })
	})
	entries.sort((a, b) => a.pos - b.pos)
	return { setups, entries }
}

export function blockSections(
	blockPositions: readonly number[],
	sections: readonly { pos: number; name: number }[],
): BlockSection[] {
	return blockPositions.map((pos) => {
		let section = 0
		for (const entry of sections) {
			if (entry.pos > pos) break
			section = entry.name
		}
		return { pos, section }
	})
}

/**
 * Pemisah bagian (yang memulai halaman baru) memakai nama halaman blok DI
 * DEPANNYA. Ia penutup bagian sebelumnya: dengan nama bagian berikutnya,
 * peramban memenggal sebelum pemisah (nama berganti) DAN sesudahnya
 * (`break-after: page`), dan di antaranya lahir halaman kosong. Dengan nama
 * sebelumnya, kedua pemenggalan jatuh di titik yang sama dan menjadi satu.
 */
export function breaksKeepPreviousName(
	entries: readonly BlockSection[],
	breaks: ReadonlySet<number>,
): BlockSection[] {
	return entries.map((entry, index) => {
		const previous = entries[index - 1]
		if (!breaks.has(entry.pos) || !previous) return entry
		return {
			pos: entry.pos,
			section: previous.section,
			...(previous.variant ? { variant: previous.variant } : {}),
		}
	})
}

/**
 * Menambahkan akhiran nama halaman cetak (lihat `BlockSection`) dari lembar
 * tempat tiap blok jatuh. Kosong bila tidak ada blok yang membutuhkannya -
 * dokumen biasa tidak mendapat dekorasi apa pun.
 */
export function withPrintVariants(
	entries: readonly BlockSection[],
	blockPages: readonly BlockPage[],
	sheets: readonly SheetGeometry[],
	rules: readonly (PageNumbering | null | undefined)[],
): BlockSection[] {
	const pageAt = new Map(blockPages.map((entry) => [entry.pos, entry.page]))
	/* Kontainer (daftar, kutipan) tidak tercatat sendiri: lembarnya lembar anak pertamanya. */
	const sheetOf = (pos: number): number | null =>
		pageAt.get(pos) ?? blockPages.find((entry) => entry.pos > pos)?.page ?? null

	const firstSheet = new Map<number, number>()
	for (const entry of entries) {
		const sheet = sheetOf(entry.pos)
		if (sheet !== null && !firstSheet.has(entry.section)) firstSheet.set(entry.section, sheet)
	}

	let any = false
	const result = entries.map((entry): BlockSection => {
		const rule = rules[entry.section]
		const sheet = sheetOf(entry.pos)
		if (!rule || sheet === null) return entry
		const opening =
			sheets[sheet]?.opensChapter === true &&
			rule.openingPosition !== undefined &&
			rule.openingPosition !== (rule.position ?? null)
		const first =
			typeof rule.restart === 'number' && rule.restart !== 1 && firstSheet.get(entry.section) === sheet
		const variant = first && opening ? 'fo' : first ? 'f' : opening ? 'o' : undefined
		if (!variant) return entry
		any = true
		return { ...entry, variant }
	})
	return any ? result : []
}

/*
 * Posisi blok terluar untuk dekorasi tingkat blok (margin section, label
 * section): anak kontainer yang diukur terpisah diteruskan ke kontainernya,
 * dan tiap kontainer hanya muncul sekali.
 */
function outerBlockPositions(blocks: readonly Measurement[]): number[] {
	const seen = new Set<number>()
	const positions: number[] = []
	for (const block of blocks) {
		if (block.kind !== 'block') continue
		const pos = block.container ?? block.pos
		if (seen.has(pos)) continue
		seen.add(pos)
		positions.push(pos)
	}
	return positions
}

function sameBlockSections(a: readonly BlockSection[], b: readonly BlockSection[]): boolean {
	return (
		a.length === b.length &&
		a.every(
			(entry, index) =>
				entry.pos === b[index].pos &&
				entry.section === b[index].section &&
				entry.variant === b[index].variant,
		)
	)
}

function sameSetups(a: readonly PageSetup[], b: readonly PageSetup[]): boolean {
	return (
		a.length === b.length && a.every((setup, index) => JSON.stringify(setup) === JSON.stringify(b[index]))
	)
}

function sameAdjustments(a: readonly MarginAdjustment[], b: readonly MarginAdjustment[]): boolean {
	return (
		a.length === b.length &&
		a.every((adjustment, index) => {
			const other = b[index]
			return (
				adjustment.pos === other.pos && adjustment.left === other.left && adjustment.right === other.right
			)
		})
	)
}

function buildDecorations(
	doc: PMNode,
	spacers: readonly Spacer[],
	adjustments: readonly MarginAdjustment[] = [],
	sections: readonly BlockSection[] = [],
	trailing?: PlacedNotes,
): DecorationSet {
	const decorations: Decoration[] = []
	for (const entry of sections) {
		const node = doc.nodeAt(entry.pos)
		if (!node) continue
		decorations.push(
			Decoration.node(entry.pos, entry.pos + node.nodeSize, {
				class: `document-section-${entry.section}${entry.variant ?? ''}`,
			}),
		)
	}
	for (const adjustment of adjustments) {
		const node = doc.nodeAt(adjustment.pos)
		if (!node) continue
		decorations.push(
			Decoration.node(adjustment.pos, adjustment.pos + node.nodeSize, {
				style: `margin-left:${adjustment.left}px;margin-right:${adjustment.right}px`,
			}),
		)
	}

	for (const spacer of spacers) {
		const key = `${spacer.pos}-${Math.round(spacer.height)}${notesKey(spacer.notes)}`

		if (spacer.kind === 'block') {
			decorations.push(
				Decoration.widget(spacer.pos, () => blockSpacer(spacer, doc), {
					side: spacer.notesOnly ? -2 : -1,
					key: `page-break-${key}`,
					...NOTES_WIDGET_SPEC,
				}),
			)
			continue
		}
		decorations.push(
			Decoration.widget(spacer.pos, () => rowSpacer(spacer, doc), {
				side: -2,
				key: `page-break-row-${key}`,
				...NOTES_WIDGET_SPEC,
			}),
		)

		if (spacer.headerPos !== undefined) {
			const header = doc.nodeAt(spacer.headerPos)
			if (header) {
				decorations.push(
					Decoration.widget(spacer.pos, () => repeatedHeader(header, spacer), {
						side: -1,
						key: `table-header-${key}`,
					}),
				)
			}
		}
	}

	if (trailing) {
		decorations.push(
			Decoration.widget(trailing.pos, () => trailingNotesElement(trailing, doc), {
				side: 1,
				key: `footnotes-end-${trailing.pos}${notesKey(trailing.notes)}`,
				...NOTES_WIDGET_SPEC,
			}),
		)
	}

	return DecorationSet.create(doc, decorations)
}

/*
 * Area catatan kaki hidup di dalam spacer, tapi bisa diklik (membuka editor
 * catatan) - ProseMirror tidak boleh menafsirkan klik itu sebagai klik naskah.
 */
const NOTES_WIDGET_SPEC = {
	stopEvent: (event: Event) => !!(event.target as HTMLElement | null)?.closest?.('.footnote-area'),
	ignoreSelection: true,
}

function notesKey(notes: PageNotes | undefined): string {
	if (!notes) return ''
	return `-n${notes.refs.join('.')}-${Math.round(notes.before)}-${Math.round(notes.height)}-${notes.signature ?? ''}`
}

function markSpacer(element: HTMLElement, spacer: Spacer): HTMLElement {
	element.setAttribute(SPACER_ATTRIBUTE, String(spacer.pos))
	element.contentEditable = 'false'
	// Spacer berisi catatan kaki tetap terbaca pembaca layar; pengisinya saja yang disembunyikan.
	if (!spacer.notes) element.setAttribute('aria-hidden', 'true')
	return element
}

/** Pengisi lalu area catatan: area duduk di dasar lembar yang ditutup spacer ini. */
function appendNotes(container: HTMLElement, notes: PageNotes, doc: PMNode): void {
	const filler = document.createElement('div')
	filler.className = 'footnote-filler'
	filler.setAttribute('aria-hidden', 'true')
	filler.style.height = `${notes.before}px`
	container.append(filler, renderFootnoteArea(doc, notes.refs))
}

function blockSpacer(spacer: Spacer, doc?: PMNode): HTMLElement {
	const element = document.createElement('div')
	element.className = 'page-break-spacer'
	element.style.height = `${spacer.height}px`
	if (spacer.notes && doc) {
		element.classList.add('page-break-spacer--notes')
		if (spacer.notesOnly) element.classList.add('page-break-spacer--notes-only')
		appendNotes(element, spacer.notes, doc)
	}
	return markSpacer(element, spacer)
}

export function rowSpacer(spacer: Spacer, doc?: PMNode): HTMLElement {
	const row = document.createElement('tr')
	row.className = 'page-break-row'
	row.style.height = `${spacer.height}px`

	const cell = document.createElement('td')
	cell.colSpan = spacer.columns ?? 1
	row.appendChild(cell)
	if (spacer.notes && doc) {
		row.classList.add('page-break-row--notes')
		appendNotes(cell, spacer.notes, doc)
	}

	return markSpacer(row, spacer)
}

function trailingNotesElement(trailing: PlacedNotes, doc: PMNode): HTMLElement {
	const element = document.createElement('div')
	element.className = 'page-break-spacer page-break-spacer--notes footnote-trailing'
	element.setAttribute(SPACER_ATTRIBUTE, String(trailing.pos))
	element.contentEditable = 'false'
	appendNotes(element, trailing.notes, doc)
	return element
}

/** Batas blok teratas sesudah posisi `pos` - tempat area catatan lembar terakhir. */
function topLevelEnd(doc: PMNode, pos: number): number {
	const $pos = doc.resolve(pos)
	if ($pos.depth > 0) return $pos.after(1)
	return pos + (doc.nodeAt(pos)?.nodeSize ?? 0)
}

/*
 * Salinan header dirakit oleh serializer skema, bukan disusun tangan dari teks
 * tiap sel. Perakitan tangan menjatuhkan colspan - sehingga kolom salinannya
 * melenceng dari tabel aslinya - berikut rowspan, warna sel, dan seluruh format
 * teks. Ia juga melewatkan <p> di dalam sel, jadi tingginya tidak pernah sama
 * dengan tinggi header yang sudah dipesan `computeSpacers`.
 */
export function repeatedHeader(header: PMNode, spacer: Spacer): HTMLElement {
	const row = DOMSerializer.fromSchema(header.type.schema).serializeNode(header) as HTMLElement
	row.classList.add('table-header-repeat')

	/*
	 * Salinan judul selalu satu baris.
	 *
	 * Judul dua baris - "No | Kegiatan | Bulan ke-1…" di atas baris berisi
	 * nomor minggu - menyimpan `rowspan="2"` pada sel kolom pertamanya. Kalau
	 * atribut itu ikut tersalin, salinannya mengklaim baris data pertama di
	 * halaman lanjutan: dua kolom awal tampil sebagai blok kosong dan seluruh
	 * sel baris itu bergeser, sehingga teksnya terjepit di kolom selebar 25px
	 * dan membungkus satu huruf per baris.
	 */
	for (const cell of row.querySelectorAll<HTMLElement>('th, td')) cell.removeAttribute('rowspan')

	return markSpacer(row, spacer)
}

export const Pagination = Extension.create<PaginationOptions>({
	name: 'pagination',

	addOptions() {
		return { geometry: pageGeometry() }
	},

	addProseMirrorPlugins() {
		const { geometry, onPageCountChange, onSheetsChange, onSectionsChange } = this.options

		return [
			new Plugin<PaginationState>({
				key: paginationKey,

				state: {
					init: () => ({
						spacers: [],
						decorations: DecorationSet.empty,
						pageCount: 1,
						geometry,
						setup: this.options.setup,
						sheets: [],
						marginAdjustments: [],
						blockPages: [],
						blockSections: [],
						pageless: this.options.pageless ?? false,
						breakBeforeLevels: this.options.breakBeforeLevels ?? [],
						trailing: undefined,
					}),

					apply(tr, current, _old, newState) {
						const incoming = tr.getMeta(paginationKey) as PaginationMeta | undefined

						if (incoming) {
							if (incoming.pageless !== undefined && incoming.pageless !== current.pageless) {
								return {
									...current,
									pageless: incoming.pageless,
									geometry: incoming.geometry ?? current.geometry,
									setup: incoming.setup ?? current.setup,
									breakBeforeLevels: incoming.breakBeforeLevels ?? current.breakBeforeLevels,
									spacers: incoming.pageless ? [] : current.spacers,
									trailing: incoming.pageless ? undefined : current.trailing,
									decorations: incoming.pageless ? DecorationSet.empty : current.decorations,
								}
							}
							if (!incoming.spacers) {
								return {
									...current,
									geometry: incoming.geometry ?? current.geometry,
									setup: incoming.setup ?? current.setup,
									breakBeforeLevels: incoming.breakBeforeLevels ?? current.breakBeforeLevels,
								}
							}

							return {
								breakBeforeLevels: incoming.breakBeforeLevels ?? current.breakBeforeLevels,
								geometry: incoming.geometry ?? current.geometry,
								setup: incoming.setup ?? current.setup,
								pageless: current.pageless,
								spacers: incoming.spacers,
								pageCount: incoming.pageCount ?? current.pageCount,
								sheets: incoming.sheets ?? current.sheets,
								marginAdjustments: incoming.marginAdjustments ?? current.marginAdjustments,
								blockPages: incoming.blockPages ?? current.blockPages,
								blockSections: incoming.blockSections ?? current.blockSections,
								trailing:
									incoming.trailing === undefined ? current.trailing : (incoming.trailing ?? undefined),
								decorations: buildDecorations(
									newState.doc,
									incoming.spacers,
									incoming.marginAdjustments ?? current.marginAdjustments,
									incoming.blockSections ?? current.blockSections,
									incoming.trailing === undefined ? current.trailing : (incoming.trailing ?? undefined),
								),
							}
						}
						if (tr.docChanged) {
							return { ...current, decorations: current.decorations.map(tr.mapping, tr.doc) }
						}
						return current
					},
				},

				props: {
					decorations: (state) => paginationKey.getState(state)?.decorations,
				},

				view(view) {
					let frame = 0
					let reportedPageCount = 0
					let reportedPrintSetups: PageSetup[] = []

					const recalculate = () => {
						frame = 0
						const state = paginationKey.getState(view.state)
						if (!state) return
						if (state.pageless) {
							/* Tanpa lembar, catatan kaki dikumpulkan di akhir naskah (seperti Google
							 * Docs tanpa halaman). */
							const refs = footnoteRefPositions(view.state.doc)
							const trailing: PlacedNotes | undefined =
								refs.length > 0
									? {
											pos: view.state.doc.content.size,
											notes: { refs, height: 0, before: 0, signature: notesSignature(view.state.doc, refs) },
										}
									: undefined
							if (
								state.spacers.length > 0 ||
								state.pageCount !== 1 ||
								!samePlacedNotes(trailing, state.trailing)
							) {
								const transaction = view.state.tr.setMeta(paginationKey, {
									spacers: [],
									pageCount: 1,
									trailing: trailing ?? null,
								})
								transaction.setMeta('addToHistory', false)
								view.dispatch(transaction)
							}
							if (reportedPageCount !== 1) {
								reportedPageCount = 1
								onPageCountChange?.(1)
							}
							return
						}

						const blocks = measureBlocks(view)
						const footnoteSizes = measureFootnotes(view)
						if (footnoteSizes) assignFootnotes(blocks, footnoteRefPositions(view.state.doc))
						const spans = state.setup ? sectionSpans(view.state.doc, state.setup) : []

						const continuous = sectionContinuity(view.state.doc, spans)
						const sections = spans.slice(1).map((span, index) => ({
							pos: span.pos,
							geometry: pageGeometry(span.setup),
							continuous: continuous[index + 1],
							index: index + 1,
							pageNumbering: span.setup.pageNumbering ?? null,
						}))
						const { spacers, pageCount, sheets, blockPages, trailingNotes } = computeSpacers(
							blocks,
							state.geometry,
							sections,
							state.setup?.pageNumbering ?? null,
							footnoteSizes,
						)
						/* Tanda tangan isi catatan: area digambar ulang saat isinya berubah
						 * walau tata letaknya tetap. */
						for (const spacer of spacers) {
							if (spacer.notes) spacer.notes.signature = notesSignature(view.state.doc, spacer.notes.refs)
						}
						const trailing: PlacedNotes | undefined = trailingNotes
							? {
									pos: topLevelEnd(view.state.doc, trailingNotes.afterPos),
									notes: {
										refs: trailingNotes.refs,
										height: trailingNotes.height,
										before: trailingNotes.before,
										signature: notesSignature(view.state.doc, trailingNotes.refs),
									},
								}
							: undefined
						/*
						 * Dekorasi lebar section dan label section ditempelkan ke blok
						 * terluar. Anak kontainer yang diukur terpisah (SPLIT_CONTAINERS)
						 * meneruskan ke posisi kontainernya - kalau tidak, tiap anak
						 * list di dalam section sempit ikut digeser dan hasilnya
						 * bertumpuk dengan geseran kontainernya sendiri.
						 */
						const targets = outerBlockPositions(blocks)
						const adjustments = state.setup
							? marginAdjustments(
									targets,
									spans.map((span) => ({
										pos: span.pos,
										width: pageGeometry(span.setup).width,
										margins: span.setup.margins,
									})),
									Math.max(...sheets.map((sheet) => sheet.width)),
									state.geometry.margins,
								)
							: []
						const { setups: printSetups, entries: pageNames } = printPageNames(
							spans,
							continuous,
							targets,
							blockPages,
						)
						const named = blockSections(targets, pageNames)
						const varied = withPrintVariants(
							named,
							blockPages,
							sheets,
							printSetups.map((setup) => setup.pageNumbering),
						)
						const pageBreaking = new Set(
							spans.slice(1).flatMap((span, index) => (continuous[index + 1] ? [] : [span.pos])),
						)
						const sectionsOfBlocks = breaksKeepPreviousName(
							varied.length > 0 ? varied : spans.length > 1 ? named : [],
							pageBreaking,
						)
						if (
							!sameSpacers(spacers, state.spacers) ||
							pageCount !== state.pageCount ||
							!sameAdjustments(adjustments, state.marginAdjustments) ||
							!sameBlockPages(blockPages, state.blockPages) ||
							!sameBlockSections(sectionsOfBlocks, state.blockSections) ||
							!samePlacedNotes(trailing, state.trailing) ||
							/* Penomoran yang berganti tanpa menggeser apa pun (desimal → romawi)
							 * tetap harus sampai ke state: daftar isi membaca nomornya dari sini. */
							!sameSheets(sheets, state.sheets)
						) {
							const transaction = view.state.tr.setMeta(paginationKey, {
								spacers,
								pageCount,
								sheets,
								marginAdjustments: adjustments,
								blockPages,
								blockSections: sectionsOfBlocks,
								trailing: trailing ?? null,
							})
							transaction.setMeta('addToHistory', false)
							view.dispatch(transaction)
						}

						if (pageCount !== reportedPageCount) {
							reportedPageCount = pageCount
							onPageCountChange?.(pageCount)
						}

						if (!sameSheets(sheets, state.sheets)) {
							onSheetsChange?.(sheets)
						}
						if (!sameSetups(printSetups, reportedPrintSetups)) {
							reportedPrintSetups = printSetups
							onSectionsChange?.(printSetups)
						}
					}

					const schedule = () => {
						if (frame) return
						frame = requestAnimationFrame(recalculate)
					}

					schedule()
					const observer = new ResizeObserver(schedule)
					observer.observe(view.dom)
					/* Di kertas peramban yang memenggal tabel; kepala tabel diulang lewat
					 * `<thead>` cetak (TBL-8), padanan `table-header-repeat` di kanvas. */
					const detachPrintHeaders = attachTablePrintHeaders(view)

					return {
						update: (_updatedView, previous) => {
							const before = paginationKey.getState(previous)
							const after = paginationKey.getState(view.state)
							if (!previous.doc.eq(view.state.doc) || before?.geometry !== after?.geometry) {
								schedule()
							}
						},
						destroy: () => {
							if (frame) cancelAnimationFrame(frame)
							observer.disconnect()
							detachPrintHeaders()
						},
					}
				},
			}),
		]
	},
})
