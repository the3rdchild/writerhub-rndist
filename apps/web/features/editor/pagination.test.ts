import { describe, expect, test } from 'bun:test'
import { pageGeometry } from './page-geometry'
import { computeSpacers, type Measurement } from './pagination'

/**
 * Aritmetika paginasi diuji tanpa DOM: `computeSpacers` menerima posisi blok
 * dan mengembalikan spacer, jadi seluruh perilakunya bisa diperiksa dengan
 * angka. Sebelum ada berkas ini, satu-satunya cara menemukan salah hitung
 * adalah membuka dokumen puluhan halaman dan melihat ada yang meleset.
 */

const geometry = pageGeometry() // A4, margin 1 inci
const { contentHeight, pageStride } = geometry

/** Susun blok berurutan dengan tinggi tertentu, seperti hasil pengukuran DOM. */
function layout(heights: Array<number | 'break'>): Measurement[] {
	let top = 0
	return heights.map((item, index) => {
		const height = item === 'break' ? 0 : item
		const block: Measurement = {
			pos: index,
			top,
			bottom: top + height,
			isBreak: item === 'break',
			kind: 'block',
		}
		top += height
		return block
	})
}

/**
 * Susun tabel: baris pertama diwakili posisi tabelnya sendiri (mendorongnya
 * berarti mendorong seluruh tabel), sisanya jadi satuan baris.
 */
function table(rowHeights: number[], options: { headerHeight?: number; startTop?: number } = {}) {
	const { headerHeight = 0, startTop = 0 } = options
	let top = startTop

	return rowHeights.map((height, index): Measurement => {
		const row: Measurement = {
			pos: index,
			top,
			bottom: top + height,
			isBreak: false,
			...(index === 0
				? { kind: 'block' as const }
				: { kind: 'row' as const, columns: 3, headerPos: 1, headerHeight }),
		}
		top += height
		return row
	})
}

/**
 * Posisi tiap blok setelah spacer disisipkan — inilah yang benar-benar dilihat
 * pengguna, diukur dari puncak area teks lembar pertama.
 */
function renderedTops(blocks: Measurement[]): number[] {
	const { spacers } = computeSpacers(blocks, geometry)
	const spacerAt = new Map(spacers.map((spacer) => [spacer.pos, spacer]))

	let cumulative = 0
	return blocks.map((block) => {
		const spacer = spacerAt.get(block.pos)
		if (spacer) {
			// Yang benar-benar tersisip di DOM adalah baris kosong DITAMBAH salinan
			// header — keduanya harus dihitung, persis seperti insertedHeights().
			const header = spacer.headerPos === undefined ? 0 : (block.headerHeight ?? 0)
			cumulative += spacer.height + header
		}
		return block.top + cumulative
	})
}

/** Blok yang mengawali sebuah lembar harus mendarat tepat di kelipatan pageStride. */
function expectStartsPage(renderedTop: number, page: number) {
	expect(renderedTop).toBe((page - 1) * pageStride)
}

describe('blok yang muat', () => {
	test('tidak digeser sama sekali', () => {
		const blocks = layout([100, 100, 100])
		expect(computeSpacers(blocks, geometry).spacers).toEqual([])
		expect(computeSpacers(blocks, geometry).pageCount).toBe(1)
	})

	test('blok yang pas mengisi halaman tetap di halaman itu', () => {
		const blocks = layout([contentHeight])
		expect(computeSpacers(blocks, geometry).spacers).toEqual([])
		expect(computeSpacers(blocks, geometry).pageCount).toBe(1)
	})
})

describe('luapan biasa', () => {
	test('blok yang tidak muat mengawali lembar berikutnya', () => {
		// Sepuluh blok 100px: yang kesepuluh melewati batas 931px.
		const blocks = layout(Array.from({ length: 10 }, () => 100))
		const tops = renderedTops(blocks)

		expectStartsPage(tops[9], 2)
		expect(computeSpacers(blocks, geometry).pageCount).toBe(2)
	})

	test('setiap halaman berikutnya tetap lurus, tidak menumpuk kesalahan', () => {
		const blocks = layout(Array.from({ length: 40 }, () => 100))
		const tops = renderedTops(blocks)

		expectStartsPage(tops[9], 2)
		expectStartsPage(tops[18], 3)
		expectStartsPage(tops[27], 4)
	})
})

