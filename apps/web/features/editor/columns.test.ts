import { describe, expect, test } from 'bun:test'
import { flowColumns, type ColumnItem } from './columns'
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

describe('blok raksasa (§P4 lapis 1)', () => {
	test('blok yang lebih tinggi dari kolom penuh tetap ditempatkan, bukan hilang', () => {
		const items = blocks([contentHeight + 400])
		const { placements, height } = flow(items)

		expect(placements).toHaveLength(1)
		expect(placements[0].top).toBe(0)
		expect(height).toBe(contentHeight + 400)
	})

	test('blok sesudahnya tidak menimpa luberannya di kolom yang sama', () => {
		// Tabel raksasa setinggi 1,4 kolom di kolom pertama, diikuti blok biasa
		// yang memenuhi kolom kedua: dulu blok berikutnya ditaruh di puncak
		// lembar kedua - tepat di atas luberan.
		const giant = contentHeight + 400
		const items = blocks([giant, ...Array.from({ length: 10 }, () => 100)])
		const boxes = rendered(items)

		expect(boxes[0]).toMatchObject({ column: 0, top: 0, bottom: giant })
		expect(boxes[1]).toMatchObject({ column: 1, top: 0 })
		// Kolom 0 lembar kedua dimulai DI BAWAH ujung luberan, bukan di puncak lembar.
		const next = boxes[boxes.length - 1]
		expect(next.column).toBe(0)
		expect(next.top).toBeGreaterThanOrEqual(giant)
	})

	test('tinggi pembungkus dan celah lembar mencakup luberan', () => {
		const giant = contentHeight + 400
		const { height, sheetGap } = flow(blocks([giant, ...Array.from({ length: 10 }, () => 100)]))

		// Blok terakhir berakhir di lembar kedua; satu celah antar lembar dilompati.
		expect(height).toBeGreaterThanOrEqual(giant + 100)
		expect(sheetGap).toBe(pageStride - contentHeight)
	})

	test('luberan yang makan lebih dari satu lembar melompati semuanya', () => {
		const giant = contentHeight + 2 * pageStride
		const items = blocks([giant, 100])
		const boxes = rendered(items)

		expect(boxes[1].column).toBe(1)
		// Kolom 1 lembar pertama tidak tertutup luberan kolom 0, jadi boleh dipakai.
		expect(boxes[1].top).toBe(0)
		expect(flow(items).sheetGap).toBe(2 * (pageStride - contentHeight))
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

describe('invarian: tidak ada dua blok yang bertumpang tindih di kolom yang sama', () => {
	/** Puncak/ujung tiap blok pada koordinat render, per kolom. */
	function boxesByColumn(items: ColumnItem[], top: number, count: number) {
		const byColumn = new Map<number, { top: number; bottom: number }[]>()
		for (const box of rendered(items, top, count)) {
			const list = byColumn.get(box.column) ?? []
			list.push({ top: box.top, bottom: box.bottom })
			byColumn.set(box.column, list)
		}
		return byColumn
	}

	function expectNoOverlap(items: ColumnItem[], top: number, count: number) {
		for (const boxes of boxesByColumn(items, top, count).values()) {
			for (let i = 0; i < boxes.length; i++) {
				for (let j = i + 1; j < boxes.length; j++) {
					const overlap = Math.min(boxes[i].bottom, boxes[j].bottom) - Math.max(boxes[i].top, boxes[j].top)
					expect(overlap).toBeLessThanOrEqual(0.5)
				}
			}
		}
	}

	const GIANT = Math.round(contentHeight * 1.5)
	const SMALL = 120

	for (const count of [1, 2, 3]) {
		for (const top of [0, 400]) {
			test(`${count} kolom, raksasa di awal, mulai di y=${top}`, () => {
				const items = blocks([GIANT, ...Array.from({ length: 20 }, () => SMALL)])
				expectNoOverlap(items, top, count)
			})

			test(`${count} kolom, raksasa di tengah, mulai di y=${top}`, () => {
				const items = blocks([
					...Array.from({ length: 8 }, () => SMALL),
					GIANT,
					...Array.from({ length: 12 }, () => SMALL),
				])
				expectNoOverlap(items, top, count)
			})

			test(`${count} kolom, raksasa di akhir, mulai di y=${top}`, () => {
				const items = blocks([...Array.from({ length: 20 }, () => SMALL), GIANT])
				expectNoOverlap(items, top, count)
			})
		}
	}

	test('pembungkus menutupi seluruh isinya, termasuk luberan', () => {
		const items = blocks([GIANT, ...Array.from({ length: 20 }, () => SMALL)])
		const { placements, height } = flow(items, 0, 2)
		for (const [index, placement] of placements.entries()) {
			expect(placement.top + items[index].height).toBeLessThanOrEqual(height + 0.5)
		}
	})
})

describe('daftar kosong', () => {
	test('tidak menghasilkan apa-apa', () => {
		expect(flow([])).toEqual({ placements: [], height: 0, sheetGap: 0 })
	})
})
