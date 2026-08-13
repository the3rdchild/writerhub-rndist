import { Extension, mergeAttributes, Node } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view'
import type { PageGeometry } from './page-geometry'
import { paginationKey, repeatedHeader, rowSpacer, SELF_PAGINATE_ATTRIBUTE, SPACER_ATTRIBUTE, type Spacer } from './pagination'

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
	/**
	 * Tabel yang diukur per baris (§P4 lapis 2): bila ia terpaksa jadi "blok
	 * raksasa", pemenggalannya jatuh rapi di antar baris pada batas lembar -
	 * dengan baris kosong pengganjal dan salinan header - alih-alih dibiarkan
	 * meluber menembus celah. Tidak ada untuk blok lain: memenggalnya butuh
	 * memecah node.
	 */
	table?: ColumnTable
}

/** Tabel sebagai deret baris terukur, plus header yang boleh diulang. */
export interface ColumnTable {
	/** Baris-barisnya, berurutan; `top` alami relatif terhadap puncak tabel. */
	rows: readonly { pos: number; top: number; height: number }[]
	/** Jumlah kolom tabel - untuk merentang sel baris kosong pengganjal. */
	columns: number
	/** Baris header yang digambar ulang di puncak tiap potongan lanjutan. */
	header?: { pos: number; height: number }
}

/**
 * Satu pemenggalan tabel di batas lembar, di dalam kolom.
 *
 * Baris kosong setinggi `spacerHeight` disisipkan sebelum baris di `pos`,
 * menyodoknya ke puncak lembar berikutnya - persis `rowSpacer` pada paginasi
 * biasa, hanya saja di sini "lembar berikutnya" adalah petak kolom yang sama
 * satu lembar di bawahnya.
 */
export interface TableCut {
	/** Posisi ProseMirror baris pertama SESUDAH potongan. */
	pos: number
	spacerHeight: number
	/** Tinggi salinan header di puncak potongan; 0 bila header tidak diulang. */
	headerHeight: number
	headerPos?: number
	columns: number
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
	/** Pemenggalan tabel di batas lembar; hanya ada pada item bertabel. */
	cuts?: readonly TableCut[]
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
 * - Blok yang lebih tinggi dari kolom penuh mendapat petaknya sendiri dan
 *   dibiarkan meluber, TAPI luberannya dicatat: petak yang masih tertutup
 *   luberan dilewati, supaya tidak ada blok yang digambar menimpa blok lain
 *   (§P4 lapis 1). Tinggi pembungkus dan `sheetGap` ikut mencakup luberan itu.
 * - Pengecualian meluber: TABEL yang jadi blok raksasa dipenggal rapi di antar
 *   baris pada batas lembar - baris kosong pengganjal menyodok sisanya ke
 *   puncak lembar berikutnya dan salinan header membuka tiap potongan
 *   (§P4 lapis 2, lihat `cutTableRows`).
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

	const slots: { page: number; column: number; top: number; height: number; cuts?: readonly TableCut[] }[] = []
	/**
	 * Sampai mana blok raksasa benar-benar meluber di tiap kolom, pada koordinat
	 * render. Petak yang masih tertutup luberan dilewati atau dipotong puncaknya -
	 * kalau tidak, blok berikutnya digambar menimpa si raksasa (§P4 lapis 1).
	 */
	const blockedUntil: number[] = Array.from({ length: count }, () => 0)
	let column = 0

	const advance = () => {
		column += 1
		if (column >= count) {
			column = 0
			page += 1
		}
	}

