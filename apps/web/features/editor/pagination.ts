import { Extension } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view'
import { PAGE_BREAK_NODE } from './page-break'
import { type PageGeometry, pageGeometry } from './page-geometry'

export const paginationKey = new PluginKey<PaginationState>('pagination')

/**
 * Bentuk spacer mengikuti tempatnya disisipkan.
 *
 * Di antara blok biasa sebuah `<div>` sudah cukup. Di dalam tabel tidak: `<div>`
 * bukan anak yang sah dari `<tbody>`, dan browser akan melemparnya keluar dari
 * tabel. Karena itu pemenggalan di dalam tabel memakai baris kosong tanpa
 * border — yang kebetulan juga menghasilkan potongan paling bersih, sebab tidak
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
	kind: SpacerKind
	columns?: number
	headerPos?: number
	/** Tinggi header ulangan, kalau baris ini akan didahului salinannya. */
	headerHeight?: number
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
}

export interface PaginationOptions {
	geometry: PageGeometry
	onPageCountChange?: (pageCount: number) => void
}

/** Meta untuk memberi tahu plugin bahwa ukuran lembar atau margin berubah. */
export interface PaginationMeta {
	spacers?: Spacer[]
	pageCount?: number
	geometry?: PageGeometry
}

/**
 * Ukur tiap blok tingkat atas pada koordinat "alami" — posisi seandainya tidak
 * ada spacer sama sekali.
 *
 * Ini kunci agar perhitungan stabil. Mengukur `offsetTop` apa adanya membuat
 * hasilnya bergantung pada spacer yang baru saja disisipkan, sehingga
 * perhitungan berikutnya berbeda lagi dan editor terjebak reflow tanpa henti.
 * Karena tinggi tiap spacer kita sendiri yang menentukan, posisi alami bisa
 * dipulihkan dengan mengurangi total spacer yang mendahuluinya — dan
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

		measurements.push({
			pos: offset,
			top,
			bottom: top + dom.offsetHeight,
			isBreak: node.type.name === PAGE_BREAK_NODE,
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
const SPACER_ATTRIBUTE = 'data-spacer-for'

/**
 * Tinggi yang benar-benar tersisip di tiap posisi, dibaca dari DOM.
 *
 * Tinggi baris kosong kita yang menentukan, tapi tinggi header ulangan
 * ditentukan isinya sendiri. Membacanya balik dari DOM membuat koordinat alami
 * tetap tepat tanpa perlu menebak setinggi apa salinan itu jadinya.
 */
function insertedHeights(view: EditorView): Map<number, number> {
	const heights = new Map<number, number>()

	for (const element of view.dom.querySelectorAll<HTMLElement>(`[${SPACER_ATTRIBUTE}]`)) {
		const pos = Number(element.getAttribute(SPACER_ATTRIBUTE))
		if (Number.isNaN(pos)) continue
		heights.set(pos, (heights.get(pos) ?? 0) + element.offsetHeight)
	}

	return heights
}

/**
 * Tentukan di mana halaman dipenggal — murni aritmetika atas hasil pengukuran.
 *
 * Diekspor demi pengujian: masuk daftar blok, keluar daftar spacer, tanpa DOM
 * sama sekali. Aritmetika inilah yang paling sering salah, dan gejalanya baru
 * kelihatan setelah dokumen panjang dibuka.
 */
