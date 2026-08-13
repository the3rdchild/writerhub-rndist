import { Extension } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view'
import { PAGE_BREAK_NODE } from './page-break'
import {
	PAGE_GAP,
	type PageGeometry,
	pageGeometry,
	type PageSetup,
	type SheetGeometry,
} from './page-geometry'
import { SECTION_BREAK_NODE, sectionSpans } from './section-break'

export const paginationKey = new PluginKey<PaginationState>('pagination')

/**
 * Bentuk spacer mengikuti tempatnya disisipkan.
 *
 * Di antara blok biasa sebuah `<div>` sudah cukup. Di dalam tabel tidak: `<div>`
 * bukan anak yang sah dari `<tbody>`, dan browser akan melemparnya keluar dari
 * tabel. Karena itu pemenggalan di dalam tabel memakai baris kosong tanpa
 * border - yang kebetulan juga menghasilkan potongan paling bersih, sebab tidak
 * ada garis tabel yang ikut tergambar menembus celah antar lembar.
 */
export type SpacerKind = 'block' | 'row'

export interface Spacer {
	/** Posisi ProseMirror dari blok atau baris yang didorong ke halaman berikutnya. */
	pos: number
	height: number
	kind: SpacerKind
	/** Baris tabel: jumlah kolom yang harus direntang baris kosongnya. */
	columns?: number
	/** Baris tabel: posisi baris header yang digambar ulang di lembar baru. */
	headerPos?: number
}

export interface Measurement {
	/** Tempat spacer disisipkan bila unit ini harus turun satu lembar. */
	pos: number
	top: number
	bottom: number
	/** Blok ini adalah pemenggalan halaman yang disisipkan penulis. */
	isBreak: boolean
	/**
	 * Blok ini adalah pembatas section (§P8&P9): blok SESUDAHNYA memulai lembar
	 * baru dengan geometri baru. Node-nya sendiri tinggal di lembar berjalan
	 * sebagai penanda tipis.
	 */
	isSectionBreak?: boolean
	kind: SpacerKind
	columns?: number
	headerPos?: number
	/** Tinggi header ulangan, kalau baris ini akan didahului salinannya. */
	headerHeight?: number
	/**
	 * Blok yang memenggal dirinya sendiri (mis. blok TOC): node view-nya
	 * menyisipkan celah internal di batas lembar, jadi plugin tidak boleh
	 * mendorongnya utuh saat meluber. `bottom`-nya sudah termasuk tinggi
	 * celah internal tersebut.
	 */
	selfPaginate?: boolean
	/**
	 * Total celah internal blok self-paginate - ruang mati antar lembar yang ia
	 * lompati. Ikut ke kumulatif supaya blok-blok sesudahnya tetap terbaca di
	 * kerangka koordinat alami yang sama.
	 */
	internal?: number
}

interface PaginationState {
	spacers: Spacer[]
	decorations: DecorationSet
	pageCount: number
	/**
	 * Geometri disimpan di state plugin, bukan sekadar dibaca dari opsi, karena
	 * daftar ekstensi hanya dibuat sekali sementara margin bisa diseret kapan
	 * saja lewat penggaris. Perubahannya dikirim sebagai meta transaksi.
	 */
	geometry: PageGeometry
	/** Setelan dasar untuk mewarisi section; undefined = tanpa section (§P8&P9). */
	setup?: PageSetup
	/** Lembar-lembar hasil perhitungan terakhir, dibaca kanvas sebagai latar. */
	sheets: SheetGeometry[]
	/** Penyesuaian margin horizontal per blok, dari section-nya (§P8&P9). */
	marginAdjustments: MarginAdjustment[]
	/** true = kanvas menerus; pemenggalan halaman dimatikan (§A1.5). */
	pageless: boolean
}