	let index = 0
	while (index < items.length) {
		const base = Math.max(regionTop(page), blockedUntil[column])
		const limit = sheetBottom(page) - base
		let tops = packColumn(items, index, limit)
		let giant = false

		if (tops.length === 0) {
			if (limit < contentHeight - 0.5) {
				// Sisa kolom terlalu pendek untuk blok mana pun - lewati.
				advance()
				continue
			}
			// Satu blok lebih tinggi dari kolom penuh. Tabel dipenggal rapi di
			// antar baris (lihat cutTableRows); blok lain dibiarkan meluber - tapi
			// luberannya dicatat supaya petak yang ia tutupi tidak dipakai blok
			// berikutnya.
			tops = [0]
			giant = true
		}

		for (const [offsetIndex, offset] of tops.entries()) {
			const item = items[index + offsetIndex]
			const slot: (typeof slots)[number] = { page, column, top: base + offset, height: item.height }
			if (!giant) {
				slots.push(slot)
				continue
			}
			if (item.table) {
				const cut = cutTableRows(item.table, slot.top, page, { contentHeight, pageStride })
				// Tinggi efektifnya memanjang oleh pengganjal dan salinan header.
				slot.height = cut.bottom - slot.top
				if (cut.cuts.length > 0) slot.cuts = cut.cuts
				blockedUntil[column] = cut.bottom
			} else {
				blockedUntil[column] = slot.top + item.height
			}
			slots.push(slot)
		}
		index += tops.length

		if (index < items.length) advance()
	}

	// Lembar terakhir diseimbangkan supaya kolomnya berakhir sama rata - kecuali
	// bila ada luberan blok raksasa yang masuk ke lembar itu: mengatur ulang isi
	// di kolom yang tertutup luberan akan membuatnya tertimpa.
	const lastPage = page
	const spillOnLastPage = blockedUntil.some((until) => until > regionTop(lastPage) + 0.5)
	const firstOnLastPage = slots.findIndex((slot) => slot.page === lastPage)
	if (firstOnLastPage >= 0 && !spillOnLastPage) {
		const balanced = balanceColumns(items.slice(firstOnLastPage), regionHeight(lastPage), count)
		if (balanced) {
			const base = regionTop(lastPage)
			balanced.forEach((placement, offset) => {
				slots[firstOnLastPage + offset] = {
					page: lastPage,
					column: placement.column,
					top: base + placement.top,
					height: items[firstOnLastPage + offset].height,
				}
			})
		}
	}

	// Ujung isi pada koordinat render, dari SEMUA penempatan: luberan blok
	// raksasa bisa berakhir beberapa lembar di depan blok terakhir yang dipasang.
	let bottom = firstTop
	for (const slot of slots) {
		bottom = Math.max(bottom, slot.top + slot.height)
	}

	// Lembar yang dilompati dihitung dari ujung isi, bukan dari jumlah
	// perpindahan petak, supaya luberan blok raksasa yang melewati lembar
	// terakhir yang dipakai pun ikut terhitung dalam `sheetGap`.
	const sheets = Math.max(0, Math.ceil((bottom - sheetBottom(firstPage)) / pageStride))

	return {
		placements: items.map((item, i) => ({
			pos: item.pos,
			top: slots[i].top - top,
			left: slots[i].column * (columnWidth + columnGap),
			cuts: slots[i].cuts,
		})),
		height: Math.max(0, bottom - top),
		sheetGap: firstTop - top + sheets * (pageStride - contentHeight),
	}
}

/**
 * Penggal tabel raksasa di antar baris, tepat di batas lembar (§P4 lapis 2).
 *
 * Tabel yang lebih tinggi dari kolom penuh tidak bisa pindah ke kolom sebelah -
 * ia satu elemen DOM, tidak bisa berada di dua tempat sekaligus. Yang bisa
 * dilakukan adalah memotongnya di dalam kolomnya sendiri: baris-baris mengisi
 * lembar berjalan, baris kosong pengganjal menyodok sisanya ke puncak lembar
 * berikutnya (petak kolom yang sama, yang memang sudah dipesan oleh
 * `blockedUntil`), dan salinan header membuka tiap potongan lanjutan.
 *
 * Murni aritmetika atas tinggi baris yang sudah diukur; mengembalikan daftar
 * potongan untuk digambar sebagai dekorasi, dan ujung tabel pada koordinat
 * render sesudah semua sisipan.
 */
