import { describe, expect, test } from 'bun:test'
import { collapsedMargin, cutTableRows, flowColumns, resolveColumnSlots, type ColumnItem } from './columns'
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

/** Tabel sebagai deret baris; `header: true` menjadikan baris pertama header ulangan. */
function tableItem(heights: number[], opts: { header?: boolean; pos?: number } = {}): ColumnItem {
	let top = 0
	const rows = heights.map((height, index) => {
		const row = { pos: (opts.pos ?? 0) * 1000 + index + 1, top, height }
		top += height
		return row
	})
	return {
		pos: opts.pos ?? 0,
		height: top,
		marginTop: 0,
		marginBottom: 0,
		keepWithNext: false,
		table: {
			rows,
			columns: 2,
			header: opts.header && rows.length > 0 ? { pos: rows[0].pos, height: rows[0].height } : undefined,
		},
	}
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
		span: placement.span ?? false,
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

	test('blok sesudahnya dilanjutkan di bawah ujung petak penuhnya', () => {
		// Paragraf raksasa setinggi 1,4 kolom: sejak lapis 3 ia naik selebar
		// pembungkus, dan seluruh kolom mencatat ujungnya.
		const giant = contentHeight + 400
		const items = blocks([giant, ...Array.from({ length: 10 }, () => 100)])
		const boxes = rendered(items)

		expect(boxes[0]).toMatchObject({ top: 0, bottom: giant, span: true })
		expect(boxes[1].top).toBeGreaterThanOrEqual(giant)
	})

	test('tinggi pembungkus dan celah lembar mencakup luberan', () => {
		const giant = contentHeight + 400
		const { height, sheetGap } = flow(blocks([giant, ...Array.from({ length: 10 }, () => 100)]))

		// Blok terakhir berakhir di lembar kedua; satu celah antar lembar dilompati.
		expect(height).toBeGreaterThanOrEqual(giant + 100)
		expect(sheetGap).toBe(pageStride - contentHeight)
	})

	test('luberan petak penuh yang makan lebih dari satu lembar melompati semuanya', () => {
		const giant = contentHeight + 2 * pageStride
		const items = blocks([giant, 100])
		const boxes = rendered(items)

		// Petak penuhnya meluber selebar lembar; blok berikutnya mulai di lembar
		// bersih pertama di bawah ujungnya.
		expect(boxes[0].span).toBe(true)
		expect(boxes[1].top).toBeGreaterThanOrEqual(giant)
		// Ujung isi berakhir di lembar keempat: tiga celah dilompati.
		expect(flow(items).sheetGap).toBe(3 * (pageStride - contentHeight))
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
			// Petak selebar pembungkus menempati SEMUA kolom sekaligus.
			const columns = box.span ? Array.from({ length: count }, (_, i) => i) : [box.column]
			for (const column of columns) {
				const list = byColumn.get(column) ?? []
				list.push({ top: box.top, bottom: box.bottom })
				byColumn.set(column, list)
			}
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


describe('tabel dipenggal antar baris (§P4 lapis 2)', () => {
	describe('cutTableRows', () => {
		const geo = { contentHeight, pageStride }

		test('baris yang muat mengisi lembar, sisanya disodok ke lembar berikutnya', () => {
			// 12 baris 100px: 9 muat di lembar pertama (900 dari 931), baris ke-10
			// disodok pengganjal 255px ke puncak lembar kedua.
			const table = tableItem(Array.from({ length: 12 }, () => 100)).table!
			const { cuts, bottom } = cutTableRows(table, 0, 0, geo)

			expect(cuts).toHaveLength(1)
			expect(cuts[0].pos).toBe(table.rows[9].pos)
			expect(cuts[0].spacerHeight).toBe(pageStride - 900)
			expect(cuts[0].headerHeight).toBe(0)
			// Baris terakhir berakhir di 1155 + 300.
			expect(bottom).toBe(pageStride + 300)
		})

		test('salinan header ikut memakan ruang di puncak tiap potongan', () => {
			const table = tableItem([40, ...Array.from({ length: 14 }, () => 100)], { header: true }).table!
			const { cuts } = cutTableRows(table, 0, 0, geo)

			expect(cuts).toHaveLength(1)
			expect(cuts[0].headerHeight).toBe(40)
			expect(cuts[0].headerPos).toBe(table.rows[0].pos)
			// Pengganjal menjangkau dari ujung baris terakhir yang muat ke puncak
			// lembar berikutnya; baris lanjutan mulai 40px di bawahnya (header).
			expect(cuts[0].spacerHeight).toBe(pageStride - 840)
		})

		test('tabel yang menyeberangi banyak lembar dipotong di tiap batasnya', () => {
			const table = tableItem(Array.from({ length: 25 }, () => 100)).table!
			const { cuts, bottom } = cutTableRows(table, 0, 0, geo)

			expect(cuts).toHaveLength(2)
			expect(cuts[0].pos).toBe(table.rows[9].pos)
			expect(cuts[1].pos).toBe(table.rows[18].pos)
			expect(bottom).toBe(2 * pageStride + 700)
		})

		test('satu baris yang lebih tinggi dari lembar dibiarkan meluber, tanpa potongan', () => {
			const table = tableItem([2000]).table!
			const { cuts, bottom } = cutTableRows(table, 0, 0, geo)

			expect(cuts).toHaveLength(0)
			expect(bottom).toBe(2000)
		})

		test('baris sesudah baris raksasa tetap dipotong rapi di batas lembar', () => {
			// Baris pertama meluber sampai tengah lembar kedua (0..2000); baris
			// berikutnya tidak muat di sisa 86px dan disodok ke lembar ketiga.
			const table = tableItem([2000, 100, 100]).table!
			const { cuts, bottom } = cutTableRows(table, 0, 0, geo)

			expect(cuts).toHaveLength(1)
			expect(cuts[0].pos).toBe(table.rows[1].pos)
			expect(cuts[0].spacerHeight).toBe(2 * pageStride - 2000)
			expect(bottom).toBe(2 * pageStride + 200)
		})

		test('tabel yang muat di kolomnya tidak dipotong sama sekali', () => {
			const table = tableItem(Array.from({ length: 5 }, () => 100)).table!
			const { cuts } = cutTableRows(table, 0, 0, geo)
			expect(cuts).toHaveLength(0)
		})
	})

	describe('di dalam flowColumns', () => {
		test('tabel raksasa mendapat potongan, bukan luberan buta', () => {
			const items = [tableItem(Array.from({ length: 20 }, () => 100)), ...blocks([120, 120])]
			const { placements, height, sheetGap } = flow(items)

			const table = placements[0]
			expect(table.cuts).toHaveLength(2)
			// Ujung tabel (2310 + 200) ikut tertutup pembungkus dan terhitung celahnya.
			expect(height).toBeGreaterThanOrEqual(2 * pageStride + 200)
			expect(sheetGap).toBe(2 * (pageStride - contentHeight))
		})

		test('blok sesudah tabel terpenggal tidak menimpa potongannya', () => {
			// Satu kolom: seluruh blok sesudah tabel harus mulai di bawah ujung
			// potongannya yang sebenarnya (1155 + 2 pengganjal + sisa baris).
			const items = [
				tableItem(Array.from({ length: 20 }, () => 100)),
				...blocks(Array.from({ length: 10 }, () => 120)),
			]
			const boxes = rendered(items, 0, 1)
			const tableBottom = cutTableRows(items[0].table!, boxes[0].top, 0, { contentHeight, pageStride }).bottom

			for (const box of boxes.slice(1)) {
				expect(box.top).toBeGreaterThanOrEqual(tableBottom)
			}
		})

		test('tabel yang muat di satu kolom mengalir seperti blok biasa', () => {
			const items = [blocks([100])[0], tableItem(Array.from({ length: 4 }, () => 100)), blocks([100])[0]]
			const { placements } = flow(items)

			// Lembar terakhir diseimbangkan: tabel tetap utuh di kolom pertama,
			// tepat di bawah blok pertama.
			expect(placements[1].cuts).toBeUndefined()
			expect(placements[1].top).toBe(100)
		})

		test('invarian anti-tumpang-tindih tetap berlaku dengan tabel terpenggal', () => {
			for (const count of [1, 2, 3]) {
				const items = [
					...blocks(Array.from({ length: 4 }, () => 120)),
					tableItem(Array.from({ length: 20 }, () => 100), { pos: 1 }),
					...blocks(Array.from({ length: 12 }, () => 120)),
				]
				const { placements } = flow(items, 0, count)
				const byColumn = new Map<number, { top: number; bottom: number }[]>()
				placements.forEach((placement, index) => {
					const top = placement.top
					// Tabel terpenggal: ujung efektifnya dihitung dari potongannya.
					const bottom = placement.cuts?.length
						? cutTableRows(items[index].table!, top, Math.floor(top / pageStride), { contentHeight, pageStride }).bottom
						: top + items[index].height
					const list = byColumn.get(columnOf(placement.left)) ?? []
					list.push({ top, bottom })
					byColumn.set(columnOf(placement.left), list)
				})
				for (const boxes of byColumn.values()) {
					for (let i = 0; i < boxes.length; i++) {
						for (let j = i + 1; j < boxes.length; j++) {
							const overlap = Math.min(boxes[i].bottom, boxes[j].bottom) - Math.max(boxes[i].top, boxes[j].top)
							expect(overlap).toBeLessThanOrEqual(0.5)
						}
					}
				}
			}
		})
	})
})

describe('blok tak terpenggal naik selebar penuh (§P4 lapis 3)', () => {
	/** Blok bertanda span lengket, sebagaimana dibaca balik dari kelas DOM-nya. */
	function spanBlock(height: number): ColumnItem {
		return { ...blocks([height])[0], span: true }
	}

	test('blok raksasa baru ditempatkan selebar pembungkus, bukan meluber di satu kolom', () => {
		const items = blocks([contentHeight + 100, ...Array.from({ length: 6 }, () => 120)])
		const { placements } = flow(items)

		expect(placements[0].span).toBe(true)
		expect(placements[0].left).toBe(0)
		expect(placements[0].top).toBe(0)
		// Aliran kolom dilanjutkan DI BAWAH ujungnya, bukan di kolom sebelah.
		expect(placements[1].top).toBeGreaterThanOrEqual(contentHeight + 100)
	})

	test('keputusan selebar penuh lengket: blok bertanda span tetap penuh walau muat di kolom', () => {
		const items = [spanBlock(100), ...blocks(Array.from({ length: 4 }, () => 100))]
		const { placements } = flow(items)

		expect(placements[0].span).toBe(true)
		expect(placements[0].left).toBe(0)
		expect(placements[1].top).toBe(100)
	})

	test('petak penuh yang muat di sisa lembar ditaruh di bawah isi terdalam', () => {
		const items = [...blocks(Array.from({ length: 4 }, () => 120)), spanBlock(300)]
		const { placements } = flow(items)

		// 480 + 300 masih di dalam lembar pertama.
		expect(placements[4].span).toBe(true)
		expect(placements[4].top).toBe(480)
	})

	test('petak penuh yang tidak muat di sisa lembar turun ke lembar berikutnya', () => {
		const items = [...blocks(Array.from({ length: 4 }, () => 120)), spanBlock(800), ...blocks([120, 120])]
		const { placements } = flow(items)

		// 480 + 800 melewati area teks lembar pertama (931).
		expect(placements[4].top).toBe(pageStride)
		// Aliran kolom dilanjutkan di bawah ujungnya pada lembar yang sama.
		expect(placements[5].top).toBeGreaterThanOrEqual(pageStride + 800)
	})

	test('penyeimbangan lembar terakhir dilewati bila ada petak penuh di lembar itu', () => {
		const items = [...blocks([100, 100]), spanBlock(300), ...blocks([100, 100])]
		const { placements } = flow(items)

		// Rakus, bukan seimbang: dua blok terakhir tetap berurutan di kolom pertama.
		expect(placements[2].top).toBe(200)
		expect(placements[3].top).toBe(500)
		expect(placements[4].top).toBe(600)
	})

	test('invarian anti-tumpang-tindih berlaku juga di sekitar petak penuh', () => {
		for (const count of [1, 2, 3]) {
			const items = [
				...blocks(Array.from({ length: 3 }, () => 100)),
				spanBlock(400),
				...blocks(Array.from({ length: 3 }, () => 100)),
				spanBlock(400),
				...blocks(Array.from({ length: 6 }, () => 100)),
			]
			const boxes = rendered(items, 0, count)
			for (let i = 0; i < boxes.length; i++) {
				for (let j = i + 1; j < boxes.length; j++) {
					// Petak penuh bertabrakan dengan segalanya; blok biasa hanya dengan
					// sesama kolomnya.
					if (!boxes[i].span && !boxes[j].span && boxes[i].column !== boxes[j].column) continue
					const overlap = Math.min(boxes[i].bottom, boxes[j].bottom) - Math.max(boxes[i].top, boxes[j].top)
					expect(overlap).toBeLessThanOrEqual(0.5)
				}
			}
		}
	})
})

describe('geometri kolom dari atribut (§P5)', () => {
	describe('resolveColumnSlots', () => {
		test('tanpa atribut widths, kolom rata', () => {
			expect(resolveColumnSlots(648, 2, 24, null)).toEqual([
				{ left: 0, width: 312 },
				{ left: 336, width: 312 },
			])
		})

		test('widths tersimpan dipakai apa adanya bila lebarnya masih pas', () => {
			expect(resolveColumnSlots(648, 2, 24, [212, 412])).toEqual([
				{ left: 0, width: 212 },
				{ left: 236, width: 412 },
			])
		})

		test('widths yang tidak lagi pas dinormalkan proporsional', () => {
			// Diseret saat pembungkus selebar 1248px; margin lalu diperlebar
			// sehingga ruang tersisa 648px - proporsinya harus bertahan.
			const slots = resolveColumnSlots(648, 2, 24, [400, 800])
			expect(slots[0].width / slots[1].width).toBeCloseTo(0.5)
			expect(slots[1].left + slots[1].width).toBeCloseTo(648)
		})

		test('widths yang tidak sah kembali ke rata', () => {
			const equal = resolveColumnSlots(648, 2, 24, null)
			expect(resolveColumnSlots(648, 2, 24, [100])).toEqual(equal)
			expect(resolveColumnSlots(648, 2, 24, [100, 0])).toEqual(equal)
		})
	})

	describe('flowColumns dengan lebar tak sama', () => {
		test('penempatan mengikuti tepi dan lebar tiap kolom', () => {
			const columns = [
				{ left: 0, width: 212 },
				{ left: 236, width: 412 },
			]
			const { placements } = flowColumns(
				blocks([100, 100, 100, 100]),
				{ top: 0, count: 2, columnWidth: 212, columnGap: 24, columns },
				geometry,
			)

			// Lembar terakhir diseimbangkan: dua blok per kolom.
			expect(placements[0]).toMatchObject({ left: 0, width: 212, top: 0 })
			expect(placements[2]).toMatchObject({ left: 236, width: 412, top: 0 })
		})
	})
})