export interface PaginationOptions {
	geometry: PageGeometry
	/** Setelan halaman dasar; mengaktifkan pembacaan `sectionBreak` (§P8&P9). */
	setup?: PageSetup
	onPageCountChange?: (pageCount: number) => void
	/** Dipanggil bila daftar lembar berubah - kanvas menggambar ulang latar. */
	onSheetsChange?: (sheets: SheetGeometry[]) => void
	/** true = mode pageless; plugin jadi no-op (tanpa spacer). */
	pageless?: boolean
}

/** Meta untuk memberi tahu plugin bahwa ukuran lembar atau margin berubah. */
export interface PaginationMeta {
	spacers?: Spacer[]
	pageCount?: number
	sheets?: SheetGeometry[]
	marginAdjustments?: MarginAdjustment[]
	geometry?: PageGeometry
	setup?: PageSetup
	pageless?: boolean
}

/**
 * Ukur tiap blok tingkat atas pada koordinat "alami" - posisi seandainya tidak
 * ada spacer sama sekali.
 *
 * Ini kunci agar perhitungan stabil. Mengukur `offsetTop` apa adanya membuat
 * hasilnya bergantung pada spacer yang baru saja disisipkan, sehingga
 * perhitungan berikutnya berbeda lagi dan editor terjebak reflow tanpa henti.
 * Karena tinggi tiap spacer kita sendiri yang menentukan, posisi alami bisa
 * dipulihkan dengan mengurangi total spacer yang mendahuluinya - dan
 * penggabungan margin antar blok tetap terhitung benar.
 */
function measureBlocks(view: EditorView): Measurement[] {
	const inserted = insertedHeights(view)
	const measurements: Measurement[] = []
	let cumulative = 0

	view.state.doc.forEach((node, offset) => {
		cumulative += inserted.get(offset) ?? 0

		const dom = view.nodeDOM(offset)
		if (!(dom instanceof HTMLElement)) return

		// offsetTop/offsetHeight adalah nilai layout, tidak terpengaruh transform,
		// jadi hasilnya sama berapa pun tingkat zoom yang sedang dipakai.
		const top = dom.offsetTop - cumulative

		if (node.type.name === 'table') {
			cumulative = measureTable(view, node, offset, top, dom, cumulative, inserted, measurements)
			return
		}

		if (dom.hasAttribute(SELF_PAGINATE_ATTRIBUTE)) {
			// Blok yang memenggal dirinya sendiri: celah internalnya menambah tinggi
			// DOM blok, jadi ia harus ikut dalam kumulatif supaya koordinat alami
			// blok sesudahnya tetap tepat. Ia dijumlahkan SESUDAH top dihitung -
			// celah itu berada di dalam blok, bukan sebelumnya.
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
			return
		}

		measurements.push({
			pos: offset,
			top,
			bottom: top + dom.offsetHeight,
			isBreak: node.type.name === PAGE_BREAK_NODE,
			isSectionBreak: node.type.name === SECTION_BREAK_NODE || undefined,
			kind: 'block',
		})
	})

	return measurements
}