export function cutTableRows(
	table: ColumnTable,
	base: number,
	page: number,
	{ contentHeight, pageStride }: Pick<PageGeometry, 'contentHeight' | 'pageStride'>,
): { cuts: TableCut[]; bottom: number } {
	const sheetTop = (p: number) => p * pageStride
	const sheetBottom = (p: number) => p * pageStride + contentHeight
	const headerHeight = table.header?.height ?? 0

	const cuts: TableCut[] = []
	/** Total pengganjal + salinan header yang sudah tersisip sebelum baris berjalan. */
	let shift = 0
	let sheet = page

	for (const row of table.rows) {
		const top = base + shift + row.top
		// Baris yang (terdorong luberan baris sebelumnya) sudah berada lembar-lembar
		// di depan tidak perlu dipotong - cukup susul lembar tempatnya berada.
		while (top >= sheetTop(sheet + 1) - 0.5) sheet += 1
		if (top + row.height <= sheetBottom(sheet) + 0.5) continue
		if (top <= sheetTop(sheet) + 0.5) {
			// Satu baris saja lebih tinggi dari lembar penuh: memenggalnya butuh
			// membelah sel, jadi ia dibiarkan meluber - batasan yang sama dengan
			// baris raksasa pada paginasi biasa.
			continue
		}

		const target = sheetTop(sheet + 1)
		const spacerHeight = target - top
		cuts.push({
			pos: row.pos,
			spacerHeight,
			headerHeight,
			headerPos: headerHeight > 0 ? table.header?.pos : undefined,
			columns: table.columns,
		})
		shift += spacerHeight + headerHeight
		sheet += 1
	}

	const lastRow = table.rows[table.rows.length - 1]
	const bottom = lastRow ? base + shift + lastRow.top + lastRow.height : base
	return { cuts, bottom }
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
	items: { pos: number; nodeSize: number; top: number; left: number; right: number; cuts?: readonly TableCut[] }[]
}

interface ColumnLayoutState {
	plans: ColumnsPlan[]
	decorations: DecorationSet
}

function px(value: string): number {
	const parsed = Number.parseFloat(value)
	return Number.isFinite(parsed) ? parsed : 0
}

/**
 * Penggabungan margin satu lapis, murni aritmetika: margin anak pertama/terakhir
 * hanya bocor keluar ke ruang blok bila sisi itu tidak punya margin sendiri,
 * tidak punya padding, dan tidak punya border. Kalau ada padding/border, margin
 * anak tetap di dalam dan sudah termasuk `offsetHeight` - membacanya lagi akan
 * menghitung jarak yang sama dua kali.
 *
 * Kasus nyatanya adalah tabel: DOM terluar node view-nya `div.tableWrapper`
 * bikinan `prosemirror-tables`, yang tidak memegang margin - `margin: 0.75em 0`
 * ada pada `<table>` di dalamnya (globals.css) dan bocor keluar lewat
 * penggabungan margin. Tanpa pembacaan ini `marginBottom` tabel terbaca 0 dan
 * blok sesudahnya terhitung 12px terlalu rapat (§P4 catatan pengukuran, A-2).
 */
export function collapsedMargin(own: number, padding: number, border: number, child: number): number {
	if (own !== 0 || padding !== 0 || border !== 0) return own
	return child
}

/** Margin vertikal efektif sebuah blok, dengan penggabungan satu lapis ke dalam. */
function blockMargins(element: HTMLElement): { marginTop: number; marginBottom: number } {
	const style = getComputedStyle(element)
	const childMargin = (side: 'Top' | 'Bottom'): number => {
		const child = side === 'Top' ? element.firstElementChild : element.lastElementChild
		return child instanceof HTMLElement ? px(getComputedStyle(child)[`margin${side}`]) : 0
	}
	return {
		marginTop: collapsedMargin(px(style.marginTop), px(style.paddingTop), px(style.borderTopWidth), childMargin('Top')),
		marginBottom: collapsedMargin(
			px(style.marginBottom),
			px(style.paddingBottom),
			px(style.borderBottomWidth),
			childMargin('Bottom'),
		),
	}
}

function columnGapOf(dom: HTMLElement): number {
	const parsed = Number.parseFloat(getComputedStyle(dom).columnGap)
	return Number.isFinite(parsed) ? parsed : FALLBACK_COLUMN_GAP
}

