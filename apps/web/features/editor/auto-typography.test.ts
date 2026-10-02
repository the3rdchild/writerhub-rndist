import { describe, expect, test } from 'bun:test'
import { insideOpenLatex } from './auto-typography'

describe('koreksi tipografi tidak menyentuh LaTeX yang sedang diketik (OBJ-15)', () => {
	test('di dalam $…$ yang belum ditutup', () => {
		expect(insideOpenLatex('Rumus $E=mc')).toBe(true)
		expect(insideOpenLatex('$$\\int_0^1 x')).toBe(true)
		expect(insideOpenLatex('lihat \\(a+b')).toBe(true)
	})

	test('di luar rumus, atau setelah rumus ditutup', () => {
		expect(insideOpenLatex('Rumus $E=mc^2$ lalu ')).toBe(false)
		expect(insideOpenLatex('harga \\$5 dan ')).toBe(false)
		expect(insideOpenLatex('teks biasa ')).toBe(false)
		expect(insideOpenLatex('\\(a\\) dan ')).toBe(false)
	})
})