/**
 * Ukur tabel per baris, bukan sebagai satu blok utuh.
 *
 * Tabel panjang hampir selalu lebih tinggi dari satu lembar; kalau ia hanya
 * bisa didorong utuh, batas lembar pasti memotongnya di tengah. Dengan tiap
 * baris jadi satuan tersendiri, pemenggalan bisa jatuh di antara baris.
 *
 * Baris pertama sengaja tidak jadi satuan sendiri: mendorongnya berarti
 * mendorong seluruh tabel, jadi yang dicatat adalah posisi tabelnya.
 */
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
	// Header hanya diulang kalau baris pertamanya memang baris header, dan
	// penulis tidak mematikannya untuk tabel ini.
	const hasHeader = headerRow?.firstChild?.type.name === 'tableHeader'
	const repeat = hasHeader && table.attrs.repeatHeader !== false
	const columns = headerRow?.childCount ?? 1
	const headerPos = repeat ? tablePos + 1 : undefined

	let headerHeight = 0
	let isFirstRow = true

	table.forEach((_row, rowOffset) => {
		const rowPos = tablePos + 1 + rowOffset
		cumulative += inserted.get(rowPos) ?? 0

		const rowDom = view.nodeDOM(rowPos)
		if (!(rowDom instanceof HTMLElement)) return

		// offsetParent sebuah <tr> adalah tabelnya sendiri, bukan akar editor,
		// jadi posisinya dijumlahkan dulu supaya sepatokan dengan blok lain.
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

/** Penanda pada tiap elemen sisipan, supaya tingginya bisa dibaca balik dari DOM. */
export const SPACER_ATTRIBUTE = 'data-spacer-for'

/**
 * Penanda blok yang memenggal dirinya sendiri (blok TOC). Node view-nya
 * menyisipkan celah internal tepat di batas lembar; plugin hanya perlu
 * menghitung tinggi celah itu, bukan mendorong bloknya utuh.
 */
export const SELF_PAGINATE_ATTRIBUTE = 'data-self-paginate'

/**
 * Tinggi yang benar-benar tersisip di tiap posisi, dibaca dari DOM.
 *
 * Tinggi baris kosong kita yang menentukan, tapi tinggi header ulangan
 * ditentukan isinya sendiri. Membacanya balik dari DOM membuat koordinat alami
 * tetap tepat tanpa perlu menebak setinggi apa salinan itu jadinya.
 *
 * Celah internal blok self-paginate sengaja dilewati di sini: ia tidak duduk di
 * posisi dokumen mana pun, melainkan di dalam DOM node view, dan dihitung
 * per-blok oleh measureBlocks.
 */
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

/** Geometri sebuah section yang dimulai oleh `sectionBreak` di posisi ini. */
export interface SectionGeometry {
	pos: number
	geometry: PageGeometry
}

/**
 * Tentukan di mana halaman dipenggal - murni aritmetika atas hasil pengukuran.
 *
 * Diekspor demi pengujian: masuk daftar blok, keluar daftar spacer, tanpa DOM
 * sama sekali. Aritmetika inilah yang paling sering salah, dan gejalanya baru
 * kelihatan setelah dokumen panjang dibuka.
 *
 * Tanpa section (`sections` kosong) seluruh lembar memakai satu `geometry` -
 * perilaku lama, tidak berubah. Dengan section, tiap lembar pada daftar
 * `sheets` yang dikembalikan boleh punya geometri sendiri (§P8&P9): lembar
 * baru yang dibuka sesudah `sectionBreak` memakai geometri section-nya, dan
 * puncak kertasnya tidak lagi kelipatan satu `pageStride`.
 *
 * Kerangka koordinat: `top`/`bottom` blok adalah koordinat "alami" (tanpa
 * spacer) pada bingkai isi editor - yang di kanvas bergeser sejauh padding
 * pembungkus (`geometry.margins` dasar). `sheets[n].top` adalah puncak KERTAS
 * pada bingkai yang sama, jadi puncak area teks lembar n adalah
 * `sheets[n].top + sheets[n].margins.top - margins.top` (lihat `contentTop`).
 */
export function computeSpacers(
	blocks: readonly Measurement[],
	geometry: PageGeometry,
	sections: readonly SectionGeometry[] = [],
): { spacers: Spacer[]; pageCount: number; sheets: SheetGeometry[] } {
	const spacers: Spacer[] = []
	/** Total tinggi spacer yang sudah disisipkan sebelum blok berjalan. */
	let cumulative = 0
	let pageStart = 0
	/** Blok ini wajib mulai di lembar baru, apa pun sisa ruangnya. */
	let forceNext = false
	/** Geometri lembar berikutnya, diwariskan oleh sectionBreak terakhir. */
	let pendingGeometry: PageGeometry | null = null

	const baseMargins = geometry.margins
	/** Lembar-lembar yang sudah pasti; lembar pertama selalu geometri dasar. */
	const sheets: SheetGeometry[] = [{ ...geometry, index: 0, top: 0 }]
	/** Puncak area teks lembar pada bingkai isi editor (setara `n * pageStride` dulu). */
	const contentTop = (sheet: SheetGeometry) => sheet.top + sheet.margins.top - baseMargins.top

	/** Buka lembar baru tepat di bawah lembar terakhir; geometri pending menang. */
	const pushSheet = (): SheetGeometry => {
		const last = sheets[sheets.length - 1]
		const next: SheetGeometry = {
			...(pendingGeometry ?? last),
			index: sheets.length,
			top: last.top + last.height + PAGE_GAP,
		}
		sheets.push(next)
		pendingGeometry = null
		return next
	}

	for (const block of blocks) {
		if (block.isSectionBreak) {
			// Blok sesudah pembatas section memulai lembar baru dengan geometri
			// section-nya; pembatasnya sendiri tinggal di lembar berjalan.
			forceNext = true
			pendingGeometry = sections.find((section) => section.pos === block.pos)?.geometry ?? null
			continue
		}

		const sheet = sheets[sheets.length - 1]
		const isFirstOnPage = block.top <= pageStart + 0.5
		const overflows = block.bottom > pageStart + sheet.contentHeight

		if (block.selfPaginate) {
			// Blok yang memenggal dirinya sendiri (blok TOC): jangan didorong utuh
			// saat meluber - node view-nya menyisipkan celah internal tepat di batas
			// lembar, dan blok sesudahnya mengalir tepat di bawah segmen terakhir.
			// Page break manual sebelumnya tetap dihormati seperti blok biasa.
			if (forceNext && !isFirstOnPage) {
				const target = contentTop(pushSheet())
				const spacerHeight = Math.max(0, target - (block.top + cumulative))
				spacers.push({ pos: block.pos, height: spacerHeight, kind: block.kind })
				cumulative += spacerHeight
			}

			// bottom blok ini sudah termasuk celah internalnya, jadi renderedBottom
			// adalah ujung segmen terakhir yang sebenarnya. Lembar yang ia habiskan
			// dihitung darinya, lalu pageStart digeser ke lembar itu supaya blok
			// berikutnya mengalir di bawah segmen terakhir, bukan di lembar baru.
			const canvasBottom = block.bottom + cumulative + baseMargins.top
			while (nextContentTop() < canvasBottom - 0.5) pushSheet()

			// Celah internalnya ikut ke kumulatif: measureBlocks mengurangkannya dari
			// koordinat alami blok-blok sesudahnya, jadi tanpa ini sisa dokumen
			// dihitung dalam kerangka koordinat yang berbeda dari pageStart.
			cumulative += block.internal ?? 0
			// pageStart hidup di koordinat alami sedangkan garis lembar di koordinat
			// render; selisih keduanya persis sebanyak yang sudah tersisip.
			pageStart = contentTop(sheets[sheets.length - 1]) - cumulative

			forceNext = false
			continue
		}

		if ((overflows || forceNext) && !isFirstOnPage) {
			// Tinggi spacer dihitung dari sasaran mutlaknya - awal lembar
			// berikutnya - bukan dari sisa ruang halaman berjalan. Selama tidak ada
			// blok yang meluber hasil keduanya sama persis; bedanya baru muncul
			// sesudahnya, dan hanya cara ini yang mengembalikan blok ke garis lembar.
			const target = contentTop(pushSheet())
			const spacerHeight = Math.max(0, target - (block.top + cumulative))
			// Header ulangan ikut memakan ruang di puncak lembar baru, jadi ia
			// dihitung sebagai bagian dari sisipan - dan halaman ini menyisakan
			// ruang tulis sebanyak itu lebih sedikit.
			const headerHeight = block.headerHeight ?? 0

			spacers.push({
				pos: block.pos,
				height: spacerHeight,
				kind: block.kind,
				columns: block.columns,
				headerPos: headerHeight > 0 ? block.headerPos : undefined,
			})
			cumulative += spacerHeight + headerHeight
			pageStart = block.top - headerHeight
		}

		forceNext = block.isBreak

		// Blok yang sendirian saja lebih tinggi dari satu halaman tidak bisa
		// dipenggal tanpa memecah node, jadi ia dibiarkan meluber.
		//
		// Berapa lembar yang ia habiskan dihitung dari posisi rendernya, bukan
		// dari tinggi area teks: isinya mengalir menembus margin bawah dan celah
		// antar lembar alih-alih dipenggal di situ, sehingga satu lembar menampung
		// pageStride piksel isinya - bukan contentHeight. Menghitungnya dengan
		// contentHeight membuat lembar kosong bermunculan di ujung blok panjang.
		// Daftar lembar dipanjangkan sampai ujung blok termuat; lembar-lembar
		// baru itu mewarisi geometri lembar berjalan (bukan section berikutnya -
		// luberan bukan pembatas section).
		const canvasBottom = block.bottom + cumulative + baseMargins.top
		const before = sheets.length
		while (nextContentTop() < canvasBottom - 0.5) pushSheet()

		if (sheets.length > before) {
			// Ia sudah menembus batas lembarnya sendiri, jadi blok sesudahnya wajib
			// mulai dari lembar baru. Tanpa paksaan ini, margin dan celah yang
			// dilewatinya jadi utang yang tidak pernah dibayar dan seluruh sisa
			// dokumen ikut melenceng.
			forceNext = true
		}
	}

	// Page break di baris terakhir tetap membuka lembar baru, walau masih kosong -
	// itu justru yang diminta penulis saat menaruhnya di ujung dokumen. Blok
	// raksasa di baris terakhir tidak dihitung begitu: halamannya sudah dihitung
	// oleh perulangan di atas.
	if (blocks[blocks.length - 1]?.isBreak) pushSheet()

	return { spacers, pageCount: sheets.length, sheets }

	/** Puncak area teks lembar berikutnya (bila dibuka sekarang), pada kanvas. */
	function nextContentTop(): number {
		const last = sheets[sheets.length - 1]
		return last.top + last.height + PAGE_GAP + (pendingGeometry ?? last).margins.top
	}
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
				Math.abs(spacer.height - other.height) < 1
			)
		})
	)
}

