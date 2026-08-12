import { Extension, mergeAttributes, Node } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view'
import type { PageGeometry } from './page-geometry'
import { paginationKey, SELF_PAGINATE_ATTRIBUTE, SPACER_ATTRIBUTE } from './pagination'

/**
 * Kolom gaya koran - teks terpilih mengalir dan berimbang sendiri antar kolom.
 *
 * Versi pertama memakai wadah `columns` berisi node `column` terpisah, dan
 * seluruh isi terpilih ditumpuk ke kolom pertama sementara sisanya diisi
 * paragraf kosong. Hasilnya bukan kolom sama sekali: teks terjepit ke separuh
 * atau sepertiga halaman dengan ruang mati di sebelahnya.
 *
 * Versi kedua menyerahkan semuanya ke CSS multi-kolom (`column-count`) pada satu
 * node pembungkus. Di dalam satu halaman hasilnya benar, tapi begitu isinya
 * lebih panjang dari satu lembar kolomnya ikut memanjang menembus margin bawah
 * dan celah antar lembar - persis bentuk jurnal dua kolom yang dilaporkan
 * rusak. Multi-kolom CSS memang memenggal diri di media bercetak, tapi halaman
 * di layar ini bukan halaman sungguhan: ia satu aliran menerus yang lembarnya
 * digambar sebagai latar (lihat document-canvas.tsx), dan tidak ada mekanisme
 * CSS yang bisa memindahkan sisa kolom ke petak berikutnya di aliran itu.
 *
 * Karena itu di layar kolom ditata sendiri: tiap blok anak diposisikan mutlak ke
 * petak (lembar, kolom) hasil perhitungan `flowColumns`, sehingga tidak ada isi
 * yang pernah menyeberangi batas lembar. Konsekuensinya satu paragraf tidak
 * dipecah di tengah antar kolom - ia turun utuh, sama seperti blok yang tidak
 * muat di ujung halaman pada paginasi biasa. Saat MENCETAK aturan itu dilepas
 * (lihat blok @media print di globals.css): di kertas peramban yang memenggal,
 * dan multi-kolom CSS mengalir dari lembar ke lembar dengan benar.
 *
 * Perintah: `setColumns(n)` membungkus seleksi jadi n kolom - atau mengubah
 * jumlahnya kalau seleksi sudah berada di dalam kolom; `unsetColumns`
 * mengangkat isinya kembali ke aliran dokumen.
 */

/** Minimal dua - satu kolom itu paragraf biasa. */
const MIN_COLUMNS = 2

export const COLUMNS_NODE = 'columns'

declare module '@tiptap/core' {
	interface Commands<ReturnType> {
		columns: {
			setColumns: (count: number) => ReturnType
			unsetColumns: () => ReturnType
		}
	}
}

export const Columns = Node.create({
	name: COLUMNS_NODE,

	group: 'block',

	content: 'block+',

	defining: true,

	addAttributes() {
		return {
			count: {
				default: MIN_COLUMNS,
				parseHTML: (element) => {
					const parsed = Number(element.getAttribute('data-count'))
					return Number.isFinite(parsed) && parsed >= MIN_COLUMNS ? parsed : MIN_COLUMNS
				},
				// `column-count` ditulis inline, bukan dienumerasi di CSS: jumlah
				// kolom itu data, dan daftar `[data-count='2']`, `[data-count='3']`
				// akan diam-diam tidak berlaku begitu ada angka yang belum terdaftar.
				//
				// Nilainya ikut disimpan sebagai custom property karena tata letak
				// layar mematikan `column-count` (anak-anaknya diposisikan mutlak),
				// sementara aturan cetak perlu menyalakannya kembali.
				renderHTML: (attributes) => ({
					'data-count': attributes.count,
					style: `--columns-count: ${attributes.count}; column-count: ${attributes.count}`,
				}),
			},
		}
	},

	renderHTML({ HTMLAttributes }) {
		return [
			'div',
			mergeAttributes(HTMLAttributes, {
				'data-type': COLUMNS_NODE,
				// Blok ini memenggal dirinya sendiri: paginasi tidak boleh mendorongnya
				// utuh ke lembar berikutnya, cukup menghitung celah antar lembar yang
				// dilompati tata letaknya (lihat plugin di bawah).
				[SELF_PAGINATE_ATTRIBUTE]: 'true',
			}),
			0,
		]
	},

	parseHTML() {
		return [{ tag: 'div[data-type="columns"]' }]
	},

	addCommands() {
		return {
			setColumns:
				(count) =>
				({ editor, commands }) => {
					if (!Number.isFinite(count) || count < MIN_COLUMNS) return false
					// Sudah di dalam kolom: ganti jumlahnya, jangan bersarang lagi.
					if (editor.isActive(this.name)) {
						return commands.updateAttributes(this.name, { count })
					}
					return commands.wrapIn(this.name, { count })
				},
			unsetColumns:
				() =>
				({ commands }) =>
					commands.lift(this.name),
		}
	},
})

