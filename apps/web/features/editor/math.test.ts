import { describe, expect, test } from 'bun:test'
import { findMath, looksLikeBareLatex, stripDelimiters, wholeParagraphLatex } from './math'
describe('menemukan rumus', () => {
	test('inline sederhana', () => {
		const found = findMath('Misalkan $x^2 + y^2 = z^2$ berlaku.')
		expect(found).toHaveLength(1)
		expect(found[0].latex).toBe('x^2 + y^2 = z^2')
		expect(found[0].display).toBe(false)
	})
	test('pembatas LaTeX \\[…\\]', () => {
		const found = findMath('\\[\\int_{-\\infty}^{\\infty} e^{-x^2}\\,dx = \\sqrt{\\pi}\\]')
		expect(found).toHaveLength(1)
		expect(found[0].latex).toBe('\\int_{-\\infty}^{\\infty} e^{-x^2}\\,dx = \\sqrt{\\pi}')
		expect(found[0].display).toBe(true)
	})

	test('pembatas LaTeX bisa melewati baris', () => {
		const found = findMath('\\[\n\\int_0^1 f(x)\\,dx\n\\]')
		expect(found).toHaveLength(1)
		expect(found[0].latex).toBe('\\int_0^1 f(x)\\,dx')
		expect(found[0].display).toBe(true)
	})

	test('pembatas \\(…\\) inline', () => {
		const found = findMath('Misalkan \\(x^2\\) berlaku.')
		expect(found).toHaveLength(1)
		expect(found[0].latex).toBe('x^2')
		expect(found[0].display).toBe(false)
	})

	test('lingkungan equation', () => {
		const found = findMath('\\begin{equation}E = mc^2\\end{equation}')
		expect(found).toHaveLength(1)
		expect(found[0].latex).toBe('E = mc^2')
		expect(found[0].display).toBe(true)
	})

	test('lingkungan align* cocok dengan penutupnya', () => {
		const found = findMath('\\begin{align*}a &= b \\\\ c &= d\\end{align*}')
		expect(found).toHaveLength(1)
		expect(found[0].latex).toBe('a &= b \\\\ c &= d')
	})

	test('campuran pembatas tidak saling memotong', () => {
		const found = findMath('$a$ lalu \\(b\\) lalu \\[c\\]')
		expect(found.map((item) => [item.latex, item.display])).toEqual([
			['a', false],
			['b', false],
			['c', true],
		])
	})
	test('blok dikenali sebagai blok, bukan dua inline', () => {
		const found = findMath('$$\\int_0^1 f(x)\\,dx$$')
		expect(found).toHaveLength(1)
		expect(found[0].display).toBe(true)
		expect(found[0].latex).toBe('\\int_0^1 f(x)\\,dx')
	})

	test('blok dan inline dalam satu teks tidak saling memotong', () => {
		const found = findMath('Awal $a+b$ lalu $$c+d$$ selesai.')
		expect(found.map((item) => [item.latex, item.display])).toEqual([
			['a+b', false],
			['c+d', true],
		])
	})

	test('beberapa inline berurutan', () => {
		expect(findMath('$a$ dan $b$ dan $c$').map((item) => item.latex)).toEqual(['a', 'b', 'c'])
	})

	test('urutannya mengikuti posisi di teks', () => {
		const found = findMath('$$blok$$ lalu $inline$')
		expect(found[0].from).toBeLessThan(found[1].from)
	})
})

describe('yang bukan rumus', () => {
	test('harga tidak dianggap rumus', () => {
		expect(findMath('Harganya $5 dan $10 saja.')).toEqual([])
	})

	test('dolar tunggal tanpa penutup', () => {
		expect(findMath('Biaya $100 per bulan')).toEqual([])
	})

	test('pembatas kosong dilewati', () => {
		expect(findMath('$$ $$')).toEqual([])
	})

	test('teks tanpa dolar sama sekali', () => {
		expect(findMath('Kalimat biasa tanpa rumus.')).toEqual([])
	})
})

describe('pembatas pada seleksi', () => {
	test('dolar tunggal dibuang', () => {
		expect(stripDelimiters('$x^2$')).toBe('x^2')
	})

	test('dolar ganda dibuang', () => {
		expect(stripDelimiters('$$x^2$$')).toBe('x^2')
	})
	test('kurung siku dibuang', () => {
		expect(stripDelimiters('\\[x^2\\]')).toBe('x^2')
	})

	test('kurung biasa dibuang', () => {
		expect(stripDelimiters('\\(x^2\\)')).toBe('x^2')
	})
	test('tanpa pembatas dibiarkan', () => {
		expect(stripDelimiters('  x^2  ')).toBe('x^2')
	})
})

describe('menebak LaTeX telanjang', () => {
	test('perintah LaTeX dikenali', () => {
		expect(looksLikeBareLatex('\\frac{a}{b}')).toBe(true)
	})

	test('superskrip dikenali', () => {
		expect(looksLikeBareLatex('x^2')).toBe(true)
	})

	test('kalimat biasa tidak', () => {
		expect(looksLikeBareLatex('ini kalimat biasa')).toBe(false)
	})

	test('yang sudah berpembatas bukan urusan fungsi ini', () => {
		expect(looksLikeBareLatex('$x^2$')).toBe(false)
	})
})
describe('paragraf utuh rumus blok', () => {
	test('dolar ganda', () => {
		expect(wholeParagraphLatex('$$x^2$$')).toBe('x^2')
	})

	test('kurung siku', () => {
		expect(wholeParagraphLatex('\\[x^2\\]')).toBe('x^2')
	})

	test('lingkungan equation', () => {
		expect(wholeParagraphLatex('\\begin{equation}x^2\\end{equation}')).toBe('x^2')
	})

	test('bukan paragraf utuh', () => {
		expect(wholeParagraphLatex('teks $$x^2$$')).toBeNull()
		expect(wholeParagraphLatex('kalimat biasa')).toBeNull()
	})
})
