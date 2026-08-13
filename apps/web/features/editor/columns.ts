import { Extension, mergeAttributes, Node } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view'
import { type PageGeometry, pageGeometry } from './page-geometry'
import {
	paginationKey,
	REGION_SHEET_GAP_ATTRIBUTE,
	REGION_SPACE_ATTRIBUTE,
	repeatedHeader,
	rowSpacer,
	SELF_PAGINATE_ATTRIBUTE,
	SPACER_ATTRIBUTE,
	type Spacer,
} from './pagination'
import { columnRegions } from './section-break'

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
			/** Ubah celah dan/atau lebar kolom lewat penggaris (§P5). */
			setColumnsLayout: (pos: number, patch: { gap?: number; widths?: number[] | null }) => ReturnType
		}
	}
}

/** Lebar celah tersimpan sebagai angka; bila belum pernah diseret, ikuti CSS. */
function parseGapAttribute(element: HTMLElement): number | null {
	const parsed = Number(element.getAttribute('data-gap'))
	return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

/** Lebar kolom tersimpan sebagai JSON array angka; `null` berarti rata. */
function parseWidthsAttribute(element: HTMLElement): number[] | null {
	const raw = element.getAttribute('data-widths')
	if (!raw) return null
	try {
		const parsed: unknown = JSON.parse(raw)
		if (!Array.isArray(parsed) || parsed.length === 0) return null
		return parsed.every((value) => typeof value === 'number' && Number.isFinite(value)) ? parsed : null
	} catch {
		return null
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
				// sementara aturan cetak perlu menyalakannya kembali. Celah ikut ke
				// gaya yang sama supaya berlaku juga saat mencetak (§P5).
				renderHTML: (attributes) => ({
					'data-count': attributes.count,
					style: `--columns-count: ${attributes.count}; column-count: ${attributes.count}${
						typeof attributes.gap === 'number' ? `; column-gap: ${attributes.gap}px` : ''
					}`,
				}),
			},
			// Celah antar kolom dalam piksel; `null` berarti ikuti `column-gap`
			// dari CSS (1.5em). Lebar tiap kolom dalam piksel; `null` berarti
			// rata. Keduanya diatur lewat penggaris (§P5).
			gap: {
				default: null,
				parseHTML: parseGapAttribute,
				renderHTML: (attributes) => (attributes.gap === null ? {} : { 'data-gap': attributes.gap }),
			},
			widths: {
				default: null,
				parseHTML: parseWidthsAttribute,
				renderHTML: (attributes) =>
					attributes.widths === null ? {} : { 'data-widths': JSON.stringify(attributes.widths) },
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
			setColumnsLayout:
				(pos, patch) =>
				({ tr, dispatch }) => {
					const node = tr.doc.nodeAt(pos)
					if (!node || node.type.name !== this.name) return false
					if (dispatch) tr.setNodeMarkup(pos, undefined, { ...node.attrs, ...patch })
					return true
				},
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
	 * Sedang ditempatkan selebar pembungkus (kelas `columns-span` masih melekat
	 * di DOM-nya). Keputusan selebar penuh itu lengket: blok yang sama tidak
	 * boleh berayun antara kolom dan petak penuh hanya karena tingginya berubah
	 * setelah melebar (§P4 lapis 3).
	 */
	span?: boolean
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
	/**
	 * Geometri per kolom hasil `resolveColumnSlots` (§P5). Tanpa ini kolom
	 * dianggap rata: lebar `columnWidth`, berjajar mulai dari tepi kiri.
	 */
	columns?: readonly { left: number; width: number }[]
	/**
	 * Puncak area teks lembar PERTAMA region ini pada koordinat render (§P8).
	 * Section yang tidak mulai di puncak dokumen punya batas lembar yang tidak
	 * berlabuh di nol; tanpa nilai ini seluruh batas lembar dihitung dari
	 * kelipatan `pageStride` seperti biasa.
	 */
	sheetOrigin?: number
}

/**
 * Tepi kiri dan lebar tiap kolom, dalam piksel, dari atribut blok (§P5).
 *
 * `widths` tersimpan sebagai piksel saat diseret di penggaris. Bila lebar
 * pembungkus sudah berubah sejak itu - margin lembar digeser - daftarnya
 * dinormalkan ulang secara proporsional supaya jumlahnya tetap pas dengan
 * ruang yang ada, alih-alih meluber atau menyisakan ruang mati.
 */
export function resolveColumnSlots(
	width: number,
	count: number,
	gap: number,
	widths: readonly number[] | null,
): { left: number; width: number }[] {
	const natural = width - gap * (count - 1)
	if (!(natural > 0) || count < 1) return []

	if (!widths || widths.length !== count || widths.some((value) => !(value > 0))) {
		const columnWidth = natural / count
		return Array.from({ length: count }, (_, index) => ({
			left: index * (columnWidth + gap),
			width: columnWidth,
		}))
	}

	const sum = widths.reduce((total, value) => total + value, 0)
	const scale = sum > 0 ? natural / sum : 1
	let left = 0
	return widths.map((value) => {
		const slot = { left, width: value * scale }
		left += slot.width + gap
		return slot
	})
}

export interface ColumnPlacement {
	pos: number
	/** Puncak kotak border, relatif terhadap puncak pembungkus. */
	top: number
	/** Tepi kiri kolom, relatif terhadap tepi kiri pembungkus. */
	left: number
	/** Lebar kolom tempat blok ini ditempatkan. */
	width: number
	/** Pemenggalan tabel di batas lembar; hanya ada pada item bertabel. */
	cuts?: readonly TableCut[]
	/** Ditempatkan selebar pembungkus (§P4 lapis 3), bukan di satu kolom. */
	span?: boolean
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
 * - Blok TAK TERPENGAL yang lebih tinggi dari kolom penuh (gambar sehalaman,
 *   blok kode panjang, paragraf raksasa) naik jadi selebar pembungkus -
 *   `column-span: all` secara logis - alih-alih dibiarkan meluber di satu
 *   kolom (§P4 lapis 3). Aliran kolom berhenti di atasnya dan dilanjutkan di
 *   bawahnya; keputusan ini lengket lewat tanda `span` pada bloknya.
 * - TABEL yang jadi blok raksasa tidak ikut aturan itu: ia dipenggal rapi di
 *   antar baris pada batas lembar - baris kosong pengganjal menyodok sisanya
 *   ke puncak lembar berikutnya dan salinan header membuka tiap potongan
 *   (§P4 lapis 2, lihat `cutTableRows`).
 * - Petak yang masih tertutup luberan (blok selebar penuh yang lebih tinggi
 *   dari lembarnya, potongan tabel) dicatat di `blockedUntil` dan dilewati,
 *   supaya tidak ada blok yang digambar menimpa blok lain (§P4 lapis 1).
 *   Tinggi pembungkus dan `sheetGap` ikut mencakup luberan itu.
 * - Lembar terakhir diseimbangkan, kalau tidak blok pendek akan menumpuk
 *   seluruh isinya di kolom pertama dan menyisakan kolom kedua kosong.
 */
export function flowColumns(
	items: readonly ColumnItem[],
	{ top, count, columnWidth, columnGap, columns, sheetOrigin = 0 }: ColumnFrame,
	{ contentHeight, pageStride }: Pick<PageGeometry, 'contentHeight' | 'pageStride'>,
): ColumnFlow {
	if (items.length === 0 || count < 1 || contentHeight <= 0) {
		return { placements: [], height: 0, sheetGap: 0 }
	}

	const sheetTop = (page: number) => sheetOrigin + page * pageStride
	const sheetBottom = (page: number) => sheetOrigin + page * pageStride + contentHeight

	// Lembar tempat pembungkus mendarat. Bila ia jatuh di celah antar lembar -
	// blok raksasa sebelumnya meluber ke sana - isinya mulai di lembar berikutnya.
	let page = Math.max(0, Math.floor((top - sheetOrigin) / pageStride))
	if (top >= sheetBottom(page)) page += 1

	const firstPage = page
	const firstTop = Math.max(top, sheetTop(firstPage))
	const regionTop = (sheet: number) => (sheet === firstPage ? firstTop : sheetTop(sheet))
	const regionHeight = (sheet: number) => sheetBottom(sheet) - regionTop(sheet)

	const slots: {
		page: number
		column: number
		top: number
		height: number
		cuts?: readonly TableCut[]
		span?: boolean
	}[] = []
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

	/**
	 * Tempatkan satu blok SELEBAR pembungkus (§P4 lapis 3). Ia memutus aliran
	 * kolom: mulai di bawah isi terdalam yang sudah ditempatkan - atau di lembar
	 * berikutnya bila tidak muat di sisa lembarnya - dan aliran kolom dilanjutkan
	 * di bawah ujungnya. Blok yang lebih tinggi dari lembarnya tetap meluber,
	 * tapi sekarang meluber selebar penuh dan seluruh kolom mencatatnya.
	 */
	const placeSpanner = (item: ColumnItem) => {
		let water = firstTop
		for (const slot of slots) water = Math.max(water, slot.top + slot.height)
		for (const until of blockedUntil) water = Math.max(water, until)

		let spanPage = Math.floor(water / pageStride)
		if (water >= sheetBottom(spanPage)) spanPage += 1
		let spanTop = Math.max(water, sheetTop(spanPage))
		if (spanTop + item.height > sheetBottom(spanPage) + 0.5 && spanTop > sheetTop(spanPage) + 0.5) {
			// Tidak muat di sisa lembar ini dan sudah ada isi di atasnya.
			spanPage += 1
			spanTop = sheetTop(spanPage)
		}

		const bottom = spanTop + item.height
		slots.push({ page: spanPage, column: 0, top: spanTop, height: item.height, span: true })
		blockedUntil.fill(bottom)
		page = Math.floor(bottom / pageStride)
		if (bottom >= sheetBottom(page)) page += 1
		column = 0
	}

	let index = 0
	while (index < items.length) {
		// Petak selebar pembungkus memutus aliran kolom; ia tidak pernah masuk
		// perhitungan pengepakan kolom.
		if (items[index].span) {
			placeSpanner(items[index])
			index += 1
			continue
		}

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
			if (!items[index].table) {
				// Blok tak terpenggal yang tidak muat di kolom mana pun: naik
				// selebar pembungkus (§P4 lapis 3).
				placeSpanner(items[index])
				index += 1
				continue
			}
			// Tabel lebih tinggi dari kolom penuh: dipenggal rapi di antar baris
			// (lihat cutTableRows).
			tops = [0]
			giant = true
		}

		for (const [offsetIndex, offset] of tops.entries()) {
			const item = items[index + offsetIndex]
			const slot: (typeof slots)[number] = { page, column, top: base + offset, height: item.height }
			if (giant && item.table) {
				// cutTableRows menghitung batas lembar dari nol; geser ke kerangka
				// origin region ini lalu geser balik hasilnya (§P8).
				const cut = cutTableRows(item.table, slot.top - sheetOrigin, page, { contentHeight, pageStride })
				// Tinggi efektifnya memanjang oleh pengganjal dan salinan header.
				slot.height = cut.bottom + sheetOrigin - slot.top
				if (cut.cuts.length > 0) slot.cuts = cut.cuts
				blockedUntil[column] = cut.bottom + sheetOrigin
			}
			slots.push(slot)
		}
		index += tops.length

		if (index < items.length) advance()
	}

	// Lembar terakhir diseimbangkan supaya kolomnya berakhir sama rata - kecuali
	// bila ada luberan blok raksasa atau petak selebar penuh di lembar itu:
	// mengatur ulang isi di sekitarnya akan membuatnya tertimpa.
	const lastPage = page
	const spillOnLastPage = blockedUntil.some((until) => until > regionTop(lastPage) + 0.5)
	const spanOnLastPage = slots.some((slot) => slot.page === lastPage && slot.span)
	const firstOnLastPage = slots.findIndex((slot) => slot.page === lastPage)
	if (firstOnLastPage >= 0 && !spillOnLastPage && !spanOnLastPage) {
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
			left: columns?.[slots[i].column]?.left ?? slots[i].column * (columnWidth + columnGap),
			width: columns?.[slots[i].column]?.width ?? columnWidth,
			cuts: slots[i].cuts,
			span: slots[i].span,
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
		// Petak selebar pembungkus memutus pengepakan; ia diurus pemanggil.
		if (item.span) break
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

export const columnLayoutKey = new PluginKey<ColumnLayoutState>('columnLayout')

/** Satu blok kolom yang sudah dihitung, siap jadi dekorasi. */
export interface ColumnsPlan {
	pos: number
	nodeSize: number
	height: number
	sheetGap: number
	/** true = rentang section berkolom (§P8); tidak ada node pembungkus. */
	region?: boolean
	items: {
		pos: number
		nodeSize: number
		top: number
		left: number
		right: number
		cuts?: readonly TableCut[]
		span?: boolean
	}[]
}

export interface ColumnLayoutState {
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

export function columnGapOf(dom: HTMLElement): number {
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
 * Dua bentuk kolom ditangani di sini: blok `columns` (pembungkus nyata) dan
 * RENTANG section berkolom (§P8) yang tidak punya pembungkus - bingkai rentang
 * dibaca dari elemen pengganjal ruangnya (lihat `regionSpaceElement`), atau
 * dari blok pertamanya selagi pengganjal itu belum ada.
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

	// Rentang section berkolom; blok di dalamnya bukan milik pembungkus mana pun.
	const setup = paginationKey.getState(view.state)?.setup
	const regions = setup ? columnRegions(view.state.doc, setup) : []
	/** Isi tiap rentang, sejajar dengan `regions`. */
	const regionItems = regions.map(() => ({ items: [] as ColumnItem[], sizes: [] as number[] }))

	view.state.doc.forEach((node, offset) => {
		const regionIndex = regions.findIndex((region) => offset >= region.from && offset < region.to)
		if (regionIndex >= 0) {
			const element = view.nodeDOM(offset)
			if (element instanceof HTMLElement) {
				elements.push(element)
				regionItems[regionIndex].items.push(
					node.type.name === 'table'
						? measureTableItem(view, node, offset, element)
						: {
								pos: offset,
								height: element.offsetHeight,
								...blockMargins(element),
								keepWithNext: KEEP_WITH_NEXT.has(node.type.name),
								span: element.classList.contains('columns-span') || undefined,
							},
				)
				regionItems[regionIndex].sizes.push(node.nodeSize)
			}
			return
		}

		if (node.type.name !== COLUMNS_NODE) return

		const dom = view.nodeDOM(offset)
		if (!(dom instanceof HTMLElement)) return

		const count = Math.max(MIN_COLUMNS, Number(node.attrs.count) || MIN_COLUMNS)
		const width = dom.clientWidth
		// Celah & lebar hasil seretan penggaris menang atas bawaan CSS (§P5).
		const columnGap = typeof node.attrs.gap === 'number' && node.attrs.gap >= 0 ? node.attrs.gap : columnGapOf(dom)
		const slots = resolveColumnSlots(width, count, columnGap, node.attrs.widths ?? null)
		if (slots.length === 0) return

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
								// Keputusan selebar penuh lengket: kelasnya masih melekat
								// dari rencana sebelumnya (§P4 lapis 3).
								span: element.classList.contains('columns-span') || undefined,
							},
				)
				sizes.push(child.nodeSize)
			}
			childPos += child.nodeSize
		})

		if (items.length === 0) return

		const flow = flowColumns(
			items,
			{ top: dom.offsetTop, count, columnWidth: slots[0].width, columnGap, columns: slots },
			geometry,
		)

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
				// Petak selebar pembungkus (§P4 lapis 3): membentang penuh, tanpa
				// mengindahkan kolom.
				left: placement.span ? 0 : placement.left,
				// Lebar diberikan lewat `right`, bukan `width`: dengan begitu blok
				// berindentasi menyempit ke dalam kolomnya alih-alih tumpah keluar.
				right: placement.span ? 0 : width - placement.left - placement.width,
				cuts: placement.cuts,
				span: placement.span || undefined,
			})),
		})
	})

	// Rentang section berkolom (§P8): sama seperti pembungkus, tapi bingkainya
	// adalah pengganjal ruang - dan geometri lembarnya milik section-nya sendiri,
	// bukan geometri dasar.
	regions.forEach((region, regionIndex) => {
		const { items, sizes } = regionItems[regionIndex]
		if (items.length === 0) return

		const columns = region.span.columns
		if (!columns) return
		const count = Math.max(MIN_COLUMNS, columns.count)
		const columnGap = typeof columns.gap === 'number' ? columns.gap : FALLBACK_COLUMN_GAP

		// Bingkai rentang. Pengganjal ruang menjaga ruang aliran rentang dan tidak
		// pernah menyempit, jadi ukurannya stabil; sebelum ia ada (putaran pertama)
		// blok pertama masih mengalir alami dan bisa dijadikan acuan.
		const placeholder = view.dom.querySelector(`[${REGION_SPACE_ATTRIBUTE}="${region.from}"]`)
		const anchor =
			placeholder instanceof HTMLElement
				? placeholder
				: (() => {
						const first = view.nodeDOM(region.from)
						return first instanceof HTMLElement ? first : null
					})()
		if (!anchor) return

		const top = anchor.offsetTop
		const left = anchor.offsetLeft
		const width = anchor.offsetWidth
		const parent = anchor.offsetParent
		const parentWidth = parent instanceof HTMLElement ? parent.clientWidth : left + width
		if (!(width > 0)) return

		const slots = resolveColumnSlots(width, count, columnGap, null)
		if (slots.length === 0) return

		const flow = flowColumns(
			items,
			{
				top,
				count,
				columnWidth: slots[0].width,
				columnGap,
				columns: slots,
				// Section ini mulai di tengah dokumen: batas lembarnya berlabuh di
				// puncak lembar pertamanya, bukan di nol.
				sheetOrigin: top,
			},
			pageGeometry(region.span.setup),
		)

		plans.push({
			pos: region.from,
			nodeSize: 0,
			height: flow.height,
			sheetGap: flow.sheetGap,
			region: true,
			items: flow.placements.map((placement, i) => ({
				pos: placement.pos,
				nodeSize: sizes[i],
				top: top + placement.top - items[i].marginTop,
				left: placement.span ? left : left + placement.left,
				right: placement.span
					? parentWidth - left - width
					: parentWidth - (left + placement.left) - placement.width,
				cuts: placement.cuts,
				span: placement.span || undefined,
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

/**
 * Pengganjal ruang sebuah rentang section berkolom (§P8).
 *
 * Rentang section tidak punya node pembungkus yang tingginya bisa diatur, jadi
 * elemen inilah yang menjaga ruang alirannya: blok-blok rentang diposisikan
 * mutlak, dan isi sesudah rentang mengalir mulai dari bawahnya. Paginasi
 * membacanya sebagai satu blok self-paginate lewat atributnya.
 */
function regionSpaceElement(plan: ColumnsPlan): HTMLElement {
	const element = document.createElement('div')
	element.className = 'columns-region-space'
	element.style.height = `${Math.round(plan.height)}px`
	element.setAttribute(REGION_SPACE_ATTRIBUTE, String(plan.pos))
	element.setAttribute(REGION_SHEET_GAP_ATTRIBUTE, String(Math.round(plan.sheetGap)))
	element.setAttribute('aria-hidden', 'true')
	element.contentEditable = 'false'
	return element
}

function buildDecorations(doc: PMNode, plans: readonly ColumnsPlan[]): DecorationSet {
	const decorations: Decoration[] = []

	for (const plan of plans) {
		if (plan.region) {
			decorations.push(
				Decoration.widget(plan.pos, () => regionSpaceElement(plan), {
					side: -1,
					key: `columns-region-${plan.pos}-${Math.round(plan.height)}`,
				}),
			)
		} else {
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
		}

		for (const item of plan.items) {
			decorations.push(
				Decoration.node(item.pos, item.pos + item.nodeSize, {
					// `columns-span` menandai petak selebar pembungkus; kelasnya
					// dibaca balik saat mengukur supaya keputusan itu lengket.
					class: item.span ? 'columns-item columns-span' : 'columns-item',
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

		// Rentang section membawa celahnya pada atribut pengganjal ruangnya
		// (dibaca paginasi dari sana), bukan sebagai elemen terpisah.
		if (!plan.region && plan.sheetGap > 0.5) {
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