/**
 * Node lama dari struktur kolom sebelumnya, didaftarkan agar naskah yang sudah
 * telanjur menyimpannya tetap bisa dimuat - skema yang tidak mengenali sebuah
 * tipe node membuat seluruh dokumen gagal dibaca. Tidak pernah dibuat lagi oleh
 * perintah mana pun; isinya ikut mengalir sebagai blok biasa.
 */
const LegacyColumn = Node.create({
	name: 'column',

	group: 'block',

	content: 'block+',

	renderHTML({ HTMLAttributes }) {
		return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'col' }), 0]
	},

	parseHTML() {
		return [{ tag: 'div[data-type="col"]' }]
	},
})

// ── tata letak kolom ───────────────────────────────────────────────────────

/** Satu blok anak, sebagaimana terukur di DOM. */
export interface ColumnItem {
	/** Posisi ProseMirror blok ini. */
	pos: number
	height: number
	marginTop: number
	marginBottom: number
	/** Judul: tidak boleh ditinggal sendirian di kaki kolom. */
	keepWithNext: boolean
}

/** Bingkai tempat isi dialirkan: di mana blok kolom mulai, dan sebesar apa. */
export interface ColumnFrame {
	/** Puncak pembungkus pada koordinat render (sama seperti `offsetTop`). */
	top: number
	count: number
	columnWidth: number
	columnGap: number
}

export interface ColumnPlacement {
	pos: number
	/** Puncak kotak border, relatif terhadap puncak pembungkus. */
	top: number
	/** Tepi kiri kolom, relatif terhadap tepi kiri pembungkus. */
	left: number
}

export interface ColumnFlow {
	placements: ColumnPlacement[]
	/** Tinggi render pembungkus; blok sesudahnya mengalir tepat di bawahnya. */
	height: number
	/**
	 * Ruang mati antar lembar yang dilompati tata letak ini. Paginasi
	 * mengurangkannya untuk mengembalikan koordinat alami blok-blok sesudahnya.
	 */
	sheetGap: number
}

/**
 * Bagikan blok-blok anak ke petak (lembar, kolom) - inti dari seluruh berkas
 * ini, dan satu-satunya bagian yang aritmetis murni.
 *
 * Diekspor demi pengujian: masuk daftar blok beserta tingginya, keluar posisi
 * tiap blok, tanpa DOM sama sekali.
 *
 * Aturannya:
 * - Kolom-kolom sebuah lembar berjajar mulai dari puncak blok, bukan dari
 *   puncak lembar: blok kolom boleh mulai di tengah halaman.
 * - Sebuah blok tidak pernah dipenggal; yang tidak muat turun utuh ke kolom
 *   berikutnya, dan kolom terakhir sebuah lembar turun ke lembar berikutnya.
 * - Lembar terakhir diseimbangkan, kalau tidak blok pendek akan menumpuk
 *   seluruh isinya di kolom pertama dan menyisakan kolom kedua kosong.
 */
