import { describe, expect, test } from 'bun:test'
import type { JSONContent } from '@tiptap/core'
import { EditorState } from '@tiptap/pm/state'
import { buildSchema } from '@/features/sync/serialize'
import {
	collapsedMargin,
	cutTableRows,
	flowColumns,
	migrateLegacyColumns,
	resolveColumnSlots,
	type ColumnItem,
} from './columns'
import { pageGeometry } from './page-geometry'
const geometry = pageGeometry() // A4, margin 1 inci
const { contentHeight, pageStride } = geometry

const COLUMN_WIDTH = 300
const COLUMN_GAP = 24

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

function rendered(items: ColumnItem[], top = 0, count = 2) {
	const { placements } = flow(items, top, count)
	return placements.map((placement, index) => ({
		column: columnOf(placement.left),
		top: top + placement.top,
		bottom: top + placement.top + items[index].height,
		span: placement.span ?? false,
	}))
}

function expectNoEmptySheet(boxes: ReturnType<typeof rendered>) {
	const occupied = new Set<number>()
	for (const box of boxes) {
		if (box.bottom - box.top <= 0) continue
		occupied.add(Math.floor(box.top / pageStride))
	}
	const pages = [...occupied].sort((a, b) => a - b)
	for (let page = pages[0]; page <= pages[pages.length - 1]; page += 1) {
		expect(occupied).toContain(page)
	}
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
		const giant = contentHeight + 400
		const items = blocks([giant, ...Array.from({ length: 10 }, () => 100)])
		const boxes = rendered(items)

		expect(boxes[0]).toMatchObject({ top: 0, bottom: giant, span: true })
		expect(boxes[1].top).toBeGreaterThanOrEqual(giant)
	})

	test('tinggi pembungkus dan celah lembar mencakup luberan', () => {
		const giant = contentHeight + 400
		const { height, sheetGap } = flow(blocks([giant, ...Array.from({ length: 10 }, () => 100)]))
		expect(height).toBeGreaterThanOrEqual(giant + 100)
		expect(sheetGap).toBe(pageStride - contentHeight)
	})

	test('luberan petak penuh yang makan lebih dari satu lembar melompati semuanya', () => {
		const giant = contentHeight + 2 * pageStride
		const items = blocks([giant, 100])
		const boxes = rendered(items)
		expect(boxes[0].span).toBe(true)
		expect(boxes[1].top).toBeGreaterThanOrEqual(giant)
		expect(flow(items).sheetGap).toBe(3 * (pageStride - contentHeight))
	})

	test('pembungkus yang mendarat di celah antar lembar mulai di lembar berikutnya', () => {
		const top = contentHeight + 40
		const boxes = rendered(blocks([100, 100]), top)

		expect(boxes[0].top).toBe(pageStride)
		expect(flow(blocks([100, 100]), top).sheetGap).toBe(pageStride - top)
	})
})

describe('invarian: tidak ada dua blok yang bertumpang tindih di kolom yang sama', () => {
	function boxesByColumn(items: ColumnItem[], top: number, count: number) {
		const byColumn = new Map<number, { top: number; bottom: number }[]>()
		for (const box of rendered(items, top, count)) {
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
		expect(collapsedMargin(16, 0, 0, 12)).toBe(16)
	})

	test('tableWrapper tanpa margin membaca margin <table> di dalamnya', () => {
		expect(collapsedMargin(0, 0, 0, 12)).toBe(12)
	})

	test('margin anak tidak dibaca bila ada padding - ia tidak menggabung keluar', () => {
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
			const table = tableItem(Array.from({ length: 12 }, () => 100)).table!
			const { cuts, bottom } = cutTableRows(table, 0, 0, geo)

			expect(cuts).toHaveLength(1)
			expect(cuts[0].pos).toBe(table.rows[9].pos)
			expect(cuts[0].spacerHeight).toBe(pageStride - 900)
			expect(cuts[0].headerHeight).toBe(0)
			expect(bottom).toBe(pageStride + 300)
		})

		test('salinan header ikut memakan ruang di puncak tiap potongan', () => {
			const table = tableItem([40, ...Array.from({ length: 14 }, () => 100)], { header: true }).table!
			const { cuts } = cutTableRows(table, 0, 0, geo)

			expect(cuts).toHaveLength(1)
			expect(cuts[0].headerHeight).toBe(40)
			expect(cuts[0].headerPos).toBe(table.rows[0].pos)
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
			expect(height).toBeGreaterThanOrEqual(2 * pageStride + 200)
			expect(sheetGap).toBe(2 * (pageStride - contentHeight))
		})

		test('blok sesudah tabel terpenggal tidak menimpa potongannya', () => {
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
			expect(placements[1].cuts).toBeUndefined()
			expect(placements[1].top).toBe(100)
		})

		test('invarian anti-tumpang-tindih tetap berlaku dengan tabel terpenggal', () => {
			for (const count of [1, 2, 3]) {
				const items = [
					...blocks(Array.from({ length: 4 }, () => 120)),
					tableItem(
						Array.from({ length: 20 }, () => 100),
						{ pos: 1 },
					),
					...blocks(Array.from({ length: 12 }, () => 120)),
				]
				const { placements } = flow(items, 0, count)
				const byColumn = new Map<number, { top: number; bottom: number }[]>()
				placements.forEach((placement, index) => {
					const top = placement.top
					const bottom = placement.cuts?.length
						? cutTableRows(items[index].table!, top, Math.floor(top / pageStride), {
								contentHeight,
								pageStride,
							}).bottom
						: top + items[index].height
					const list = byColumn.get(columnOf(placement.left)) ?? []
					list.push({ top, bottom })
					byColumn.set(columnOf(placement.left), list)
				})
				for (const boxes of byColumn.values()) {
					for (let i = 0; i < boxes.length; i++) {
						for (let j = i + 1; j < boxes.length; j++) {
							const overlap =
								Math.min(boxes[i].bottom, boxes[j].bottom) - Math.max(boxes[i].top, boxes[j].top)
							expect(overlap).toBeLessThanOrEqual(0.5)
						}
					}
				}
			}
		})
	})
})

