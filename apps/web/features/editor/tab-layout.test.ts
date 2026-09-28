import { describe, expect, test } from 'bun:test'
import { tabWidth } from './tab-layout'

const px = (pt: number) => (pt * 96) / 72

describe('lebar tab seperti Word', () => {
	test('tanpa tab stop: ke kelipatan 0,5 inci berikutnya', () => {
		expect(tabWidth(0, 0, [])).toBeCloseTo(px(36))
		expect(tabWidth(px(10), 0, [])).toBeCloseTo(px(26))
		// Tepat di kelipatan: loncat ke kelipatan berikutnya, bukan lebar nol.
		expect(tabWidth(px(36), 0, [])).toBeCloseTo(px(36))
	})

	test('tab stop kiri: teks sesudahnya mulai di tab stop, dari mana pun asalnya', () => {
		const stops = [{ posPt: 120, type: 'left' as const }]
		// "Nama" dan "Tempat, Tanggal Lahir" berbeda panjang, titik dua tetap di 120 pt.
		expect(px(20) + tabWidth(px(20), 0, stops)).toBeCloseTo(px(120))
		expect(px(95) + tabWidth(px(95), 0, stops)).toBeCloseTo(px(120))
	})

	test('sesudah tab stop terakhir: kembali ke kelipatan 0,5 inci', () => {
		const stops = [{ posPt: 120, type: 'left' as const }]
		expect(px(130) + tabWidth(px(130), 0, stops)).toBeCloseTo(px(144))
	})

	test('tab stop kanan dan tengah menghitung lebar teks sesudahnya', () => {
		expect(tabWidth(0, px(40), [{ posPt: 200, type: 'right' }])).toBeCloseTo(px(160))
		expect(tabWidth(0, px(40), [{ posPt: 200, type: 'center' }])).toBeCloseTo(px(180))
	})

	test('tab stop kanan yang tidak muat dilewati', () => {
		expect(
			tabWidth(px(150), px(80), [
				{ posPt: 200, type: 'right' },
				{ posPt: 300, type: 'left' },
			]),
		).toBeCloseTo(px(150))
	})
})