export function flowColumns(
	items: readonly ColumnItem[],
	{ top, count, columnWidth, columnGap }: ColumnFrame,
	{ contentHeight, pageStride }: Pick<PageGeometry, 'contentHeight' | 'pageStride'>,
): ColumnFlow {
	if (items.length === 0 || count < 1 || contentHeight <= 0) {
		return { placements: [], height: 0, sheetGap: 0 }
	}

	const sheetTop = (page: number) => page * pageStride
	const sheetBottom = (page: number) => page * pageStride + contentHeight

	// Lembar tempat pembungkus mendarat. Bila ia jatuh di celah antar lembar -
	// blok raksasa sebelumnya meluber ke sana - isinya mulai di lembar berikutnya.
	let page = Math.max(0, Math.floor(top / pageStride))
	if (top >= sheetBottom(page)) page += 1

	const firstPage = page
	const firstTop = Math.max(top, sheetTop(firstPage))
	const regionTop = (sheet: number) => (sheet === firstPage ? firstTop : sheetTop(sheet))
	const regionHeight = (sheet: number) => sheetBottom(sheet) - regionTop(sheet)

	const slots: { page: number; column: number; top: number }[] = []
	let column = 0
	/** Berapa kali tata letak pindah lembar - dasar perhitungan `sheetGap`. */
	let sheets = 0

	const advance = () => {
		column += 1
		if (column >= count) {
			column = 0
			page += 1
			sheets += 1
		}
	}

	let index = 0
	while (index < items.length) {
		const limit = regionHeight(page)
		let tops = packColumn(items, index, limit)

		if (tops.length === 0) {
			if (limit < contentHeight - 0.5) {
				// Sisa lembar pertama terlalu pendek untuk blok mana pun - lewati.
				advance()
				continue
			}
			// Satu blok lebih tinggi dari kolom penuh. Memenggalnya butuh memecah
			// node, jadi ia dibiarkan meluber - batasan yang sama dengan blok raksasa
			// pada paginasi biasa.
			tops = [0]
		}

		const base = regionTop(page)
		for (const offset of tops) slots.push({ page, column, top: base + offset })
		index += tops.length

		if (index < items.length) advance()
	}

	// Lembar terakhir diseimbangkan supaya kolomnya berakhir sama rata.
	const lastPage = page
	const firstOnLastPage = slots.findIndex((slot) => slot.page === lastPage)
	if (firstOnLastPage >= 0) {
		const balanced = balanceColumns(items.slice(firstOnLastPage), regionHeight(lastPage), count)
		if (balanced) {
			const base = regionTop(lastPage)
			balanced.forEach((placement, offset) => {
				slots[firstOnLastPage + offset] = {
					page: lastPage,
					column: placement.column,
					top: base + placement.top,
				}
			})
		}
	}

	let bottom = firstTop
	for (const [i, item] of items.entries()) {
		if (slots[i].page !== lastPage) continue
		bottom = Math.max(bottom, slots[i].top + item.height)
	}

	return {
		placements: items.map((item, i) => ({
			pos: item.pos,
			top: slots[i].top - top,
			left: slots[i].column * (columnWidth + columnGap),
		})),
		height: Math.max(0, bottom - top),
		sheetGap: firstTop - top + sheets * (pageStride - contentHeight),
	}
}

/**
 * Isi satu kolom setinggi `limit` dengan blok berurutan mulai dari `from`;
 * mengembalikan puncak tiap blok relatif terhadap puncak kolom.
 */
function packColumn(items: readonly ColumnItem[], from: number, limit: number): number[] {
	const tops: number[] = []
	let y = 0
	let previousBottom = 0

	for (let i = from; i < items.length; i++) {
		const item = items[i]
		// Margin antar blok bertumpuk, bukan berjumlah - seperti aliran normal.
		const spacing = i === from ? 0 : Math.max(previousBottom, item.marginTop)
		if (y + spacing + item.height > limit + 0.5) break

		const next = items[i + 1]
		if (item.keepWithNext && next && i > from) {
			// Judul di kaki kolom dengan isinya di kolom sebelah terbaca seperti
			// rusak; kalau keduanya tidak muat bersama, putus di atas judulnya.
			const after = y + spacing + item.height
			if (after + Math.max(item.marginBottom, next.marginTop) + next.height > limit + 0.5) break
		}

		tops.push(y + spacing)
		y += spacing + item.height
		previousBottom = item.marginBottom
	}

	return tops
}

