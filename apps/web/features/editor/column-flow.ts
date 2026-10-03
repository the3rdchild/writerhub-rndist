import type { PageGeometry } from './page-geometry'

/*
 * Mesin aliran kolom - fungsi murni, tanpa DOM.
 *
 * Wilayah berkolom dialirkan seperti Word: isi mengisi kolom pertama sampai
 * dasar area teks, lalu kolom berikutnya, lalu kolom pertama lembar sesudahnya.
 * Paragraf (dan blok lain yang bisa dipecah) dipotong di batas BARIS - bukan
 * dipindah utuh - sehingga kolom tidak menyisakan rongga dan paragraf yang
 * lebih panjang dari satu kolom tetap mengalir di dalam kolom. Di lembar
 * terakhir wilayah, kolomnya diseimbangkan (kecuali wilayahnya ditutup
 * pembatas "next page", persis Word).
 *
 * Pengukuran (tinggi blok, letak baris) ada di `column-measure.ts`; tampilan
 * potongan (blok asli yang dipangkas + salinannya) di `column-render.ts`.
 */

/** Selisih piksel yang dianggap pembulatan, bukan isi yang benar-benar tidak muat. */
const EPSILON = 0.5

export interface ColumnItem {
	pos: number
	/** Tinggi kotak batas blok pada lebar kolomnya. */
	height: number
	marginTop: number
	marginBottom: number
	/** Judul: tidak boleh ditinggal sendirian di dasar kolom. */
	keepWithNext: boolean
	/** Pemenggal halaman (`pageBreak`). */
	isBreak?: boolean
	/** Pindah kolom (`w:br w:type="column"`): lanjut di kolom berikutnya. */
	columnBreak?: boolean
	/**
	 * Titik potong yang sah - jarak dari puncak blok, naik, semuanya di dalam
	 * (0, height). Untuk paragraf: batas antarbaris yang sudah lolos aturan
	 * yatim/janda; untuk tabel: batas antarbaris tabel. Boleh berupa fungsi
	 * supaya baris hanya diukur untuk blok yang benar-benar menyeberangi dasar
	 * kolom. Tanpa titik potong, blok berpindah utuh.
	 */
	cuts?: readonly number[] | (() => readonly number[])
	/** Tinggi salinan baris kepala tabel yang mengawali tiap potongan lanjutan. */
	repeatHeader?: number
}

export interface ColumnSlot {
	left: number
	width: number
}

export interface ColumnFrame {
	/** Puncak wilayah, dalam koordinat badan naskah (`offsetTop`). */
	top: number
	/**
	 * Puncak area teks lembar tempat wilayah dimulai. Batas bawah kolom
	 * dihitung dari sini - bukan dari puncak wilayah, karena wilayah yang mulai
	 * di tengah halaman (judul satu kolom, lalu isi dua kolom) tetap berhenti di
	 * margin bawah lembar yang SAMA (KOL-2).
	 */
	origin: number
	slots: readonly ColumnSlot[]
	/** Seimbangkan tinggi kolom di lembar terakhir wilayah. */
	balance?: boolean
}

export interface ColumnFragment {
	/** Indeks lembar, relatif terhadap lembar `origin`. */
	sheet: number
	column: number
	/** Puncak petak (koordinat badan naskah); salinan kepala tabel, bila ada, menempati bagian atasnya. */
	top: number
	/** Bagian blok yang tampil di petak ini: mulai `offset`, setinggi `height`. */
	offset: number
	height: number
	/** Tinggi salinan kepala tabel di atas potongan lanjutan. */
	header?: number
}

export interface ColumnFlow {
	/** Potongan tiap butir, sejajar dengan `items`; butir utuh punya tepat satu. */
	fragments: ColumnFragment[][]
	/** Tinggi wilayah dari puncaknya sampai dasar isi terdalam. */
	height: number
	/** Ruang non-isi (margin + celah antarlembar) di dalam tinggi wilayah. */
	sheetGap: number
}

