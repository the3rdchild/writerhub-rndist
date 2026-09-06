import { describe, expect, test } from 'bun:test'
import { sanitizeAIDashes, sanitizeToolArguments } from './dashes'

describe('pembersih dash AI - prosa', () => {
	test('em dash ber-spasi jadi koma', () => {
		expect(sanitizeAIDashes('Sistem ini cepat — sangat cepat.')).toBe('Sistem ini cepat, sangat cepat.')
	})

	test('en dash prosa juga diganti', () => {
		expect(sanitizeAIDashes('kata – keterangan')).toBe('kata, keterangan')
	})

	test('dash menempel tanpa spasi tetap berubah koma ber-spasi', () => {
		expect(sanitizeAIDashes('kata—keterangan')).toBe('kata, keterangan')
	})

	test('dash di awal baris (dialog naratif) dibiarkan', () => {
		expect(sanitizeAIDashes('— Dia berkata pelan.')).toBe('— Dia berkata pelan.')
		expect(sanitizeAIDashes('paragraf.\n— Balasan.')).toBe('paragraf.\n— Balasan.')
	})

	test('beberapa dash dalam satu baris diganti semuanya', () => {
		expect(sanitizeAIDashes('a — b — c')).toBe('a, b, c')
	})

	test('teks tanpa dash kembali apa adanya', () => {
		expect(sanitizeAIDashes('Hyphen biasa - seperti ini - tetap.')).toBe(
			'Hyphen biasa - seperti ini - tetap.',
		)
	})
})

describe('pembersih dash AI - rentang angka', () => {
	test('rentang en dash dipertahankan dan dirapikan tanpa spasi', () => {
		expect(sanitizeAIDashes('2019 – 2020')).toBe('2019–2020')
		expect(sanitizeAIDashes('halaman 12–15')).toBe('halaman 12–15')
	})

	test('rentang em dash dinormalkan ke en dash', () => {
		expect(sanitizeAIDashes('2019 — 2020')).toBe('2019–2020')
	})

	test('digit lalu dash lalu kata tetap diproses sebagai prosa', () => {
		expect(sanitizeAIDashes('tahun 2019 — sekarang')).toBe('tahun 2019, sekarang')
	})
})

describe('pembersih dash AI - argumen tool', () => {
	test('nilai string dibersihkan, struktur JSON utuh', () => {
		const raw = JSON.stringify({ title: 'Bab — Pendahuluan', rows: ['a — b'], n: 5 })
		const out = JSON.parse(sanitizeToolArguments(raw)) as {
			title: string
			rows: string[]
			n: number
		}
		expect(out.title).toBe('Bab, Pendahuluan')
		expect(out.rows[0]).toBe('a, b')
		expect(out.n).toBe(5)
	})

	test('rentang di dalam nilai tetap utuh', () => {
		const raw = JSON.stringify({ text: 'periode 2020 – 2025 aktif — sepenuhnya.' })
		const out = JSON.parse(sanitizeToolArguments(raw)) as { text: string }
		expect(out.text).toBe('periode 2020–2025 aktif, sepenuhnya.')
	})

	test('untai yang bukan JSON dibersihkan mentah, tanpa meledak', () => {
		expect(sanitizeToolArguments('bukan json — sama sekali')).toBe('bukan json, sama sekali')
	})
})
