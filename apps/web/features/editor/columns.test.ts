import { describe, expect, test } from 'bun:test'
import { collapsedMargin, flowColumns, type ColumnItem } from './columns'
import { pageGeometry } from './page-geometry'

/**
 * Pembagian isi ke petak (lembar, kolom) diuji tanpa DOM: `flowColumns`
 * menerima tinggi tiap blok dan mengembalikan posisinya, jadi seluruh
 * perilakunya bisa diperiksa dengan angka.
 *
 * Yang dijaga di sini satu hal di atas segalanya: tidak ada blok yang boleh
 * berakhir di bawah batas area teks lembarnya. Itulah kerusakan yang membuat
 * jurnal dua kolom terbaca menembus celah antar halaman.
 */

const geometry = pageGeometry() // A4, margin 1 inci
const { contentHeight, pageStride } = geometry

const COLUMN_WIDTH = 300
const COLUMN_GAP = 24

/** Kolom ke berapa sebuah penempatan berada, dibaca balik dari `left`. */
function columnOf(left: number): number {
	return Math.round(left / (COLUMN_WIDTH + COLUMN_GAP))
}

function blocks(heights: number[], keepWithNext: number[] = []): ColumnItem[] {
	return heights.map((height, index) => ({
		pos: index,
		height,
		marginTop: 0,
		marginBottom: 0,
		keepWithNext: keepWithNext.includes(index),
	}))
}

function flow(items: ColumnItem[], top = 0, count = 2) {
	return flowColumns(items, { top, count, columnWidth: COLUMN_WIDTH, columnGap: COLUMN_GAP }, geometry)
}

/** Tiap blok, pada koordinat render - persis yang dilihat pembaca. */
function rendered(items: ColumnItem[], top = 0, count = 2) {
	const { placements } = flow(items, top, count)
	return placements.map((placement, index) => ({
		column: columnOf(placement.left),
		top: top + placement.top,
		bottom: top + placement.top + items[index].height,
	}))
}

describe('isi yang muat satu lembar', () => {
	test('dibagi rata ke semua kolom, bukan ditumpuk di kolom pertama', () => {
		const items = blocks([100, 100, 100, 100])
		const boxes = rendered(items)

		expect(boxes.map((box) => box.column)).toEqual([0, 0, 1, 1])
		expect(boxes.map((box) => box.top)).toEqual([0, 100, 0, 100])
	})

	test('tiga kolom pun terbagi rata', () => {
		const boxes = rendered(blocks([100, 100, 100, 100, 100, 100]), 0, 3)
		expect(boxes.map((box) => box.column)).toEqual([0, 0, 1, 1, 2, 2])
	})

	test('blok yang mulai di tengah halaman: kolomnya berjajar mulai dari situ', () => {
		const boxes = rendered(blocks([100, 100, 100]), 400)

		expect(boxes[0].top).toBe(400)
		expect(boxes.find((box) => box.column === 1)?.top).toBe(400)
	})

	test('tidak melompati lembar, jadi tidak ada celah yang dilaporkan', () => {
		expect(flow(blocks([100, 100])).sheetGap).toBe(0)
	})
})

describe('isi lebih panjang dari satu lembar', () => {
	const items = blocks(Array.from({ length: 30 }, () => 100))

	test('tidak ada satu blok pun yang menembus batas area teks', () => {
		for (const box of rendered(items)) {
			const sheet = Math.floor(box.top / pageStride)
			expect(box.bottom).toBeLessThanOrEqual(sheet * pageStride + contentHeight)
		}
	})

	test('tiap kolom baru mulai tepat di puncak area teks lembarnya', () => {
		for (const box of rendered(items)) {
			const sheet = Math.floor(box.top / pageStride)
			if (box.top % pageStride !== 0) continue
			expect(box.top).toBe(sheet * pageStride)
		}
	})

	test('celah antar lembar yang dilompati dilaporkan ke paginasi', () => {
		// 30 blok 100px pada dua kolom: lembar pertama menampung 18, sisanya turun
		// ke lembar kedua - satu kali pindah lembar.
		expect(flow(items).sheetGap).toBe(pageStride - contentHeight)
	})

	test('tinggi pembungkus berhenti di ujung isi lembar terakhir', () => {
		const { height, placements } = flow(items)
		const last = placements[placements.length - 1]
		expect(height).toBeGreaterThanOrEqual(last.top + 100)
	})
})

describe('judul di kaki kolom', () => {
	test('ikut turun bersama isinya, tidak ditinggal sendirian', () => {
		// Sembilan blok 100px menyisakan 31px di kolom pertama - cukup untuk judul
		// 30px, tapi tidak untuk paragraf sesudahnya.
		const heights = [...Array.from({ length: 9 }, () => 100), 30, ...Array.from({ length: 12 }, () => 100)]
		const boxes = rendered(blocks(heights, [9]))

		expect(boxes[9].column).toBe(1)
		expect(boxes[10].column).toBe(1)
		expect(boxes[9].top).toBe(0)
	})
})

describe('batasan yang diketahui', () => {
	test('blok yang lebih tinggi dari kolom penuh tetap ditempatkan, bukan hilang', () => {
		const items = blocks([contentHeight + 400])
		const { placements, height } = flow(items)

		expect(placements).toHaveLength(1)
		expect(placements[0].top).toBe(0)
		expect(height).toBe(contentHeight + 400)
	})

	test('pembungkus yang mendarat di celah antar lembar mulai di lembar berikutnya', () => {
		// Blok raksasa sebelumnya meluber sampai ke celah; isinya tidak boleh
		// mulai di ruang mati itu.
		const top = contentHeight + 40
		const boxes = rendered(blocks([100, 100]), top)

		expect(boxes[0].top).toBe(pageStride)
		expect(flow(blocks([100, 100]), top).sheetGap).toBe(pageStride - top)
	})
})

describe('daftar kosong', () => {
	test('tidak menghasilkan apa-apa', () => {
		expect(flow([])).toEqual({ placements: [], height: 0, sheetGap: 0 })
	})
})

describe('penggabungan margin (§P4 catatan pengukuran, A-2)', () => {
	test('DOM terluar yang punya margin sendiri memakai miliknya', () => {
		// Blok kode (margin: 1em 0 di pembungkusnya) dan TOC (my-3).
		expect(collapsedMargin(16, 0, 0, 12)).toBe(16)
	})

	test('tableWrapper tanpa margin membaca margin <table> di dalamnya', () => {
		expect(collapsedMargin(0, 0, 0, 12)).toBe(12)
	})

	test('margin anak tidak dibaca bila ada padding - ia tidak menggabung keluar', () => {
		// Dengan padding, margin anak tetap di dalam dan sudah termasuk
		// offsetHeight; membacanya lagi menghitung jarak yang sama dua kali.
		expect(collapsedMargin(0, 8, 0, 12)).toBe(0)
	})

	test('margin anak tidak dibaca bila ada border', () => {
		expect(collapsedMargin(0, 0, 1, 12)).toBe(0)
	})
})