describe('blok tak terpenggal naik selebar penuh (§P4 lapis 3)', () => {
	function spanBlock(height: number): ColumnItem {
		return { ...blocks([height])[0], span: true }
	}

	test('blok raksasa baru ditempatkan selebar pembungkus, bukan meluber di satu kolom', () => {
		const items = blocks([contentHeight + 100, ...Array.from({ length: 6 }, () => 120)])
		const { placements } = flow(items)

		expect(placements[0].span).toBe(true)
		expect(placements[0].left).toBe(0)
		expect(placements[0].top).toBe(0)
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
		expect(placements[4].span).toBe(true)
		expect(placements[4].top).toBe(480)
	})

	test('petak penuh yang tidak muat di sisa lembar turun ke lembar berikutnya', () => {
		const items = [...blocks(Array.from({ length: 4 }, () => 120)), spanBlock(800), ...blocks([120, 120])]
		const { placements } = flow(items)
		expect(placements[4].top).toBe(pageStride)
		expect(placements[5].top).toBeGreaterThanOrEqual(pageStride + 800)
	})

	test('penyeimbangan lembar terakhir dilewati bila ada petak penuh di lembar itu', () => {
		const items = [...blocks([100, 100]), spanBlock(300), ...blocks([100, 100])]
		const { placements } = flow(items)
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
			expect(placements[0]).toMatchObject({ left: 0, width: 212, top: 0 })
			expect(placements[2]).toMatchObject({ left: 236, width: 412, top: 0 })
		})
	})
})

describe('batas lembar berlabuh di sheetOrigin (§P8)', () => {
	const geo = { contentHeight: 602, pageStride: 826 }

	test('kolom terisi dari lembar pertama section, bukan dari kelipatan stride', () => {
		const frame = { top: 3500, count: 2, columnWidth: 300, columnGap: 24 }
		const withOrigin = flowColumns(blocks([500, 500]), { ...frame, sheetOrigin: 3500 }, geo)
		expect(withOrigin.placements.map((placement) => placement.top)).toEqual([0, 0])
		const withoutOrigin = flowColumns(blocks([500, 500]), frame, geo)
		expect(withoutOrigin.placements[0].top).toBeGreaterThan(0)
	})

	test('celah antar lembar section terhitung dari origin yang sama', () => {
		const { sheetGap } = flowColumns(
			blocks([500, 500, 500]),
			{
				top: 3500,
				count: 2,
				columnWidth: 300,
				columnGap: 24,
				sheetOrigin: 3500,
			},
			geo,
		)

		expect(sheetGap).toBe(826 - 602)
	})

	test('tabel terpenggal di batas lembar section', () => {
		const items = [tableItem(Array.from({ length: 12 }, () => 100))]
		const { placements } = flowColumns(
			items,
			{
				top: 3500,
				count: 2,
				columnWidth: 300,
				columnGap: 24,
				sheetOrigin: 3500,
			},
			geo,
		)
		expect(placements[0].cuts).toHaveLength(1)
		expect(placements[0].cuts?.[0].pos).toBe(items[0].table?.rows[6].pos)
		expect(placements[0].cuts?.[0].spacerHeight).toBeCloseTo(826 - 600)
	})
})

