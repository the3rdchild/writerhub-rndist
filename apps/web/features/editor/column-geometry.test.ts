import { describe, expect, test } from 'bun:test'
import {
	columnLefts,
	dragColumns,
	evenColumns,
	isEven,
	layoutPatch,
	MIN_COLUMN_WIDTH,
	presetColumns,
	pxToUnit,
	unitToPx,
	withCount,
	withSpacing,
	withWidth,
} from './column-geometry'

const WIDTH = 602 // lebar teks A4 bermargin satu inci
const total = (layout: { widths: number[]; gaps: number[] }) =>
	layout.widths.reduce((a, b) => a + b, 0) + layout.gaps.reduce((a, b) => a + b, 0)

describe('penggaris: menyeret penanda kolom (KOL-11)', () => {
	const even = evenColumns(WIDTH, 2, 24)

	test('pita celah digeser: kolom kiri melebar, kanan menyempit, jarak tetap', () => {
		const next = dragColumns(even, { kind: 'band', index: 0 }, 350)
		expect(next.widths[0]).toBeCloseTo(350)
		expect(next.gaps[0]).toBe(24)
		expect(total(next)).toBeCloseTo(WIDTH)
	})

	test('tepi kiri celah: kolom kiri berubah, celahnya yang menyerap', () => {
		const next = dragColumns(even, { kind: 'edge', index: 0, side: 'left' }, 250)
		expect(next.widths[0]).toBeCloseTo(250)
		expect(next.widths[1]).toBeCloseTo(even.widths[1])
		expect(next.gaps[0]).toBeCloseTo(24 + (even.widths[0] - 250))
		expect(total(next)).toBeCloseTo(WIDTH)
	})

	test('tepi kanan celah: kolom kanan berubah, celahnya yang menyerap', () => {
		const right = columnLefts(even)[1]
		const next = dragColumns(even, { kind: 'edge', index: 0, side: 'right' }, right + 40)
		expect(next.widths[1]).toBeCloseTo(even.widths[1] - 40)
		expect(next.gaps[0]).toBeCloseTo(64)
		expect(total(next)).toBeCloseTo(WIDTH)
	})

	test('kolom tidak pernah lebih sempit dari batas minimal', () => {
		const next = dragColumns(even, { kind: 'band', index: 0 }, -500)
		expect(next.widths[0]).toBe(MIN_COLUMN_WIDTH)
	})
})

describe('bentuk atribut yang ditulis', () => {
	test('kolom rata ditulis ringkas: gap saja, widths/gaps dihapus', () => {
		expect(layoutPatch(evenColumns(WIDTH, 3, 24))).toEqual({ count: 3, gap: 24, widths: null, gaps: null })
	})

	test('kolom tak rata membawa widths dan gaps berpiksel bulat', () => {
		const patch = layoutPatch(
			presetColumns('left', WIDTH, 24) as NonNullable<ReturnType<typeof presetColumns>>,
		)
		expect(patch.count).toBe(2)
		expect(patch.widths?.[0]).toBeLessThan(patch.widths?.[1] ?? 0)
		expect(patch.gaps).toEqual([24])
	})
})

describe('dialog "More column options…"', () => {
	test('prasetel Left/Right: kolom sempit sepertiga', () => {
		const left = presetColumns('left', WIDTH, 24)
		const right = presetColumns('right', WIDTH, 24)
		expect(left?.widths[0]).toBeCloseTo((WIDTH - 24) / 3)
		expect(right?.widths[1]).toBeCloseTo((WIDTH - 24) / 3)
		expect(presetColumns('one', WIDTH, 24)).toBeNull()
	})

	test('mengganti jumlah kolom mengembalikan kolom rata selebar teks', () => {
		const next = withCount(
			presetColumns('left', WIDTH, 30) as NonNullable<ReturnType<typeof presetColumns>>,
			3,
			WIDTH,
		)
		expect(isEven(next)).toBe(true)
		expect(next.gaps).toEqual([30, 30])
		expect(total(next)).toBeCloseTo(WIDTH)
	})

	test('lebar kolom rata: semua ikut, jaraknya menyesuaikan', () => {
		const next = withWidth(evenColumns(WIDTH, 2, 24), 0, 250, WIDTH, true)
		expect(next.widths).toEqual([250, 250])
		expect(next.gaps[0]).toBeCloseTo(WIDTH - 500)
	})

	test('lebar kolom tak rata: selisihnya diambil kolom terakhir', () => {
		const next = withWidth(evenColumns(WIDTH, 3, 24), 0, 120, WIDTH, false)
		expect(next.widths[0]).toBe(120)
		expect(total(next)).toBeCloseTo(WIDTH)
		expect(next.widths[1]).toBeCloseTo(evenColumns(WIDTH, 3, 24).widths[1])
	})

	test('jarak kolom rata menyesuaikan lebar semua kolom', () => {
		const next = withSpacing(evenColumns(WIDTH, 2, 24), 0, 48, WIDTH, true)
		expect(next.gaps).toEqual([48])
		expect(isEven(next)).toBe(true)
		expect(total(next)).toBeCloseTo(WIDTH)
	})

	test('satuan: cm dan inci bolak-balik', () => {
		expect(pxToUnit(96, 'in')).toBe(1)
		expect(pxToUnit(unitToPx(1.27, 'cm'), 'cm')).toBeCloseTo(1.27)
	})
})