/** Daftar lembar dianggap sama bila jumlah, puncak, dan ukurannya berurutan sama. */
function sameSheets(a: readonly SheetGeometry[], b: readonly SheetGeometry[]): boolean {
	return (
		a.length === b.length &&
		a.every((sheet, index) => {
			const other = b[index]
			return sheet.top === other.top && sheet.width === other.width && sheet.height === other.height
		})
	)
}

/** Penyesuaian margin horizontal satu blok, akibat section-nya berbeda dari dasar. */
export interface MarginAdjustment {
	pos: number
	left: number
	right: number
}

/**
 * Margin horizontal tiap blok tingkat atas pada dokumen multi-section (§P8&P9).
 *
 * Padding pembungkus editor hanya bisa satu nilai (milik section dasar), jadi
 * blok pada section lain digeser lewat dekorasi margin: lembar yang lebih
 * sempit dari kanvas dipusatkan, dan margin section-nya menggantikan margin
 * dasar. Horizontal saja - penyesuaian vertikal sudah tertangani oleh spacer,
 * dan margin vertikal dekorasi akan ikut terukur sebagai tinggi blok (putaran
 * umpan balik). Murni aritmetika; diekspor demi pengujian.
 */
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

function sameAdjustments(a: readonly MarginAdjustment[], b: readonly MarginAdjustment[]): boolean {
	return (
		a.length === b.length &&
		a.every((adjustment, index) => {
			const other = b[index]
			return adjustment.pos === other.pos && adjustment.left === other.left && adjustment.right === other.right
		})
	)
}