describe('page break di dalam blok kolom (§P4)', () => {
	test('isi sesudahnya mulai di kolom pertama lembar berikutnya', () => {
		const items = blocks([100, 0, 100])
		items[1].isBreak = true

		const boxes = rendered(items)

		expect(boxes[0]).toMatchObject({ column: 0, top: 0 })
		expect(boxes[2].column).toBe(0)
		expect(boxes[2].top).toBe(pageStride)
	})

	test('page break tetap memulangkan aliran walau kolomnya masih lowong', () => {
		const items = blocks([100, 0, 100, 100])
		items[1].isBreak = true

		const boxes = rendered(items)
		expect(boxes[2].top).toBe(pageStride)
		expect(boxes[3].top).toBeGreaterThanOrEqual(pageStride)
	})

	test('tanpa penanda, aliran tetap seperti biasa', () => {
		const boxes = rendered(blocks([100, 100]))
		expect(boxes.every((box) => box.top < pageStride)).toBe(true)
	})
})

describe('page break tidak menyisakan lembar kosong (E2)', () => {
	const fill = Math.floor(contentHeight / 100)

	test('break tepat setelah isi memenuhi kolom terakhir', () => {
		const items = blocks([...Array.from({ length: fill * 3 }, () => 100), 0, 100])
		items[fill * 3].isBreak = true

		const boxes = rendered(items, 0, 3)

		expectNoEmptySheet(boxes)
		expect(boxes[fill * 3 + 1].top).toBe(pageStride)
	})

	test('dua break berturut-turut hanya melewati satu lembar', () => {
		const items = blocks([100, 0, 0, 100])
		items[1].isBreak = true
		items[2].isBreak = true

		const boxes = rendered(items)

		expect(boxes[3].top).toBe(pageStride)
		expectNoEmptySheet(boxes)
	})

	test('break sebagai butir pertama tidak membuka lembar kosong di depan', () => {
		const items = blocks([0, 100, 100])
		items[0].isBreak = true

		const boxes = rendered(items)

		expect(boxes.every((box) => box.top < pageStride)).toBe(true)
	})

	test('invarian: tidak ada lembar kosong di antara lembar pertama dan terakhir', () => {
		for (const count of [2, 3]) {
			for (const filled of [0, fill - 1, fill, fill * count]) {
				for (const breaks of [1, 2]) {
					const heights = [
						...Array.from({ length: filled }, () => 100),
						...Array.from({ length: breaks }, () => 0),
						100,
					]
					const items = blocks(heights)
					for (let i = 0; i < breaks; i += 1) items[filled + i].isBreak = true

					expectNoEmptySheet(rendered(items, 0, count))
				}
			}
		}
	})
})

describe('migrasi blok kolom lama saat dibuka (E5 langkah 4)', () => {
	const para = (text: string): JSONContent => ({ type: 'paragraph', content: [{ type: 'text', text }] })

	function stateOf(content: JSONContent[]): EditorState {
		const schema = buildSchema()
		return EditorState.create({ schema, doc: schema.nodeFromJSON({ type: 'doc', content }) })
	}

	test('blok columns diganti sepasang pembatas menerus dan isinya terangkat', () => {
		const state = stateOf([
			para('sebelum'),
			{ type: 'columns', attrs: { count: 3 }, content: [para('a'), para('b')] },
			para('sesudah'),
		])

		const tr = migrateLegacyColumns(state)
		expect(tr).not.toBeNull()
		expect(tr!.getMeta('addToHistory')).toBe(false)

		const next = state.apply(tr!).doc
		expect(next.childCount).toBe(6)
		expect(next.child(0).textContent).toBe('sebelum')
		expect(next.child(1).type.name).toBe('sectionBreak')
		expect(next.child(1).attrs).toMatchObject({ continuous: true, columns: { count: 3 } })
		expect(next.child(2).textContent).toBe('a')
		expect(next.child(3).textContent).toBe('b')
		expect(next.child(4).type.name).toBe('sectionBreak')
		expect(next.child(4).attrs).toMatchObject({ continuous: true, columns: null })
		expect(next.child(5).textContent).toBe('sesudah')
	})

	test('celah kolom ikut ke pembatas pembukanya', () => {
		const state = stateOf([{ type: 'columns', attrs: { count: 2, gap: 40 }, content: [para('a')] }])
		const next = state.apply(migrateLegacyColumns(state)!).doc
		expect(next.child(0).attrs.columns).toEqual({ count: 2, gap: 40 })
	})

	test('idempoten: migrasi kedua atas hasilnya bukan transaksi', () => {
		const state = stateOf([{ type: 'columns', attrs: { count: 2 }, content: [para('a')] }])
		const migrated = EditorState.create({
			schema: buildSchema(),
			doc: state.apply(migrateLegacyColumns(state)!).doc,
		})
		expect(migrateLegacyColumns(migrated)).toBeNull()
	})

	test('naskah yang sudah bersih tidak disentuh sama sekali', () => {
		expect(migrateLegacyColumns(stateOf([para('biasa')]))).toBeNull()
	})
})