/**
 * Bagi blok ke `count` kolom serata mungkin: cari tinggi kolom terkecil yang
 * masih memuat semuanya. Mengembalikan null bila tidak ada yang muat - blok
 * yang lebih tinggi dari kolomnya sendiri - dan pemanggil mempertahankan hasil
 * bagian rakus.
 */
function balanceColumns(
	items: readonly ColumnItem[],
	limit: number,
	count: number,
): { column: number; top: number }[] | null {
	let best = fillColumns(items, limit, count)
	if (!best) return null

	let low = 0
	let high = limit
	// Ketelitian satu piksel sudah jauh di bawah tinggi satu baris.
	while (high - low > 1) {
		const middle = (low + high) / 2
		const attempt = fillColumns(items, middle, count)
		if (attempt) {
			best = attempt
			high = middle
		} else {
			low = middle
		}
	}

	return best
}

/** Muat seluruh blok ke `count` kolom setinggi `limit`, atau null bila tak cukup. */
function fillColumns(
	items: readonly ColumnItem[],
	limit: number,
	count: number,
): { column: number; top: number }[] | null {
	const placements: { column: number; top: number }[] = []
	let index = 0

	for (let column = 0; column < count && index < items.length; column++) {
		const tops = packColumn(items, index, limit)
		if (tops.length === 0) return null
		for (const top of tops) placements.push({ column, top })
		index += tops.length
	}

	return index === items.length ? placements : null
}

// ── plugin: mengukur, menghitung, lalu menggambar lewat dekorasi ───────────

/** Blok yang tidak boleh ditinggal sendirian di kaki kolom. */
const KEEP_WITH_NEXT = new Set(['heading'])

/** Jarak antar kolom bila CSS tidak memberi angka. */
const FALLBACK_COLUMN_GAP = 24

const columnLayoutKey = new PluginKey<ColumnLayoutState>('columnLayout')

/** Satu blok kolom yang sudah dihitung, siap jadi dekorasi. */
interface ColumnsPlan {
	pos: number
	nodeSize: number
	height: number
	sheetGap: number
	items: { pos: number; nodeSize: number; top: number; left: number; right: number }[]
}

interface ColumnLayoutState {
	plans: ColumnsPlan[]
	decorations: DecorationSet
}

function px(value: string): number {
	const parsed = Number.parseFloat(value)
	return Number.isFinite(parsed) ? parsed : 0
}

function columnGapOf(dom: HTMLElement): number {
	const parsed = Number.parseFloat(getComputedStyle(dom).columnGap)
	return Number.isFinite(parsed) ? parsed : FALLBACK_COLUMN_GAP
}

/**
 * Ukur tiap blok kolom tingkat atas dan hitung tata letaknya.
 *
 * Hanya blok tingkat atas: koordinat lembar berasal dari `offsetTop` terhadap
 * akar editor, dan blok kolom yang bersarang di dalam tabel atau kutipan tidak
 * punya hubungan sesederhana itu dengan batas lembar. Yang bersarang dibiarkan
 * memakai multi-kolom CSS biasa.
 */