function buildDecorations(
	doc: PMNode,
	spacers: readonly Spacer[],
	adjustments: readonly MarginAdjustment[] = [],
): DecorationSet {
	const decorations: Decoration[] = []

	// Geser margin horizontal blok pada section yang berbeda dari dasar (§P8&P9).
	// Hanya margin: kelas dan properti lain milik dekorasi lain tidak diusik.
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
		const key = `${spacer.pos}-${Math.round(spacer.height)}`

		if (spacer.kind === 'block') {
			decorations.push(
				Decoration.widget(spacer.pos, () => blockSpacer(spacer), {
					side: -1,
					key: `page-break-${key}`,
				}),
			)
			continue
		}

		// side -2 memastikan baris kosong berada di atas salinan header, bukan
		// sebaliknya: yang pertama menutup lembar lama, yang kedua membuka lembar baru.
		decorations.push(
			Decoration.widget(spacer.pos, () => rowSpacer(spacer), {
				side: -2,
				key: `page-break-row-${key}`,
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

	return DecorationSet.create(doc, decorations)
}

function markSpacer(element: HTMLElement, spacer: Spacer): HTMLElement {
	element.setAttribute(SPACER_ATTRIBUTE, String(spacer.pos))
	element.setAttribute('aria-hidden', 'true')
	element.contentEditable = 'false'
	return element
}

function blockSpacer(spacer: Spacer): HTMLElement {
	const element = document.createElement('div')
	element.className = 'page-break-spacer'
	element.style.height = `${spacer.height}px`
	return markSpacer(element, spacer)
}

/** Baris kosong tanpa border - pemenggalan di dalam tabel. */
export function rowSpacer(spacer: Spacer): HTMLElement {
	const row = document.createElement('tr')
	row.className = 'page-break-row'
	row.style.height = `${spacer.height}px`

	const cell = document.createElement('td')
	cell.colSpan = spacer.columns ?? 1
	row.appendChild(cell)

	return markSpacer(row, spacer)
}

/**
 * Salinan baris header di puncak lembar lanjutan.
 *
 * Digambar sebagai dekorasi, bukan disisipkan ke dokumen: ia tidak boleh ikut
 * tersimpan, tidak boleh terbawa saat disalin, dan tidak boleh menggeser
 * pemetaan offset yang dipakai sorotan grammar. Isinya teks saja - tujuannya
 * mengingatkan nama kolom, bukan jadi tempat menyunting.
 */
export function repeatedHeader(header: PMNode, spacer: Spacer): HTMLElement {
	const row = document.createElement('tr')
	row.className = 'table-header-repeat'

	header.forEach((cell) => {
		const th = document.createElement('th')
		th.textContent = cell.textContent
		row.appendChild(th)
	})

	return markSpacer(row, spacer)
}

/**
 * Menyisipkan jarak sehingga teks tidak pernah terpotong batas lembar.
 *
 * Dikerjakan lewat dekorasi, bukan node dokumen, agar pemenggalan halaman tidak
 * ikut tersimpan sebagai isi draf dan tidak mengganggu pemetaan offset yang
 * dipakai sorotan grammar.
 *
 * Tabel diukur per baris, jadi ia boleh lebih tinggi dari satu lembar tanpa
 * ikut menyeberang. Blok kode menempuh jalan lain: tingginya dibatasi setinggi
 * area teks dan sisanya digulung di dalam bloknya sendiri (lihat
 * `--code-block-max-height` di globals.css), jadi ia selalu muat di satu lembar
 * dan cukup didorong utuh seperti blok biasa.
 *
 * Jalan ketiga adalah blok bertanda `data-self-paginate` (blok TOC): node
 * view-nya sendiri yang menyisipkan celah tepat di batas lembar. Plugin tidak
 * mendorongnya utuh; ia cukup menghitung tinggi celah internal itu supaya blok
 * sesudahnya mengalir tepat di bawah segmen terakhir.
 *
 * Batasan yang diketahui: satu blok yang lebih tinggi dari satu halaman penuh -
 * baris tabel raksasa, gambar sehalaman - tetap meluber melewati batas lembar;
 * memecahnya butuh membelah node, bukan sekadar memberi jarak.
 */
export const Pagination = Extension.create<PaginationOptions>({
	name: 'pagination',

	addOptions() {
		return { geometry: pageGeometry() }
	},

	addProseMirrorPlugins() {
		const { geometry, onPageCountChange, onSheetsChange } = this.options

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
						pageless: this.options.pageless ?? false,
					}),

					apply(tr, current, _old, newState) {
						const incoming = tr.getMeta(paginationKey) as PaginationMeta | undefined

						if (incoming) {
							// Toggle pageless: simpan nilainya, dan kosongkan spacer saat nyala.
							if (incoming.pageless !== undefined && incoming.pageless !== current.pageless) {
								return {
									...current,
									pageless: incoming.pageless,
									geometry: incoming.geometry ?? current.geometry,
									setup: incoming.setup ?? current.setup,
									spacers: incoming.pageless ? [] : current.spacers,
									decorations: incoming.pageless ? DecorationSet.empty : current.decorations,
								}
							}

							// Geometri baru saja tersimpan; spacer-nya menyusul dari
							// pengukuran berikutnya yang dipicu oleh view.update.
							if (!incoming.spacers) {
								return {
									...current,
									geometry: incoming.geometry ?? current.geometry,
									setup: incoming.setup ?? current.setup,
								}
							}

							return {
								geometry: incoming.geometry ?? current.geometry,
								setup: incoming.setup ?? current.setup,
								pageless: current.pageless,
								spacers: incoming.spacers,
								pageCount: incoming.pageCount ?? current.pageCount,
								sheets: incoming.sheets ?? current.sheets,
								marginAdjustments: incoming.marginAdjustments ?? current.marginAdjustments,
								decorations: buildDecorations(
									newState.doc,
									incoming.spacers,
									incoming.marginAdjustments ?? current.marginAdjustments,
								),
							}
						}

						// Dekorasi lama dipetakan ke dokumen baru supaya tidak berkedip
						// selama menunggu pengukuran berikutnya.
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

					const recalculate = () => {
						frame = 0
						const state = paginationKey.getState(view.state)
						if (!state) return

						// Pageless: kanvas menerus, tidak ada pemenggalan (§A1.5).
						if (state.pageless) {
							if (state.spacers.length > 0 || state.pageCount !== 1) {
								const transaction = view.state.tr.setMeta(paginationKey, { spacers: [], pageCount: 1 })
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
						// Section dari pembatas yang ada di dokumen; tanpa `setup`
						// dasar tidak ada cara mewarisi setelannya, jadi dimatikan.
						const spans = state.setup ? sectionSpans(view.state.doc, state.setup) : []
						const sections = spans
							.slice(1)
							.map((span) => ({ pos: span.pos, geometry: pageGeometry(span.setup) }))
						const { spacers, pageCount, sheets } = computeSpacers(blocks, state.geometry, sections)

						// Margin horizontal per blok, dari lebar dan margin section-nya.
						const adjustments = state.setup
							? marginAdjustments(
									// Hanya blok tingkat atas: satuan baris tabel bukan
									// blok dan margin pada <tr> tidak berarti apa-apa.
									blocks.filter((block) => block.kind === 'block').map((block) => block.pos),
									spans.map((span) => ({
										pos: span.pos,
										width: pageGeometry(span.setup).width,
										margins: span.setup.margins,
									})),
									Math.max(...sheets.map((sheet) => sheet.width)),
									state.geometry.margins,
								)
							: []

						// Koordinat alami stabil, jadi perhitungan kedua atas dokumen yang
						// sama menghasilkan spacer identik - di sinilah loop berhenti.
						if (
							!sameSpacers(spacers, state.spacers) ||
							pageCount !== state.pageCount ||
							!sameAdjustments(adjustments, state.marginAdjustments)
						) {
							const transaction = view.state.tr.setMeta(paginationKey, {
								spacers,
								pageCount,
								sheets,
								marginAdjustments: adjustments,
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
					}

					const schedule = () => {
						if (frame) return
						frame = requestAnimationFrame(recalculate)
					}

					schedule()

					// Perubahan ukuran font atau lebar ikut mengubah tinggi blok.
					const observer = new ResizeObserver(schedule)
					observer.observe(view.dom)

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
						},
					}
				},
			}),
		]
	},
})