/**
 * Ukur tabel per baris, bukan sebagai satu blok utuh - gagasan yang sama dengan
 * `measureTable` pada paginasi (§P4 lapis 2).
 *
 * Pengganjal dan salinan header yang tersisip dari perhitungan sebelumnya
 * menambah tinggi DOM tabel dan menggeser baris-barisnya; keduanya dibaca balik
 * lewat `SPACER_ATTRIBUTE` lalu dikurangkan, supaya yang diukur selalu koordinat
 * alami dan perhitungan kedua atas keadaan yang sama menghasilkan rencana yang
 * sama - sama seperti `insertedHeights` pada paginasi.
 */
function measureTableItem(view: EditorView, table: PMNode, tablePos: number, dom: HTMLElement): ColumnItem {
	// Sisipan dari perhitungan sebelumnya, per posisi baris yang didahuluinya.
	const inserted = new Map<number, number>()
	let insertedTotal = 0
	for (const element of dom.querySelectorAll<HTMLElement>(`[${SPACER_ATTRIBUTE}]`)) {
		const pos = Number(element.getAttribute(SPACER_ATTRIBUTE))
		if (Number.isNaN(pos)) continue
		inserted.set(pos, (inserted.get(pos) ?? 0) + element.offsetHeight)
		insertedTotal += element.offsetHeight
	}

	// Header hanya diulang kalau baris pertamanya memang baris header, dan
	// penulis tidak mematikannya untuk tabel ini - aturan yang sama dengan
	// paginasi biasa.
	const headerRow = table.firstChild
	const repeat = headerRow?.firstChild?.type.name === 'tableHeader' && table.attrs.repeatHeader !== false

	const rows: { pos: number; top: number; height: number }[] = []
	let header: ColumnTable['header']
	let cumulative = 0

	table.forEach((row, rowOffset) => {
		const rowPos = tablePos + 1 + rowOffset
		cumulative += inserted.get(rowPos) ?? 0

		const rowDom = view.nodeDOM(rowPos)
		if (!(rowDom instanceof HTMLElement)) return

		// offsetParent sebuah <tr> adalah tabelnya, jadi top di sini relatif
		// terhadap puncak tabel - persis yang dibutuhkan cutTableRows.
		rows.push({ pos: rowPos, top: rowDom.offsetTop - cumulative, height: rowDom.offsetHeight })
		if (repeat && rows.length === 1) header = { pos: rowPos, height: rowDom.offsetHeight }
	})

	return {
		pos: tablePos,
		height: dom.offsetHeight - insertedTotal,
		...blockMargins(dom),
		keepWithNext: false,
		table: { rows, columns: headerRow?.childCount ?? 1, header },
	}
}

/**
 * Ukur tiap blok kolom tingkat atas dan hitung tata letaknya.
 *
 * Hanya blok tingkat atas: koordinat lembar berasal dari `offsetTop` terhadap
 * akar editor, dan blok kolom yang bersarang di dalam tabel atau kutipan tidak
 * punya hubungan sesederhana itu dengan batas lembar. Yang bersarang dibiarkan
 * memakai multi-kolom CSS biasa.
 *
 * Selain rencana tata letak, dikembalikan juga elemen tiap blok anak: begitu
 * mereka diposisikan mutlak, tinggi mereka tidak lagi terbaca dari ukuran akar
 * editor, jadi merekalah yang harus diamati langsung (lihat `watch` di plugin).
 */
function measureColumns(
	view: EditorView,
	geometry: PageGeometry,
): { plans: ColumnsPlan[]; elements: HTMLElement[] } {
	const plans: ColumnsPlan[] = []
	const elements: HTMLElement[] = []

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
				elements.push(element)
				items.push(
					child.type.name === 'table'
						? measureTableItem(view, child, childPos, element)
						: {
								pos: childPos,
								height: element.offsetHeight,
								...blockMargins(element),
								keepWithNext: KEEP_WITH_NEXT.has(child.type.name),
							},
				)
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
				cuts: placement.cuts,
			})),
		})
	})

	return { plans, elements }
}