describe('blok lebih tinggi dari satu halaman', () => {
	// Inilah yang membuat dokumen PRD berisi tabel besar berantakan: blok
	// raksasa tidak bisa dipenggal, dan dulu seluruh isi sesudahnya ikut
	// melenceng sejauh margin + celah yang terlewat per halaman.
	const blocks = layout([100, contentHeight * 2 + 200, 100, 100])

	test('blok raksasa sendiri tetap mengawali lembar', () => {
		expectStartsPage(renderedTops(blocks)[1], 2)
	})

	test('blok sesudahnya kembali mendarat tepat di awal lembar', () => {
		const tops = renderedTops(blocks)
		// Blok raksasa terentang 2062px dari awal lembar 2, jadi ia menghabiskan
		// lembar 2 dan 3 (satu lembar menampung pageStride = 1155px isi yang
		// meluber), dan yang menyusul mulai di lembar 4.
		expectStartsPage(tops[2], 4)
	})

	test('blok raksasa berturut-turut tidak membuat kesalahan menumpuk', () => {
		const many = layout([contentHeight * 2, 100, contentHeight * 2, 100])
		const tops = renderedTops(many)

		for (const index of [1, 3]) {
			const top = tops[index]
			expect(top % pageStride).toBe(0)
		}
	})
})

describe('page break manual', () => {
	test('mendorong blok sesudahnya ke lembar baru walau masih banyak ruang', () => {
		const blocks = layout([100, 'break', 100])
		const tops = renderedTops(blocks)

		expectStartsPage(tops[2], 2)
		expect(computeSpacers(blocks, geometry).pageCount).toBe(2)
	})

	test('page break di ujung dokumen tetap membuka lembar kosong', () => {
		const blocks = layout([100, 'break'])
		expect(computeSpacers(blocks, geometry).pageCount).toBe(2)
	})

	test('blok raksasa di ujung dokumen tidak menambah lembar kosong', () => {
		const blocks = layout([100, contentHeight + 200])
		// Blok itu meluber ke lembar kedua; tidak ada lembar ketiga.
		expect(computeSpacers(blocks, geometry).pageCount).toBe(2)
	})
})

describe('tabel dipenggal per baris', () => {
	test('baris yang tidak muat turun ke lembar berikutnya, bukan tertembus batas', () => {
		// Enam baris 200px: yang kelima melewati batas 931px.
		const rows = table([200, 200, 200, 200, 200, 200])
		const { spacers } = computeSpacers(rows, geometry)

		expect(spacers).toHaveLength(1)
		expect(spacers[0].kind).toBe('row')
		expectStartsPage(renderedTops(rows)[4], 2)
	})

	test('tabel yang muat seluruhnya tidak dipenggal sama sekali', () => {
		expect(computeSpacers(table([200, 200, 200]), geometry).spacers).toEqual([])
	})

	test('spacer membawa jumlah kolom, supaya baris kosongnya merentang penuh', () => {
		const { spacers } = computeSpacers(table([200, 200, 200, 200, 200, 200]), geometry)
		expect(spacers[0].columns).toBe(3)
	})

	test('header ulangan memakan ruang di lembar baru, bukan menimpa baris', () => {
		const headerHeight = 50
		const rows = table([200, 200, 200, 200, 200, 200], { headerHeight })
		const { spacers } = computeSpacers(rows, geometry)

		expect(spacers[0].headerPos).toBe(1)

		// Header mendarat tepat di awal lembar; barisnya menyusul persis di bawahnya.
		const rowTop = renderedTops(rows)[4]
		expect(rowTop).toBe(pageStride + headerHeight)
	})

	test('halaman lanjutan menyisakan ruang tulis lebih sedikit sebanyak headernya', () => {
		const headerHeight = 100
		const rows = table(Array.from({ length: 14 }, () => 200), { headerHeight })
		const tops = renderedTops(rows)

		// Tiap lembar lanjutan dibuka salinan header, lalu barisnya menyusul —
		// jadi awal barisnya persis satu tinggi header di bawah garis lembar.
		expectStartsPage(tops[4] - headerHeight, 2)
		expectStartsPage(tops[8] - headerHeight, 3)
	})

	test('baris tunggal lebih tinggi dari satu halaman tetap meluber, tapi tidak menular', () => {
		// Batasan yang disepakati: baris raksasa tidak dipecah isinya. Yang penting
		// baris sesudahnya kembali lurus ke awal lembar.
		const rows = table([200, contentHeight + 400, 200])
		const tops = renderedTops(rows)

		expect(tops[2] % pageStride).toBe(0)
	})
})

describe('dokumen kosong', () => {
	test('tetap satu halaman', () => {
		expect(computeSpacers([], geometry)).toEqual({ spacers: [], pageCount: 1 })
	})
})
