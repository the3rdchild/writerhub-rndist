import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'

/**
 * Penjaga struktur cetak (E1). Aturan `@media print` tidak bisa dijalankan
 * `bun test`, tapi yang meleset pada E1 justru strukturnya - selektor yang
 * diam-diam berhenti mengenali susunan DOM - jadi di sinilah ia dijaga:
 * penanda JSX dan selektor CSS-nya harus selalu datang sepaket, dan selektor
 * lama tidak boleh hidup berdampingan dengan yang baru (dua sumber kebenaran).
 */

const canvas = readFileSync(new URL('../../components/editor/document-canvas.tsx', import.meta.url), 'utf8')
const css = readFileSync(new URL('../../app/globals.css', import.meta.url), 'utf8')

describe('document-print-root (E1)', () => {
	test('kanvas menandai bingkai zoom-nya document-print-root', () => {
		// Bingkai zoom yang dipilih, bukan pembungkus editor di luarnya: hanya ia
		// yang memuat naskah tanpa chrome (penggaris, bilah status, spanduk).
		expect(canvas).toContain('document-print-root')
	})

	test('CSS cetak menyatakan yang boleh dicetak secara positif', () => {
		// Leluhur naskah kehilangan kotaknya; selain naskah tidak ada yang dicetak.
		expect(css).toContain('body *:has(.document-print-root)')
		expect(css).toContain(':not(.document-print-root *)')
	})

	test('selektor chrome lama tidak hidup berdampingan dengan yang baru', () => {
		// Dua sumber kebenaran: yang salah tetap terlihat benar selama yang benar
		// kebetulan menang - persis bagaimana E1 bisa lolos dulu.
		expect(css).not.toContain('.document-canvas ~ *')
	})
})
