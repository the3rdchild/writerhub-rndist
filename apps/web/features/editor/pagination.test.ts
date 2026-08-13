import { describe, expect, test } from 'bun:test'
import { DEFAULT_PAGE_SETUP, pageGeometry } from './page-geometry'
import { computeSpacers, pageBlockRange, pageOfPos, type Measurement } from './pagination'

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
 * Posisi tiap blok setelah spacer disisipkan - inilah yang benar-benar dilihat
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
			// header - keduanya harus dihitung, persis seperti insertedHeights().
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

		// Tiap lembar lanjutan dibuka salinan header, lalu barisnya menyusul -
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
		const result = computeSpacers([], geometry)
		expect(result.spacers).toEqual([])
		expect(result.pageCount).toBe(1)
		expect(result.sheets).toHaveLength(1)
		expect(result.sheets[0]).toMatchObject({ index: 0, top: 0 })
	})
})

describe('blok self-paginate (blok TOC)', () => {
	// bottom blok self-paginate sudah termasuk celah internal yang disisipkan
	// node view-nya sendiri; plugin tidak boleh mendorongnya utuh.
	const selfPaginate = (pos: number, top: number, bottom: number): Measurement => ({
		pos,
		top,
		bottom,
		isBreak: false,
		kind: 'block',
		selfPaginate: true,
	})

	test('blok yang meluber tidak didorong utuh dan tidak diberi spacer', () => {
		const blocks: Measurement[] = [
			{ pos: 0, top: 0, bottom: 100, isBreak: false, kind: 'block' },
			selfPaginate(1, 100, 1600),
			{ pos: 2, top: 1600, bottom: 1700, isBreak: false, kind: 'block' },
		]
		const { spacers, pageCount } = computeSpacers(blocks, geometry)

		expect(spacers).toEqual([])
		// Ujung terender di 1600 → lembar 2 (satu lembar = pageStride 1155px).
		expect(pageCount).toBe(2)
	})

	test('blok sesudahnya mengalir di bawah segmen terakhir, bukan di lembar baru', () => {
		const blocks: Measurement[] = [
			selfPaginate(0, 0, 1600),
			{ pos: 1, top: 1600, bottom: 1700, isBreak: false, kind: 'block' },
		]
		// Lembar 2 berakhir di 1155 + 931 = 2086; blok kedua (1600–1700) muat.
		expect(computeSpacers(blocks, geometry).spacers).toEqual([])
	})

	test('blok sesudahnya yang meluber tetap mendarat tepat di awal lembar', () => {
		const blocks: Measurement[] = [
			selfPaginate(0, 0, 2000),
			{ pos: 1, top: 2000, bottom: 2200, isBreak: false, kind: 'block' },
		]
		const tops = renderedTops(blocks)

		// Lembar 2 habis di 2086; blok kedua didorong ke awal lembar 3.
		expectStartsPage(tops[1], 3)
	})

	test('celah internalnya ikut dihitung, jadi blok sesudahnya tidak menembus batas', () => {
		// Blok ini merentang dua lembar dan melompati satu celah antar lembar
		// (224px). Tanpa celah itu ikut dihitung, blok sesudahnya diukur di
		// kerangka koordinat yang berbeda dari garis lembar - dan luapannya baru
		// terdeteksi jauh setelah ia menembus batas area teks.
		const internal = pageStride - contentHeight
		const blocks: Measurement[] = [
			{ pos: 0, top: 0, bottom: 1379, isBreak: false, kind: 'block', selfPaginate: true, internal },
			{ pos: 1, top: 1379, bottom: 1879, isBreak: false, kind: 'block' },
		]
		const { spacers } = computeSpacers(blocks, geometry)

		expect(spacers).toHaveLength(1)
		// Yang benar-benar terlihat: koordinat alami + celah internal + spacer.
		expectStartsPage(1379 + internal + spacers[0].height, 3)
	})

	test('page break manual tetap mendorongnya ke lembar baru', () => {
		const blocks: Measurement[] = [
			{ pos: 0, top: 0, bottom: 100, isBreak: false, kind: 'block' },
			{ pos: 1, top: 100, bottom: 100, isBreak: true, kind: 'block' },
			selfPaginate(2, 100, 400),
		]
		const { spacers, pageCount } = computeSpacers(blocks, geometry)

		expect(spacers).toHaveLength(1)
		expect(spacers[0].pos).toBe(2)
		expectStartsPage(100 + spacers[0].height, 2)
		expect(pageCount).toBe(2)
	})
})