function measureColumns(view: EditorView, geometry: PageGeometry): ColumnsPlan[] {
	const plans: ColumnsPlan[] = []

	view.state.doc.forEach((node, offset) => {
		if (node.type.name !== COLUMNS_NODE) return

		const dom = view.nodeDOM(offset)
		if (!(dom instanceof HTMLElement)) return

		const count = Math.max(MIN_COLUMNS, Number(node.attrs.count) || MIN_COLUMNS)
		const width = dom.clientWidth
		const columnGap = columnGapOf(dom)
		const columnWidth = (width - columnGap * (count - 1)) / count
		if (!(columnWidth > 0)) return

		const items: ColumnItem[] = []
		/** Sejajar dengan `items`: dipakai saat menerjemahkan hasil ke gaya CSS. */
		const sizes: number[] = []
		let childPos = offset + 1

		node.forEach((child) => {
			const element = view.nodeDOM(childPos)
			if (element instanceof HTMLElement) {
				const style = getComputedStyle(element)
				items.push({
					pos: childPos,
					height: element.offsetHeight,
					marginTop: px(style.marginTop),
					marginBottom: px(style.marginBottom),
					keepWithNext: KEEP_WITH_NEXT.has(child.type.name),
				})
				sizes.push(child.nodeSize)
			}
			childPos += child.nodeSize
		})

		if (items.length === 0) return

		const flow = flowColumns(items, { top: dom.offsetTop, count, columnWidth, columnGap }, geometry)

		plans.push({
			pos: offset,
			nodeSize: node.nodeSize,
			height: flow.height,
			sheetGap: flow.sheetGap,
			items: flow.placements.map((placement, i) => ({
				pos: placement.pos,
				nodeSize: sizes[i],
				// `top` dan `left` menempatkan kotak MARGIN. Puncak border jatuh satu
				// margin atas di bawahnya, jadi margin itu dikurangkan lebih dulu -
				// sementara margin kiri (indentasi) justru dibiarkan bekerja.
				top: placement.top - items[i].marginTop,
				left: placement.left,
				// Lebar diberikan lewat `right`, bukan `width`: dengan begitu blok
				// berindentasi menyempit ke dalam kolomnya alih-alih tumpah keluar.
				right: width - placement.left - columnWidth,
			})),
		})
	})

	return plans
}

function samePlans(a: readonly ColumnsPlan[], b: readonly ColumnsPlan[]): boolean {
	const near = (x: number, y: number) => Math.abs(x - y) < 0.5

	return (
		a.length === b.length &&
		a.every((plan, index) => {
			const other = b[index]
			return (
				plan.pos === other.pos &&
				plan.nodeSize === other.nodeSize &&
				near(plan.height, other.height) &&
				near(plan.sheetGap, other.sheetGap) &&
				plan.items.length === other.items.length &&
				plan.items.every((item, i) => {
					const twin = other.items[i]
					return (
						item.pos === twin.pos &&
						near(item.top, twin.top) &&
						near(item.left, twin.left) &&
						near(item.right, twin.right)
					)
				})
			)
		})
	)
}

/**
 * Celah yang dilompati blok kolom saat menyeberangi batas lembar.
 *
 * Ia tidak menempati ruang - posisinya mutlak - dan hanya ada supaya paginasi
 * bisa membaca balik tingginya lewat `SPACER_ATTRIBUTE`, persis seperti celah
 * internal blok daftar isi.
 */
function sheetGapElement(plan: ColumnsPlan): HTMLElement {
	const element = document.createElement('div')
	element.className = 'columns-sheet-gap'
	element.style.height = `${Math.round(plan.sheetGap)}px`
	element.setAttribute(SPACER_ATTRIBUTE, String(plan.pos))
	element.setAttribute('aria-hidden', 'true')
	element.contentEditable = 'false'
	return element
}

function buildDecorations(doc: PMNode, plans: readonly ColumnsPlan[]): DecorationSet {
	const decorations: Decoration[] = []

	for (const plan of plans) {
		decorations.push(
			// Hanya tinggi yang ditulis inline. Sisanya - termasuk mematikan
			// `column-count` bawaan node - datang dari kelas `.columns-flowed` di
			// globals.css: ProseMirror mencabut properti dekorasi dari style inline
			// saat dekorasinya hilang, dan properti yang juga dimiliki node sendiri
			// ikut tercabut bersamanya.
			Decoration.node(plan.pos, plan.pos + plan.nodeSize, {
				class: 'columns-flowed',
				style: `height:${Math.round(plan.height)}px`,
			}),
		)

		for (const item of plan.items) {
			decorations.push(
				Decoration.node(item.pos, item.pos + item.nodeSize, {
					class: 'columns-item',
					style: `position:absolute;top:${Math.round(item.top)}px;left:${Math.round(
						item.left,
					)}px;right:${Math.round(item.right)}px`,
				}),
			)
		}

		if (plan.sheetGap > 0.5) {
			decorations.push(
				Decoration.widget(plan.pos + plan.nodeSize - 1, () => sheetGapElement(plan), {
					side: 1,
					key: `columns-gap-${plan.pos}-${Math.round(plan.sheetGap)}`,
				}),
			)
		}
	}

	return DecorationSet.create(doc, decorations)
}

