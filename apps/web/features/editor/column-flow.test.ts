import { describe, expect, test } from 'bun:test'
import { type ColumnFragment, type ColumnItem, flowColumns, resolveColumnSlots } from './column-flow'
import { pageGeometry } from './page-geometry'

const geometry = pageGeometry() // A4, margin 1 inci
const { contentHeight, pageStride } = geometry

const COLUMN_WIDTH = 300
const COLUMN_GAP = 24

function slots(count: number, widths?: number[]) {
	return resolveColumnSlots(
		COLUMN_WIDTH * count + COLUMN_GAP * (count - 1),
		count,
		COLUMN_GAP,
		widths ?? null,
	)
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

/** Paragraf `lines` baris setinggi `line`, boleh dipotong di batas baris mana pun (aturan yatim/janda milik pengukur). */
function paragraph(lines: number, line = 20, pos = 0): ColumnItem {
	return {
		pos,
		height: lines * line,
		marginTop: 0,
		marginBottom: 0,
		keepWithNext: false,
		cuts: Array.from({ length: lines - 1 }, (_, index) => (index + 1) * line),
	}
}

interface Box {
	item: number
	sheet: number
	column: number
	top: number
	bottom: number
	offset: number
	height: number
}

function flow(
	items: ColumnItem[],
	options: { top?: number; origin?: number; count?: number; balance?: boolean; widths?: number[] } = {},
) {
	const count = options.count ?? 2
	return flowColumns(
		items,
		{
			top: options.top ?? 0,
			origin: options.origin ?? 0,
			slots: slots(count, options.widths),
			balance: options.balance ?? true,
		},
		geometry,
	)
}

function boxes(items: ColumnItem[], options: Parameters<typeof flow>[1] = {}): Box[] {
	return flow(items, options).fragments.flatMap((list, item) =>
		list.map((fragment: ColumnFragment) => ({
			item,
			sheet: fragment.sheet,
			column: fragment.column,
			top: fragment.top,
			bottom: fragment.top + (fragment.header ?? 0) + fragment.height,
			offset: fragment.offset,
			height: fragment.height,
		})),
	)
}

/** Tiap butir tampil persis sekali: potongannya bersambung dari 0 sampai tingginya. */
function expectComplete(items: ColumnItem[], options: Parameters<typeof flow>[1] = {}) {
	const { fragments } = flow(items, options)
	items.forEach((item, index) => {
		const list = fragments[index]
		expect(list.length).toBeGreaterThan(0)
		let offset = 0
		for (const fragment of list) {
			expect(fragment.offset).toBeCloseTo(offset)
			offset += fragment.height
		}
		expect(offset).toBeCloseTo(item.height)
	})
}

function expectNoOverlap(list: Box[]) {
	for (let i = 0; i < list.length; i++) {
		for (let j = i + 1; j < list.length; j++) {
			const a = list[i]
			const b = list[j]
			if (a.sheet !== b.sheet || a.column !== b.column) continue
			const overlap = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
			expect(overlap).toBeLessThanOrEqual(0.5)
		}
	}
}

describe('isi yang muat satu lembar', () => {
	test('dibagi rata ke semua kolom, bukan ditumpuk di kolom pertama', () => {
		const list = boxes(blocks([100, 100, 100, 100]))

		expect(list.map((box) => box.column)).toEqual([0, 0, 1, 1])
		expect(list.map((box) => box.top)).toEqual([0, 100, 0, 100])
	})

	test('tiga kolom pun terbagi rata', () => {
		const list = boxes(blocks([100, 100, 100, 100, 100, 100]), { count: 3 })
		expect(list.map((box) => box.column)).toEqual([0, 0, 1, 1, 2, 2])
	})

	test('wilayah yang mulai di tengah halaman: kolomnya berjajar mulai dari situ', () => {
		const list = boxes(blocks([100, 100, 100]), { top: 400 })

		expect(list[0].top).toBe(400)
		expect(list.find((box) => box.column === 1)?.top).toBe(400)
	})

	test('tidak melompati lembar, jadi tidak ada celah yang dilaporkan', () => {
		expect(flow(blocks([100, 100])).sheetGap).toBe(0)
	})

	test('daftar kosong tidak menghasilkan apa-apa', () => {
		expect(flow([])).toEqual({ fragments: [], height: 0, sheetGap: 0 })
	})
})

describe('aliran per baris (KOL-7)', () => {
	test('satu paragraf dibagi ke dua kolom, tidak menumpuk di kolom kiri', () => {
		const item = paragraph(15)
		const list = boxes([item])

		expect(list).toHaveLength(2)
		expect(list[0]).toMatchObject({ column: 0, top: 0, offset: 0 })
		expect(list[1]).toMatchObject({ column: 1, top: 0 })
		// Seimbang per baris: selisih tinggi dua kolom paling banyak satu baris.
		expect(Math.abs(list[0].height - list[1].height)).toBeLessThanOrEqual(20)
		expectComplete([item])
	})

	test('paragraf yang tidak muat di sisa kolom dipotong, bukan pindah utuh meninggalkan rongga', () => {
		const filler = Math.floor(contentHeight / 100) * 100 - 100 // sisakan 100-an piksel
		const items = [...blocks([filler]), { ...paragraph(20), pos: 1 }, { ...paragraph(60), pos: 2 }]
		const list = boxes(items, { balance: false })
		const firstPart = list.find((box) => box.item === 1)
		expect(firstPart?.column).toBe(0)
		expect(firstPart?.top).toBe(filler)
		expect(firstPart?.bottom).toBeLessThanOrEqual(contentHeight + 0.5)
		expect(firstPart?.bottom).toBeGreaterThan(contentHeight - 20)
		expectComplete(items, { balance: false })
	})

	test('tiga paragraf: kolom seimbang per baris (KOL-7, B1)', () => {
		const items = [paragraph(8, 20, 0), paragraph(8, 20, 1), paragraph(8, 20, 2)]
		const list = boxes(items)
		const height = (column: number) =>
			Math.max(...list.filter((box) => box.column === column).map((box) => box.bottom))
		expect(Math.abs(height(0) - height(1))).toBeLessThanOrEqual(20)
		expectComplete(items)
	})

	test('balance mati (pembatas next page): kolom kiri diisi penuh lebih dulu', () => {
		const item = paragraph(15)
		const list = boxes([item], { balance: false })
		expect(list).toHaveLength(1)
		expect(list[0].column).toBe(0)
	})
})

describe('paragraf lebih panjang dari satu kolom tetap di kolom (KOL-6)', () => {
	test('dipotong ke kolom berikutnya dan lembar berikutnya, tidak selebar halaman', () => {
		const lines = Math.ceil((contentHeight * 3) / 20)
		const item = paragraph(lines)
		const list = boxes([item])

		expect(list.length).toBeGreaterThanOrEqual(3)
		for (const box of list) {
			expect(box.bottom).toBeLessThanOrEqual(box.sheet * pageStride + contentHeight + 0.5)
		}
		expect(list[2].sheet).toBe(1)
		expectComplete([item])
	})
})

describe('wilayah yang mulai di tengah halaman berhenti di margin bawah lembar itu (KOL-2)', () => {
	test('dasar kolom pertama = dasar area teks lembar, bukan puncak wilayah + tinggi isi', () => {
		const items = Array.from({ length: 30 }, (_, index) => paragraph(5, 20, index))
		const list = boxes(items, { top: 300 })

		for (const box of list) {
			const bottom = box.sheet * pageStride + contentHeight
			expect(box.bottom).toBeLessThanOrEqual(bottom + 0.5)
			expect(box.top).toBeGreaterThanOrEqual(box.sheet === 0 ? 300 : box.sheet * pageStride)
		}
		expect(list.some((box) => box.sheet === 1)).toBe(true)
		expectComplete(items, { top: 300 })
	})

	test('origin di lembar ke-3: kolom terisi dari lembar section itu', () => {
		const origin = 2 * pageStride
		const list = boxes(blocks([500, 500]), { top: origin, origin })
		expect(list.map((box) => box.top)).toEqual([origin, origin])
		expect(list.map((box) => box.sheet)).toEqual([0, 0])
	})

	test('wilayah yang jatuh di celah antarlembar mulai di lembar berikutnya', () => {
		const top = contentHeight + 40
		const list = boxes(blocks([100, 100]), { top })

		expect(list[0].top).toBe(pageStride)
		expect(flow(blocks([100, 100]), { top }).sheetGap).toBe(pageStride - top)
	})
})

describe('isi lebih panjang dari satu lembar', () => {
	const items = blocks(Array.from({ length: 30 }, () => 100))

	test('tidak ada satu blok pun yang menembus batas area teks', () => {
		for (const box of boxes(items)) {
			expect(box.bottom).toBeLessThanOrEqual(box.sheet * pageStride + contentHeight)
		}
	})

	test('tiap kolom baru mulai tepat di puncak area teks lembarnya', () => {
		for (const box of boxes(items)) {
			if (box.top % pageStride !== 0) continue
			expect(box.top).toBe(box.sheet * pageStride)
		}
	})

	test('celah antar lembar yang dilompati dilaporkan ke paginasi', () => {
		expect(flow(items).sheetGap).toBe(pageStride - contentHeight)
	})

	test('tinggi wilayah berhenti di ujung isi lembar terakhir', () => {
		const list = boxes(items)
		const deepest = Math.max(...list.map((box) => box.bottom))
		expect(flow(items).height).toBe(deepest)
	})
})

describe('judul di kaki kolom', () => {
	test('ikut turun bersama isinya, tidak ditinggal sendirian', () => {
		const heights = [...Array.from({ length: 9 }, () => 100), 30, ...Array.from({ length: 12 }, () => 100)]
		const list = boxes(blocks(heights, [9]), { balance: false })

		expect(list[9].column).toBe(1)
		expect(list[10].column).toBe(1)
		expect(list[9].top).toBe(0)
	})
})

describe('blok tak terpenggal', () => {
	test('yang tidak muat di sisa kolom pindah utuh ke kolom berikutnya', () => {
		const list = boxes(blocks([contentHeight - 100, 300]), { balance: false })
		expect(list[1]).toMatchObject({ column: 1, top: 0, height: 300 })
	})

	test('yang lebih tinggi dari kolom penuh tetap ditempatkan di puncak kolom, bukan hilang', () => {
		const giant = contentHeight + 400
		const { fragments, height } = flow(blocks([giant]))
		expect(fragments[0]).toHaveLength(1)
		expect(fragments[0][0].top).toBe(0)
		expect(height).toBe(giant)
	})

	test('blok sesudah raksasa tidak menimpanya', () => {
		const giant = contentHeight + 400
		const list = boxes(blocks([giant, ...Array.from({ length: 10 }, () => 100)]))
		expectNoOverlap(list)
		expect(list[1].column).toBe(1)
	})
})

describe('invarian: tidak ada dua potongan yang bertumpang tindih di kolom yang sama', () => {
	const GIANT = Math.round(contentHeight * 1.5)
	for (const count of [2, 3]) {
		for (const top of [0, 400]) {
			test(`${count} kolom, paragraf panjang dan blok utuh bercampur, mulai di y=${top}`, () => {
				const items: ColumnItem[] = [
					...blocks([120, 120]),
					{ ...paragraph(Math.round(GIANT / 20)), pos: 2 },
					...blocks([GIANT]).map((item) => ({ ...item, pos: 3 })),
					...Array.from({ length: 12 }, (_, index) => ({ ...paragraph(7), pos: 4 + index })),
				]
				const list = boxes(items, { top, count })
				expectNoOverlap(list)
				expectComplete(items, { top, count })
			})
		}
	}
})

describe('pemenggal halaman di dalam wilayah', () => {
	test('isi sesudahnya mulai di kolom pertama lembar berikutnya', () => {
		const items = blocks([100, 0, 100])
		items[1].isBreak = true
		const list = boxes(items)

		expect(list[0]).toMatchObject({ column: 0, top: 0 })
		expect(list[2]).toMatchObject({ column: 0, top: pageStride, sheet: 1 })
	})

	test('dua pemenggal beruntun hanya melewati satu lembar (E2)', () => {
		const items = blocks([100, 0, 0, 100])
		items[1].isBreak = true
		items[2].isBreak = true
		expect(boxes(items)[3].top).toBe(pageStride)
	})

	test('pemenggal sebagai butir pertama tidak membuka lembar kosong di depan', () => {
		const items = blocks([0, 100, 100])
		items[0].isBreak = true
		expect(boxes(items).every((box) => box.top < pageStride)).toBe(true)
	})

	test('pemenggal di awal wilayah yang mulai di tengah lembar tetap memenggal', () => {
		const items = blocks([0, 100])
		items[0].isBreak = true
		expect(boxes(items, { top: 300 })[1].top).toBe(pageStride)
	})
})

describe('pindah kolom di dalam wilayah (W3)', () => {
	test('isi sesudahnya pindah ke kolom berikutnya, bukan ke lembar berikutnya', () => {
		const items = blocks([100, 0, 100])
		items[1].columnBreak = true
		const list = boxes(items)

		expect(list[0]).toMatchObject({ column: 0, top: 0 })
		expect(list[2]).toMatchObject({ column: 1, top: 0 })
	})

	test('dua pemenggal beruntun melompati satu kolom penuh', () => {
		const items = blocks([100, 0, 0, 100])
		items[1].columnBreak = true
		items[2].columnBreak = true
		const list = boxes(items, { count: 3 })

		expect(list[0].column).toBe(0)
		expect(list[3]).toMatchObject({ column: 2, sheet: 0 })
	})

	test('melompati kolom TERAKHIR berarti pindah lembar', () => {
		const items = blocks([100, 0, 0, 100])
		items[1].columnBreak = true
		items[2].columnBreak = true
		const list = boxes(items, { count: 2 })

		expect(list[3]).toMatchObject({ column: 0, sheet: 1, top: pageStride })
	})

	test('pemenggal tepat sesudah kolom yang baru saja penuh tidak melompat dua kali', () => {
		const fill = Math.floor(contentHeight / 100)
		const items = blocks([...Array.from({ length: fill }, () => 100), 0, 100])
		items[fill].columnBreak = true
		const list = boxes(items, { count: 3, balance: false })

		expect(list[fill + 1].column).toBe(1)
	})

	test('page break dan column break tidak tertukar', () => {
		const page = blocks([100, 0, 100])
		page[1].isBreak = true
		const column = blocks([100, 0, 100])
		column[1].columnBreak = true

		expect(boxes(page)[2].top).toBe(pageStride)
		expect(boxes(column)[2].top).toBe(0)
	})
})

describe('kolom tak sama lebar', () => {
	test('penempatan mengikuti tepi dan lebar tiap kolom', () => {
		const frameSlots = slots(2, [150, 450])
		expect(frameSlots[0].width).toBeLessThan(frameSlots[1].width)
		const list = boxes(
			blocks([100, 0, 100]).map((item, index) => ({ ...item, columnBreak: index === 1 })),
			{
				widths: [150, 450],
			},
		)
		expect(list[2].column).toBe(1)
	})

	test('paragraf tidak dipotong ke kolom yang lebarnya berbeda - pindah utuh', () => {
		const items = [...blocks([contentHeight - 100]), { ...paragraph(20), pos: 1 }]
		const list = boxes(items, { widths: [150, 450], balance: false })
		const parts = list.filter((box) => box.item === 1)
		expect(parts).toHaveLength(1)
		expect(parts[0].column).toBe(1)
	})
})

describe('tabel dipotong antarbaris', () => {
	test('potongan lanjutan memesan tempat untuk salinan baris kepala', () => {
		const rows = 30
		const table: ColumnItem = {
			pos: 0,
			height: rows * 50,
			marginTop: 0,
			marginBottom: 0,
			keepWithNext: false,
			cuts: Array.from({ length: rows - 1 }, (_, index) => (index + 1) * 50),
			repeatHeader: 50,
		}
		const { fragments } = flow([table], { balance: false })
		const [head, ...rest] = fragments[0]
		expect(head.header).toBeUndefined()
		expect(rest.length).toBeGreaterThan(0)
		for (const fragment of rest) {
			expect(fragment.header).toBe(50)
			expect(fragment.top + 50 + fragment.height).toBeLessThanOrEqual(
				fragment.sheet * pageStride + contentHeight,
			)
		}
		expectComplete([table], { balance: false })
	})
})

describe('titik potong diukur malas', () => {
	test('blok yang muat utuh tidak pernah diminta barisnya', () => {
		let asked = 0
		const item: ColumnItem = {
			...paragraph(5),
			cuts: () => {
				asked += 1
				return [20, 40, 60, 80]
			},
		}
		flow([item, ...blocks([100])], { balance: false })
		expect(asked).toBe(0)
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
})

describe('resolveColumnSlots dengan jarak per celah (W4)', () => {
	test('jarak per celah dipakai apa adanya, bukan satu jarak untuk semua', () => {
		const slots = resolveColumnSlots(600, 3, 24, null, [10, 50])

		expect(slots[0].left).toBe(0)
		expect(slots[1].left).toBeCloseTo(slots[0].width + 10)
		expect(slots[2].left).toBeCloseTo(slots[1].left + slots[1].width + 50)
		expect(slots[0].width).toBeCloseTo((600 - 60) / 3)
	})

	test('lebar tak-sama dan jarak per celah tetap memenuhi lebar kolom teks', () => {
		const slots = resolveColumnSlots(614, 2, 24, [130, 448], [36])

		expect(slots[0].width + slots[1].width + 36).toBeCloseTo(614)
		expect(slots[0].width / slots[1].width).toBeCloseTo(130 / 448)
		expect(slots[1].left).toBeCloseTo(slots[0].width + 36)
	})

	test('jarak per celah yang panjangnya salah diabaikan — jatuh ke jarak tunggal', () => {
		expect(resolveColumnSlots(648, 2, 24, null, [10, 20])).toEqual(resolveColumnSlots(648, 2, 24, null))
	})
})