describe('paginasi tak seragam (§P8&P9)', () => {
	const landscape = pageGeometry({ ...DEFAULT_PAGE_SETUP, orientation: 'landscape' })

	/** Susun blok dengan pembatas section di antaranya; pos section = pos node-nya. */
	function sectioned(items: Array<number | 'section'>): Measurement[] {
		let top = 0
		return items.map((item, index) => {
			const height = item === 'section' ? 0 : item
			const block: Measurement = {
				pos: index,
				top,
				bottom: top + height,
				isBreak: false,
				isSectionBreak: item === 'section' || undefined,
				kind: 'block',
			}
			top += height
			return block
		})
	}

	test('lembar sesudah pembatas section memakai geometrinya sendiri', () => {
		const blocks = sectioned([600, 'section', 400])
		const { spacers, pageCount, sheets } = computeSpacers(blocks, geometry, [
			{ pos: 1, geometry: landscape },
		])

		expect(pageCount).toBe(2)
		expect(sheets[0]).toMatchObject({ index: 0, top: 0, width: geometry.width })
		// Lembar kedua: lanskap, tepat di bawah lembar pertama.
		expect(sheets[1]).toMatchObject({ index: 1, top: pageStride, width: landscape.width, height: landscape.height })
		// Blok sesudah pembatas didorong ke puncak area teks lembar lanskap.
		expect(spacers).toHaveLength(1)
		expect(spacers[0].pos).toBe(2)
		expect(spacers[0].height).toBe(pageStride - 600)
	})

	test('pembatas section memaksa lembar baru walau ruang masih banyak', () => {
		const blocks = sectioned([200, 'section', 100])
		const { spacers } = computeSpacers(blocks, geometry, [{ pos: 1, geometry: landscape }])

		// 200 + 100 masih jauh di dalam lembar pertama, tapi blok kedua tetap turun.
		expect(spacers).toHaveLength(1)
		expect(spacers[0].height).toBe(pageStride - 200)
	})

	test('batas lembar di dalam section memakai tinggi area teksnya sendiri', () => {
		// Section lanskap: area teks 602px, jadi blok 300px kedua sudah meluber.
		const blocks = sectioned([600, 'section', 500, 300])
		const { spacers, sheets } = computeSpacers(blocks, geometry, [{ pos: 1, geometry: landscape }])

		expect(sheets).toHaveLength(3)
		expect(sheets[1]).toMatchObject({ top: pageStride, height: landscape.height })
		// Lembar ketiga mewarisi lanskap dan mulai tepat di bawah lembar keduanya.
		expect(sheets[2]).toMatchObject({
			index: 2,
			top: pageStride + landscape.height + 32,
			height: landscape.height,
		})
		expect(spacers.map((spacer) => spacer.pos)).toEqual([2, 3])
		// Blok 500px mendarat di puncak lembar lanskap; blok 300px-nya yang meluber
		// didorong ke puncak lembar ketiga.
		expect(600 + spacers[0].height).toBe(pageStride)
		expect(600 + 500 + spacers[0].height + spacers[1].height).toBe(sheets[2].top)
	})

	test('section ketiga kembali ke geometri dasar', () => {
		const blocks = sectioned([600, 'section', 400, 100, 'section', 100])
		const { sheets } = computeSpacers(blocks, geometry, [
			{ pos: 1, geometry: landscape },
			{ pos: 4, geometry },
		])

		expect(sheets).toHaveLength(3)
		expect(sheets[2]).toMatchObject({ index: 2, width: geometry.width, top: pageStride + landscape.height + 32 })
	})

	test('blok raksasa di section sempit memanjangkan daftar lembar dengan geometrinya', () => {
		// Blok 1500px di section lanskap meluber melewati lembar lanskap keduanya;
		// lembar yang dilaluinya tetap lanskap (luberan bukan pembatas section),
		// dan blok sesudahnya memulai lembar baru yang juga lanskap.
		const blocks = sectioned([100, 'section', 1500, 50])
		const { sheets } = computeSpacers(blocks, geometry, [{ pos: 1, geometry: landscape }])

		expect(sheets).toHaveLength(4)
		expect(sheets[1]).toMatchObject({ height: landscape.height, top: pageStride })
		expect(sheets[2]).toMatchObject({ height: landscape.height, top: pageStride + landscape.height + 32 })
		expect(sheets[3]).toMatchObject({ height: landscape.height, top: pageStride + 2 * (landscape.height + 32) })
	})
})
describe('peta blok→halaman (§P8&P9, cakupan "halaman ini")', () => {
	test('tiap blok dicatat pada lembar tempat ia mulai', () => {
		// Tiga blok 400px pada area teks 931px: dua muat di lembar pertama.
		const { blockPages } = computeSpacers(layout([400, 400, 400]), geometry)

		expect(blockPages).toEqual([
			{ pos: 0, page: 0 },
			{ pos: 1, page: 0 },
			{ pos: 2, page: 1 },
		])
	})

	test('blok yang menyeberang batas tetap milik lembar tempat ia bermula', () => {
		// Blok kedua lebih tinggi dari satu lembar - ia meluber, tapi tidak boleh
		// tercatat dua kali, kalau tidak "halaman ini" akan memotongnya jadi dua.
		const { blockPages } = computeSpacers(layout([200, pageStride + 300, 100]), geometry)

		expect(blockPages[1]).toEqual({ pos: 1, page: 1 })
		expect(blockPages.filter((entry) => entry.pos === 1)).toHaveLength(1)
	})

	test('baris tabel tidak masuk peta - yang mewakili tabel adalah tabelnya', () => {
		const { blockPages } = computeSpacers(table([100, 100, 100]), geometry)

		expect(blockPages).toEqual([{ pos: 0, page: 0 }])
	})

	test('halaman berisi blok pertama sampai sebelum blok pertama halaman berikutnya', () => {
		const { blockPages } = computeSpacers(layout([400, 400, 400, 400]), geometry)

		expect(pageOfPos(blockPages, 1)).toBe(0)
		expect(pageOfPos(blockPages, 2)).toBe(1)
		// Halaman 0 berhenti tepat di awal blok pertama halaman 1.
		expect(pageBlockRange(blockPages, 0, 999)).toEqual({ from: 0, to: 2 })
		// Halaman terakhir memanjang sampai ujung dokumen.
		expect(pageBlockRange(blockPages, 1, 999)).toEqual({ from: 2, to: 999 })
	})

	test('halaman yang tidak ada tidak menghasilkan rentang', () => {
		const { blockPages } = computeSpacers(layout([100]), geometry)
		expect(pageBlockRange(blockPages, 7, 999)).toBeNull()
	})

	test('posisi sebelum blok mana pun belum punya halaman', () => {
		expect(pageOfPos([], 3)).toBeNull()
	})
})