/**
 * Lebar & posisi tiap kolom.
 *
 * `gaps` adalah jarak PER CELAH (panjang `count - 1`), bentuk yang dipakai Word
 * lewat `w:col/@w:space`: tiap kolom membawa jarak ke tetangga kanannya
 * sendiri, dan templat berkolom tak-sama hampir selalu memakainya. Tanpa
 * `gaps`, `gap` tunggal berlaku untuk semua celah - perilaku lama.
 */
export function resolveColumnSlots(
	width: number,
	count: number,
	gap: number,
	widths: readonly number[] | null,
	gaps: readonly number[] | null = null,
): ColumnSlot[] {
	const usable = gaps && gaps.length === count - 1 && gaps.every((value) => value >= 0) ? gaps : null
	const gapBefore = (index: number) => (index <= 0 ? 0 : usable ? usable[index - 1] : gap)
	const total = Array.from({ length: count }, (_, index) => gapBefore(index)).reduce((a, b) => a + b, 0)
	const natural = width - total
	if (!(natural > 0) || count < 1) return []

	if (!widths || widths.length !== count || widths.some((value) => !(value > 0))) {
		const columnWidth = natural / count
		let even = 0
		return Array.from({ length: count }, (_, index) => {
			even += gapBefore(index)
			const slot = { left: even, width: columnWidth }
			even += columnWidth
			return slot
		})
	}

	const sum = widths.reduce((total, value) => total + value, 0)
	const scale = sum > 0 ? natural / sum : 1
	let left = 0
	return widths.map((value, index) => {
		left += gapBefore(index)
		const slot = { left, width: value * scale }
		left += slot.width
		return slot
	})
}

/** Posisi baca: butir berikutnya, berapa bagian darinya yang sudah tampil, dan di petak mana. */
interface Cursor {
	index: number
	offset: number
	sheet: number
	column: number
	/** Ujung bawah isi kolom berjalan. */
	y: number
	/** Kolom berjalan belum berisi apa pun. */
	fresh: boolean
	/** Lembar berjalan sudah memuat isi (wilayah ini atau blok di atasnya). */
	sheetUsed: boolean
	/** Margin bawah blok terakhir - digabung dengan margin atas blok berikutnya. */
	marginAbove: number
}

interface Placed {
	index: number
	fragment: ColumnFragment
}

