import { describe, expect, test } from 'bun:test'
import { DEFAULT_TARGET_WORDS, draftPercent, MAX_WRITING_PERCENT, targetCharacters } from './progress'

describe('targetCharacters', () => {
	test('panjang yang diminta pemanggil dipakai apa adanya', () => {
		expect(targetCharacters(1_000)).toBeGreaterThan(targetCharacters(500))
	})

	test('tanpa permintaan panjang, dipakai target bawaan', () => {
		expect(targetCharacters(undefined)).toBe(targetCharacters(DEFAULT_TARGET_WORDS))
	})

	test('tidak pernah nol - ia dipakai sebagai pembagi', () => {
		expect(targetCharacters(0)).toBeGreaterThan(0)
	})
})

describe('draftPercent', () => {
	const target = targetCharacters(600)

	test('tahap persiapan sudah menunjukkan gerak, tapi belum jauh', () => {
		const percent = draftPercent('preparing', 0, target)

		expect(percent).toBeGreaterThan(0)
		expect(percent).toBeLessThan(10)
	})

	test('naik seiring naskah yang masuk', () => {
		const awal = draftPercent('writing', target * 0.25, target)
		const tengah = draftPercent('writing', target * 0.5, target)

		expect(tengah).toBeGreaterThan(awal)
	})

	// Inti kejujuran angka ini: model tidak tahu panjang keluarannya sendiri,
	// jadi naskah yang melewati target tidak boleh membuat bar penuh lalu diam.
	test('naskah yang melewati target tetap berhenti di bawah 100', () => {
		expect(draftPercent('writing', target * 10, target)).toBe(MAX_WRITING_PERCENT)
	})

	test('tahap penyimpanan berada di atas seluruh tahap penulisan', () => {
		expect(draftPercent('saving', 0, target)).toBeGreaterThan(MAX_WRITING_PERCENT)
		expect(draftPercent('saving', 0, target)).toBeLessThan(100)
	})

	test('target yang tidak masuk akal tidak menghasilkan angka liar', () => {
		expect(draftPercent('writing', 100, 0)).toBeGreaterThanOrEqual(0)
		expect(draftPercent('writing', 100, 0)).toBeLessThanOrEqual(MAX_WRITING_PERCENT)
	})
})
