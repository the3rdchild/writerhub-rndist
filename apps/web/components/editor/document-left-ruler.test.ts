import { describe, expect, test } from 'bun:test'
import { DEFAULT_PAGE_SETUP, pageGeometry, type SheetGeometry } from '@/features/editor/page-geometry'
import { leftRulerSheet } from './document-left-ruler'

const geometry = pageGeometry(DEFAULT_PAGE_SETUP)

/** Tumpukan lembar seragam, seperti dokumen tanpa pemisah bagian. */
const uniform = (count: number): SheetGeometry[] =>
	Array.from({ length: count }, (_, index) => ({
		...geometry,
		index,
		top: index * geometry.pageStride,
	}))

describe('leftRulerSheet', () => {
	test('menempel di lembar berkursor, bukan di lembar pertama', () => {
		const sheets = uniform(41)
		const target = leftRulerSheet(sheets, 30, geometry)

		expect(target.index).toBe(30)
		expect(target.top).toBe(30 * geometry.pageStride)
	})

	test('sebelum paginasi selesai, halaman pertama satu-satunya yang bisa dituju', () => {
		const target = leftRulerSheet([], 7, geometry)

		expect(target.index).toBe(0)
		expect(target.top).toBe(0)
		expect(target.height).toBe(geometry.height)
		expect(target.margins).toEqual(geometry.margins)
	})

	test('indeks di luar rentang dijepit, bukan menghasilkan lembar hantu', () => {
		const sheets = uniform(3)

		expect(leftRulerSheet(sheets, 99, geometry).index).toBe(2)
		expect(leftRulerSheet(sheets, -4, geometry).index).toBe(0)
	})

	test('margin dibaca dari lembarnya sendiri - dokumen bersection punya angka berbeda per bagian', () => {
		const sheets = uniform(3)
		const wide = { top: 200, right: 96, bottom: 200, left: 96 }
		sheets[2] = { ...sheets[2], margins: wide }

		expect(leftRulerSheet(sheets, 0, geometry).margins).toEqual(geometry.margins)
		expect(leftRulerSheet(sheets, 2, geometry).margins).toEqual(wide)
	})

	test('tinggi lembar ikut lembarnya - orientasi bisa berganti antar bagian', () => {
		const sheets = uniform(2)
		sheets[1] = { ...sheets[1], height: 794, top: 1200 }

		const target = leftRulerSheet(sheets, 1, geometry)
		expect(target.height).toBe(794)
		expect(target.top).toBe(1200)
	})
})