export function flowColumns(
	items: readonly ColumnItem[],
	frame: ColumnFrame,
	{ contentHeight, pageStride }: Pick<PageGeometry, 'contentHeight' | 'pageStride'>,
): ColumnFlow {
	const count = frame.slots.length
	const empty: ColumnFlow = { fragments: items.map(() => []), height: 0, sheetGap: 0 }
	if (items.length === 0 || count < 1 || contentHeight <= 0) return empty

	const sheetTop = (sheet: number) => frame.origin + sheet * pageStride
	const sheetBottom = (sheet: number) => sheetTop(sheet) + contentHeight

	/* Puncak wilayah yang jatuh di margin bawah atau celah antarlembar berarti
	 * isinya baru bisa mulai di lembar berikutnya. */
	let first = 0
	while (frame.top >= sheetBottom(first) - EPSILON) first += 1
	const firstTop = Math.max(frame.top, sheetTop(first))
	const columnTop = (sheet: number) => (sheet === first ? firstTop : sheetTop(sheet))

	const cache = new Map<number, readonly number[]>()
	const cutsOf = (index: number): readonly number[] => {
		const known = cache.get(index)
		if (known) return known
		const source = items[index].cuts
		const list = typeof source === 'function' ? source() : (source ?? [])
		cache.set(index, list)
		return list
	}

	/*
	 * Kolom tak-sama lebar: blok yang dipotong ke kolom yang lebarnya berbeda
	 * akan membungkus barisnya lain, jadi potongan hanya boleh menyeberang ke
	 * kolom selebar asalnya. Di luar itu blok pindah utuh.
	 */
	const nextColumn = (column: number) => (column + 1) % count
	const canContinue = (column: number) =>
		Math.abs(frame.slots[nextColumn(column)].width - frame.slots[column].width) < EPSILON

	const advanceColumn = (cursor: Cursor) => {
		cursor.column += 1
		if (cursor.column >= count) {
			cursor.column = 0
			cursor.sheet += 1
			cursor.sheetUsed = false
		}
		cursor.y = columnTop(cursor.sheet)
		cursor.fresh = true
		cursor.marginAbove = 0
	}
	const advanceSheet = (cursor: Cursor) => {
		cursor.column = 0
		cursor.sheet += 1
		cursor.y = columnTop(cursor.sheet)
		cursor.fresh = true
		cursor.sheetUsed = false
		cursor.marginAbove = 0
	}

	/** Bagian pertama terkecil yang mungkin dari butir ini - untuk uji keepWithNext. */
	const smallestHead = (index: number): number => {
		const item = items[index]
		if (item.isBreak || item.columnBreak) return 0
		const cuts = cutsOf(index)
		return cuts.length > 0 ? Math.min(cuts[0], item.height) : item.height
	}

	/**
	 * Mengalirkan butir dari `start` sampai habis. `bottomOf` memberi dasar
	 * kolom per lembar (penyeimbangan memendekkannya di lembar terakhir);
	 * `lastSheet` membatalkan aliran yang melewatinya. Mengembalikan null bila
	 * dibatalkan.
	 */
	const run = (
		start: Cursor,
		bottomOf: (sheet: number) => number,
		lastSheet: number | null,
		snapshots?: Map<number, Cursor>,
	): Placed[] | null => {
		const cursor = { ...start }
		const placed: Placed[] = []
		const remember = () => {
			if (snapshots && !snapshots.has(cursor.sheet)) snapshots.set(cursor.sheet, { ...cursor })
		}
		const place = (fragment: Omit<ColumnFragment, 'sheet' | 'column'>) =>
			placed.push({
				index: cursor.index,
				fragment: { sheet: cursor.sheet, column: cursor.column, ...fragment },
			})

		remember()
		let guard = 0
		while (cursor.index < items.length) {
			if (lastSheet !== null && cursor.sheet > lastSheet) return null
			guard += 1
			if (guard > items.length * (count + 4) * 64 + 1024) break

			const item = items[cursor.index]
			if (item.isBreak) {
				/*
				 * Pemenggal halaman: isi sesudahnya mulai di kolom pertama lembar
				 * berikutnya - kecuali lembar ini belum memuat apa pun, supaya
				 * pemenggal di awal wilayah atau dua pemenggal beruntun tidak
				 * melahirkan lembar kosong.
				 */
				place({ top: cursor.y, offset: 0, height: 0 })
				cursor.index += 1
				if (cursor.sheetUsed) {
					advanceSheet(cursor)
					remember()
				}
				continue
			}
			if (item.columnBreak) {
				/* Pindah kolom selalu menutup kolom berjalan - kolom kosong pun,
				 * jadi dua pemenggal beruntun melompati satu kolom penuh (Word). */
				place({ top: cursor.y, offset: 0, height: 0 })
				cursor.index += 1
				advanceColumn(cursor)
				remember()
				continue
			}

			const bottom = bottomOf(cursor.sheet)
			const continuing = cursor.offset > 0
			const header = continuing ? (item.repeatHeader ?? 0) : 0
			const spacing = cursor.fresh || continuing ? 0 : Math.max(cursor.marginAbove, item.marginTop)
			const top = cursor.y + spacing
			const rest = item.height - cursor.offset
			const room = bottom - top - header

			if (rest <= room + EPSILON) {
				const next = cursor.index + 1 < items.length ? cursor.index + 1 : -1
				if (!continuing && item.keepWithNext && !cursor.fresh && next >= 0) {
					const nextTop = top + rest + Math.max(item.marginBottom, items[next].marginTop)
					if (nextTop + smallestHead(next) > bottom + EPSILON) {
						advanceColumn(cursor)
						remember()
						continue
					}
				}
				place({ top, offset: cursor.offset, height: rest, ...(header > 0 ? { header } : {}) })
				cursor.y = top + header + rest
				cursor.fresh = false
				cursor.sheetUsed = true
				cursor.marginAbove = item.marginBottom
				cursor.index += 1
				cursor.offset = 0
				continue
			}

			const cuts = canContinue(cursor.column) ? cutsOf(cursor.index) : []
			let fitting: number | undefined
			for (const cut of cuts) {
				if (cut <= cursor.offset + EPSILON) continue
				if (cut - cursor.offset > room + EPSILON) break
				fitting = cut
			}
			if (fitting !== undefined) {
				place({
					top,
					offset: cursor.offset,
					height: fitting - cursor.offset,
					...(header > 0 ? { header } : {}),
				})
				cursor.offset = fitting
				cursor.sheetUsed = true
				advanceColumn(cursor)
				remember()
				continue
			}

			if (!cursor.fresh) {
				advanceColumn(cursor)
				remember()
				continue
			}

			/*
			 * Bahkan kolom kosong tidak cukup untuk bagian pertamanya: blok
			 * tak terpenggal yang lebih tinggi dari kolom (gambar raksasa), atau
			 * potongan pertama yang sudah lebih tinggi dari kolom. Ia ditaruh di
			 * puncak kolom dan dibiarkan meluber - seperti paginasi satu kolom -
			 * lalu sisanya (bila bisa dipotong) lanjut di kolom berikutnya.
			 */
			const nextCut = cuts.find((cut) => cut > cursor.offset + EPSILON)
			if (nextCut !== undefined) {
				place({
					top,
					offset: cursor.offset,
					height: nextCut - cursor.offset,
					...(header > 0 ? { header } : {}),
				})
				cursor.offset = nextCut
				cursor.sheetUsed = true
				advanceColumn(cursor)
				remember()
				continue
			}
			place({ top, offset: cursor.offset, height: rest, ...(header > 0 ? { header } : {}) })
			cursor.y = top + header + rest
			cursor.fresh = false
			cursor.sheetUsed = true
			cursor.marginAbove = item.marginBottom
			cursor.index += 1
			cursor.offset = 0
		}
		return placed
	}

	const startCursor: Cursor = {
		index: 0,
		offset: 0,
		sheet: first,
		column: 0,
		y: firstTop,
		fresh: true,
		/* Wilayah yang mulai di tengah lembar berbagi lembar itu dengan isi di
		 * atasnya: pemenggal halaman di awal wilayah tetap memenggal. */
		sheetUsed: firstTop > sheetTop(first) + EPSILON,
		marginAbove: 0,
	}
	const snapshots = new Map<number, Cursor>()
	let placed = run(startCursor, sheetBottom, null, snapshots) ?? []

	let lastSheet = first
	for (const entry of placed) {
		if (entry.fragment.height > 0 || entry.fragment.header)
			lastSheet = Math.max(lastSheet, entry.fragment.sheet)
	}

	/*
	 * Penyeimbangan: tinggi kolom terkecil yang masih memuat seluruh isi lembar
	 * terakhir. Dicari biner per piksel; tiap percobaan memakai aliran yang sama,
	 * jadi pemotongan baris, pindah kolom, dan keepWithNext tetap berlaku.
	 */
	const balanceStart = snapshots.get(lastSheet)
	if (frame.balance && balanceStart && count > 1) {
		const top = columnTop(lastSheet)
		const full = sheetBottom(lastSheet) - top
		const attempt = (height: number) =>
			run(balanceStart, (sheet) => (sheet === lastSheet ? top + height : sheetBottom(sheet)), lastSheet)
		let best = attempt(full)
		if (best) {
			let low = 0
			let high = full
			while (high - low > 1) {
				const middle = (low + high) / 2
				const trial = attempt(middle)
				if (trial) {
					best = trial
					high = middle
				} else {
					low = middle
				}
			}
			const before = placed.filter(
				(entry) =>
					entry.index < balanceStart.index ||
					(entry.index === balanceStart.index && entry.fragment.offset < balanceStart.offset),
			)
			placed = [...before, ...best]
		}
	}

	const fragments: ColumnFragment[][] = items.map(() => [])
	for (const entry of placed) fragments[entry.index].push(entry.fragment)

	let bottom = firstTop
	for (const entry of placed) {
		bottom = Math.max(bottom, entry.fragment.top + (entry.fragment.header ?? 0) + entry.fragment.height)
	}
	const crossings = Math.max(0, Math.ceil((bottom - sheetBottom(first)) / pageStride))

	return {
		fragments,
		height: Math.max(0, bottom - frame.top),
		sheetGap: firstTop - frame.top + crossings * (pageStride - contentHeight),
	}
}