function samePlans(a: readonly ColumnsPlan[], b: readonly ColumnsPlan[]): boolean {
	const near = (x: number, y: number) => Math.abs(x - y) < 0.5
	const sameCuts = (one?: readonly TableCut[], other?: readonly TableCut[]) =>
		(one?.length ?? 0) === (other?.length ?? 0) &&
		(one ?? []).every((cut, index) => {
			const twin = (other ?? [])[index]
			return cut.pos === twin.pos && near(cut.spacerHeight, twin.spacerHeight) && near(cut.headerHeight, twin.headerHeight)
		})

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
						near(item.right, twin.right) &&
						sameCuts(item.cuts, twin.cuts)
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

			// Potongan tabel di batas lembar: baris kosong pengganjal menutup
			// lembar lama, salinan header membuka lembar baru - mekanisme yang sama
			// dengan paginasi biasa, digambar di dalam tabel yang diposisikan mutlak.
			for (const cut of item.cuts ?? []) {
				const spacer: Spacer = { pos: cut.pos, height: cut.spacerHeight, kind: 'row', columns: cut.columns }
				decorations.push(
					Decoration.widget(cut.pos, () => rowSpacer(spacer), {
						side: -2,
						key: `columns-cut-${cut.pos}-${Math.round(cut.spacerHeight)}`,
					}),
				)

				if (cut.headerPos !== undefined && cut.headerHeight > 0) {
					const header = doc.nodeAt(cut.headerPos)
					if (header) {
						decorations.push(
							Decoration.widget(cut.pos, () => repeatedHeader(header, spacer), {
								side: -1,
								key: `columns-cut-header-${cut.pos}-${Math.round(cut.spacerHeight)}`,
							}),
						)
					}
				}
			}
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

			const schedule = () => {
				if (frame) return
				frame = requestAnimationFrame(recalculate)
			}

			/**
			 * Akar editor plus tiap blok anak di dalam kolom.
			 *
			 * Anak blok kolom wajib diamati satu per satu. Begitu mereka diposisikan
			 * mutlak dan pembungkusnya diberi tinggi tetap, perubahan tinggi mereka
			 * TIDAK lagi mengubah ukuran akar editor - jadi mengamati akar saja
			 * membuat tata letak membatu pada angka pengukuran pertama. Blok kode
			 * paling sering menabraknya: node view-nya React, isinya baru terpasang
			 * satu putaran setelah ProseMirror membuat elemennya, dan pratinjau
			 * Mermaid-nya menyusul jauh belakangan - keduanya tanpa transaksi apa pun
			 * yang bisa memicu pengukuran ulang.
			 */
			const observer = new ResizeObserver(schedule)
			observer.observe(view.dom)
			let watched: HTMLElement[] = []

			const watch = (elements: HTMLElement[]) => {
				const same =
					elements.length === watched.length &&
					elements.every((element, index) => element === watched[index])
				if (same) return

				observer.disconnect()
				observer.observe(view.dom)
				for (const element of elements) observer.observe(element)
				watched = elements
			}

			const recalculate = () => {
				frame = 0
				const state = columnLayoutKey.getState(view.state)
				if (!state) return

				// Pageless: kanvas menerus, tidak ada batas lembar yang perlu dihindari,
				// jadi multi-kolom CSS biasa sudah benar (§A1.5).
				const pagination = paginationKey.getState(view.state)
				const measured =
					pagination && !pagination.pageless
						? measureColumns(view, pagination.geometry)
						: { plans: [], elements: [] }

				watch(measured.elements)

				// Pengukuran kedua atas keadaan yang sama menghasilkan rencana yang
				// sama - di sinilah putaran ukur-gambar berhenti.
				if (samePlans(measured.plans, state.plans)) return

				const transaction = view.state.tr.setMeta(columnLayoutKey, measured.plans)
				transaction.setMeta('addToHistory', false)
				view.dispatch(transaction)
			}

			schedule()

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
