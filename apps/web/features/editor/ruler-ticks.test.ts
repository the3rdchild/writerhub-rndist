import { describe, expect, test } from 'bun:test'
import { INCH } from './page-geometry'
import { rulerTicks } from './ruler-ticks'

const A4_HEIGHT = 1123
const A4_WIDTH = 794

describe('label penggaris (KOL-13)', () => {
	test('penggaris kiri cm: angka 1…29 lengkap, tidak ada yang hilang', () => {
		const labels = rulerTicks(A4_HEIGHT, 'cm', 1)
			.filter((tick) => tick.kind === 'label')
			.map((tick) => tick.value)
		expect(labels).toEqual(Array.from({ length: 29 }, (_, i) => i + 1))
	})

	test('penggaris atas ikut satuan yang sama: cm 1…21, inci 1…8', () => {
		const cm = rulerTicks(A4_WIDTH, 'cm', 1).filter((tick) => tick.kind === 'label')
		const inch = rulerTicks(A4_WIDTH, 'in', 1).filter((tick) => tick.kind === 'label')
		expect(cm.map((tick) => tick.value)).toEqual(Array.from({ length: 21 }, (_, i) => i + 1))
		expect(inch.map((tick) => tick.value)).toEqual(Array.from({ length: 8 }, (_, i) => i + 1))
	})

	test('posisi label tepat di kelipatan satuan', () => {
		const ten = rulerTicks(A4_HEIGHT, 'cm', 1).find((tick) => tick.value === 10)
		expect(ten?.at).toBeCloseTo((10 * INCH) / 2.54)
	})

	test('diperkecil: garis lebih jarang, label tetap lengkap', () => {
		const dense = rulerTicks(A4_HEIGHT, 'cm', 1)
		const sparse = rulerTicks(A4_HEIGHT, 'cm', 0.5)
		expect(sparse.length).toBeLessThan(dense.length)
		expect(sparse.filter((tick) => tick.kind === 'label')).toHaveLength(29)
	})

	test('garis tengah satuan bertanda major', () => {
		const half = rulerTicks(A4_WIDTH, 'in', 1).find((tick) => Math.abs(tick.at - INCH / 2) < 0.01)
		expect(half?.kind).toBe('major')
	})
})