export function computeSpacers(
	blocks: readonly Measurement[],
	{ contentHeight, pageStride }: PageGeometry,
): { spacers: Spacer[]; pageCount: number } {
	const spacers: Spacer[] = []
	/** Total tinggi spacer yang sudah disisipkan sebelum blok berjalan. */
	let cumulative = 0
	let pageStart = 0
	let pageCount = 1
	/** Blok ini wajib mulai di lembar baru, apa pun sisa ruangnya. */
	let forceNext = false

	for (const block of blocks) {
		const isFirstOnPage = block.top <= pageStart + 0.5
		const overflows = block.bottom > pageStart + contentHeight

		if ((overflows || forceNext) && !isFirstOnPage) {
			// Tinggi spacer dihitung dari sasaran mutlaknya — awal lembar
			// berikutnya — bukan dari sisa ruang halaman berjalan. Selama tidak ada
			// blok yang meluber hasil keduanya sama persis; bedanya baru muncul
			// sesudahnya, dan hanya cara ini yang mengembalikan blok ke garis lembar.
			const target = pageCount * pageStride
			const spacerHeight = Math.max(0, target - (block.top + cumulative))
			// Header ulangan ikut memakan ruang di puncak lembar baru, jadi ia
			// dihitung sebagai bagian dari sisipan — dan halaman ini menyisakan
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
			pageCount += 1
		}

		forceNext = block.isBreak

		// Blok yang sendirian saja lebih tinggi dari satu halaman tidak bisa
		// dipenggal tanpa memecah node, jadi ia dibiarkan meluber.
		//
		// Berapa lembar yang ia habiskan dihitung dari posisi rendernya, bukan
		// dari tinggi area teks: isinya mengalir menembus margin bawah dan celah
		// antar lembar alih-alih dipenggal di situ, sehingga satu lembar menampung
		// pageStride piksel isinya — bukan contentHeight. Menghitungnya dengan
		// contentHeight membuat lembar kosong bermunculan di ujung blok panjang.
		const renderedBottom = block.bottom + cumulative
		const sheetsUsed = Math.floor(Math.max(0, renderedBottom - 1) / pageStride) + 1

		if (sheetsUsed > pageCount) {
			pageCount = sheetsUsed
			// Ia sudah menembus batas lembarnya sendiri, jadi blok sesudahnya wajib
			// mulai dari lembar baru. Tanpa paksaan ini, margin dan celah yang
			// dilewatinya jadi utang yang tidak pernah dibayar dan seluruh sisa
			// dokumen ikut melenceng.
			forceNext = true
		}
	}

	// Page break di baris terakhir tetap membuka lembar baru, walau masih kosong —
	// itu justru yang diminta penulis saat menaruhnya di ujung dokumen. Blok
	// raksasa di baris terakhir tidak dihitung begitu: halamannya sudah dihitung
	// oleh perulangan di atas.
	if (blocks[blocks.length - 1]?.isBreak) pageCount += 1

	return { spacers, pageCount }
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

function buildDecorations(doc: PMNode, spacers: readonly Spacer[]): DecorationSet {
	const decorations: Decoration[] = []

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

/** Baris kosong tanpa border — pemenggalan di dalam tabel. */
function rowSpacer(spacer: Spacer): HTMLElement {
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
 * pemetaan offset yang dipakai sorotan grammar. Isinya teks saja — tujuannya
 * mengingatkan nama kolom, bukan jadi tempat menyunting.
 */
function repeatedHeader(header: PMNode, spacer: Spacer): HTMLElement {
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
 * Batasan yang diketahui: satu blok yang lebih tinggi dari satu halaman penuh
 * (misalnya tabel raksasa) tetap meluber melewati batas lembar — memecahnya
 * butuh membelah node, bukan sekadar memberi jarak.
 */
export const Pagination = Extension.create<PaginationOptions>({
	name: 'pagination',

	addOptions() {
		return { geometry: pageGeometry() }
	},

	addProseMirrorPlugins() {
		const { geometry, onPageCountChange } = this.options

		return [
			new Plugin<PaginationState>({
				key: paginationKey,

				state: {
					init: () => ({
						spacers: [],
						decorations: DecorationSet.empty,
						pageCount: 1,
						geometry,
					}),

					apply(tr, current, _old, newState) {
						const incoming = tr.getMeta(paginationKey) as PaginationMeta | undefined

						if (incoming) {
							// Geometri baru saja tersimpan; spacer-nya menyusul dari
							// pengukuran berikutnya yang dipicu oleh view.update.
							if (!incoming.spacers) {
								return { ...current, geometry: incoming.geometry ?? current.geometry }
							}

							return {
								geometry: incoming.geometry ?? current.geometry,
								spacers: incoming.spacers,
								pageCount: incoming.pageCount ?? current.pageCount,
								decorations: buildDecorations(newState.doc, incoming.spacers),
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

						const blocks = measureBlocks(view)
						const { spacers, pageCount } = computeSpacers(blocks, state.geometry)

						// Koordinat alami stabil, jadi perhitungan kedua atas dokumen yang
						// sama menghasilkan spacer identik — di sinilah loop berhenti.
						if (!sameSpacers(spacers, state.spacers) || pageCount !== state.pageCount) {
							const transaction = view.state.tr.setMeta(paginationKey, { spacers, pageCount })
							transaction.setMeta('addToHistory', false)
							view.dispatch(transaction)
						}

						if (pageCount !== reportedPageCount) {
							reportedPageCount = pageCount
							onPageCountChange?.(pageCount)
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