/**
 * Plugin yang menjaga isi blok kolom tetap di dalam lembarnya.
 *
 * Bentuknya sengaja meniru plugin paginasi: ukur di DOM, hitung dengan
 * aritmetika murni, lalu gambar lewat dekorasi - bukan node dokumen - supaya
 * tata letak layar tidak ikut tersimpan sebagai isi naskah dan tidak menggeser
 * pemetaan offset yang dipakai sorotan grammar.
 *
 * Keduanya bertemu di satu titik: tinggi pembungkus yang dihitung di sini
 * dibaca paginasi sebagai tinggi blok, dan posisi pembungkus yang ditentukan
 * paginasi dibaca di sini sebagai awal kolom. Tidak ada putaran di antaranya -
 * posisi pembungkus hanya bergantung pada blok-blok SEBELUMNYA - jadi keduanya
 * bertemu pada hasil yang sama setelah satu-dua bingkai.
 */
function columnLayoutPlugin(): Plugin<ColumnLayoutState> {
	return new Plugin<ColumnLayoutState>({
		key: columnLayoutKey,

		state: {
			init: () => ({ plans: [], decorations: DecorationSet.empty }),

			apply(tr, current, _old, newState) {
				const incoming = tr.getMeta(columnLayoutKey) as ColumnsPlan[] | undefined
				if (incoming) {
					return { plans: incoming, decorations: buildDecorations(newState.doc, incoming) }
				}

				// Dekorasi lama dipetakan ke dokumen baru supaya kolom tidak berkedip
				// selama menunggu pengukuran berikutnya.
				if (tr.docChanged) {
					return { ...current, decorations: current.decorations.map(tr.mapping, tr.doc) }
				}
				return current
			},
		},

		props: {
			decorations: (state) => columnLayoutKey.getState(state)?.decorations,
		},

		view(view) {
			let frame = 0

			const recalculate = () => {
				frame = 0
				const state = columnLayoutKey.getState(view.state)
				if (!state) return

				// Pageless: kanvas menerus, tidak ada batas lembar yang perlu dihindari,
				// jadi multi-kolom CSS biasa sudah benar (§A1.5).
				const pagination = paginationKey.getState(view.state)
				const plans =
					pagination && !pagination.pageless ? measureColumns(view, pagination.geometry) : []

				// Pengukuran kedua atas keadaan yang sama menghasilkan rencana yang
				// sama - di sinilah putaran ukur-gambar berhenti.
				if (samePlans(plans, state.plans)) return

				const transaction = view.state.tr.setMeta(columnLayoutKey, plans)
				transaction.setMeta('addToHistory', false)
				view.dispatch(transaction)
			}

			const schedule = () => {
				if (frame) return
				frame = requestAnimationFrame(recalculate)
			}

			schedule()

			// Lebar kolom dan tinggi blok ikut berubah saat ukuran font, zoom, atau
			// margin berubah - semuanya lewat perubahan ukuran akar editor.
			const observer = new ResizeObserver(schedule)
			observer.observe(view.dom)

			return {
				update: schedule,
				destroy: () => {
					if (frame) cancelAnimationFrame(frame)
					observer.disconnect()
				},
			}
		},
	})
}

/**
 * Extension payung supaya cukup satu entri di daftar ekstensi editor.
 */
export const ColumnExtension = Extension.create({
	name: 'columnExtension',

	addExtensions() {
		return [Columns, LegacyColumn]
	},

	addProseMirrorPlugins() {
		return [columnLayoutPlugin()]
	},
})
