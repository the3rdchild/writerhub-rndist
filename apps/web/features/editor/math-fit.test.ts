import { describe, expect, test } from 'bun:test'
import katex from 'katex'
import { fitInlineMath, fitMath, MATH_FLOOR_SCALE, needsWrapAttempt, wrappableLatex } from './math-fit'

describe('rumus blok muat di lebar bloknya', () => {
	test('yang sudah muat tidak disentuh', () => {
		expect(fitMath(300, 325, null)).toEqual({ mode: 'display', scale: 1 })
	})

	test('sedikit terlalu lebar dikecilkan, tanpa mencoba memenggal', () => {
		expect(needsWrapAttempt(400, 325)).toBe(false)
		expect(fitMath(400, 325, null)).toEqual({ mode: 'display', scale: 325 / 400 })
	})

	test('jauh terlalu lebar dan bisa dipenggal → dipenggal', () => {
		expect(needsWrapAttempt(1200, 325)).toBe(true)
		expect(fitMath(1200, 325, 320)).toEqual({ mode: 'wrap' })
	})

	test('tidak bisa dipenggal (matriks) → dikecilkan sampai batas bawah', () => {
		expect(fitMath(600, 325, 600)).toEqual({ mode: 'display', scale: 325 / 600 })
		expect(fitMath(2000, 325, 2000)).toEqual({ mode: 'display', scale: MATH_FLOOR_SCALE })
	})

	test('blok belum berlebar (belum terpasang) tidak diubah', () => {
		expect(fitMath(500, 0, null)).toEqual({ mode: 'display', scale: 1 })
	})
})

describe('LaTeX yang bisa dipenggal', () => {
	// Dari 69565-277381-1-RV.docx: daftar panjang di dalam \left\{ … \right\}.
	const list = '{Z}_{1}^{+}=\\max \\left\\{0.053;0.066;0.027;0.053\\right\\}'

	test('\\left/\\right dilepas dan pemisah teratas diberi \\allowbreak', () => {
		expect(wrappableLatex(list)).toBe(
			'\\displaystyle {Z}_{1}^{+}=\\max \\{0.053;\\allowbreak 0.066;\\allowbreak 0.027;\\allowbreak 0.053\\}',
		)
	})

	test('pemisah di dalam kurung kurawal (argumen) tidak disentuh', () => {
		expect(wrappableLatex('\\frac{a,b}{c}, d')).toBe('\\displaystyle \\frac{a,b}{c},\\allowbreak  d')
	})

	test('\\left. dan \\right. (pembatas kosong) hilang', () => {
		expect(wrappableLatex('\\left. x \\right|')).toBe('\\displaystyle  x |')
	})

	test('hasilnya LaTeX yang sah bagi KaTeX', () => {
		for (const latex of [
			list,
			'\\left( \\frac{1}{2} \\right) = \\left[ a, b \\right]',
			'D_{1}^{-}=\\sqrt{\\sum_{j}(x_j-y_j)^2}',
		]) {
			expect(() =>
				katex.renderToString(wrappableLatex(latex), { throwOnError: true, strict: false }),
			).not.toThrow()
		}
	})
})

describe('rumus mengalir bergaya display muat di paragrafnya', () => {
	const never = () => {
		throw new Error('versi mudah-dipenggal tidak perlu diukur')
	}

	test('yang muat tidak disentuh', () => {
		expect(fitInlineMath(302, 290, 200, never)).toEqual({ latex: 'plain', scale: 1 })
	})

	test('sedikit kelebaran ("U =" + matriks 21 + 284 px di kolom 302) → kecil, tetap satu baris', () => {
		const fit = fitInlineMath(302, 305, 284, never)
		expect(fit.latex).toBe('plain')
		expect(fit.scale).toBeCloseTo((302 / 305) * 0.98)
	})

	test('jauh kelebaran tapi bisa dipenggal di relasi → dipenggal, ukuran tetap', () => {
		expect(fitInlineMath(302, 900, 280, never)).toEqual({ latex: 'plain', scale: 1 })
	})

	test('daftar panjang dalam \\left\\{…\\right\\} → versi mudah-dipenggal', () => {
		expect(fitInlineMath(302, 900, 860, () => 80)).toEqual({ latex: 'wrappable', scale: 1 })
	})

	test('matriks lebar yang tidak bisa dipenggal → dikecilkan seluruhnya', () => {
		const fit = fitInlineMath(302, 640, 620, () => 620)
		expect(fit.latex).toBe('plain')
		expect(fit.scale).toBeCloseTo((302 / 640) * 0.98)
	})

	test('terlalu lebar untuk batas bawah → potongan terlebar dikecilkan sampai batas bawah', () => {
		expect(fitInlineMath(302, 3000, 2000, () => 2000)).toEqual({
			latex: 'wrappable',
			scale: MATH_FLOOR_SCALE,
		})
	})
})
