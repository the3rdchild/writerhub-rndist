import { describe, expect, test } from 'bun:test'
import {
	DESIGN_MAX_PAGES,
	designOrientation,
	designPageCount,
	designPageSetup,
	designPageSize,
} from './design-layout'

describe('lembar rancangan dibaca dari permintaannya', () => {
	test('ukuran kertas dipungut dari kata kuncinya', () => {
		expect(designPageSize('Buatkan poster A3 aksi')).toBe('a3')
		expect(designPageSize('flyer a5 untuk kajian')).toBe('a5')
		expect(designPageSize('undangan ukuran Letter')).toBe('letter')
	})

	test('tanpa kata kunci, A4 potret', () => {
		expect(designPageSize('Buatkan flyer aksi')).toBe('a4')
		expect(designOrientation('Buatkan flyer aksi')).toBe('portrait')
		expect(designPageSize(undefined)).toBe('a4')
	})

	test('orientasi mengerti dua bahasa', () => {
		expect(designOrientation('spanduk A3 lanskap')).toBe('landscape')
		expect(designOrientation('banner landscape')).toBe('landscape')
		expect(designOrientation('flyer potret')).toBe('portrait')
	})

	/*
	 * "a4" di dalam kata lain bukan ukuran kertas. Batas kata menjaga
	 * "Sertifikat Ba4ng" atau URL yang memuat "a4" dari mengubah lembarnya.
	 */
	test('ukuran hanya cocok sebagai kata utuh', () => {
		expect(designPageSize('Buatkan flyer xa4x')).toBe('a4')
		expect(designPageSize('Buatkan flyer a34')).toBe('a4')
	})

	/*
	 * Margin nol bukan penyederhanaan: rancangan satu halaman memang menembus
	 * margin sampai tepi kertas, dan margin yang tersisa hanya memendekkan
	 * kotak kontennya sehingga rancangan setinggi 100% berhenti sebelum tepi.
	 */
	test('rancangan lahir tanpa margin', () => {
		expect(designPageSetup('poster A3 lanskap').margins).toEqual({
			top: 0,
			right: 0,
			bottom: 0,
			left: 0,
		})
	})

	test('setup-nya utuh dan tidak pageless', () => {
		expect(designPageSetup('poster A3 lanskap')).toEqual({
			size: 'a3',
			orientation: 'landscape',
			margins: { top: 0, right: 0, bottom: 0, left: 0 },
			pageColor: null,
			pageless: false,
		})
	})
})

describe('jumlah halaman rancangan (T2)', () => {
	test('angka di depan kata halaman dibaca, dua bahasa', () => {
		expect(designPageCount('buatkan flyer 3 halaman bahaya abu')).toBe(3)
		expect(designPageCount('a 5-page product brochure')).toBe(5)
	})

	test('tanpa angka: null - model yang menentukan', () => {
		expect(designPageCount('buatkan flyer aksi')).toBeNull()
		expect(designPageCount(undefined)).toBeNull()
	})

	/* "halaman 3" adalah NOMOR halaman, bukan jumlah - jangan tertukar. */
	test('angka di belakang kata tidak dibaca', () => {
		expect(designPageCount('lihat halaman 3 untuk detail')).toBeNull()
	})

	test('angka mustahil dipingit ke batas yang wajar', () => {
		expect(designPageCount('poster 99 halaman')).toBe(DESIGN_MAX_PAGES)
		expect(designPageCount('flyer 0 halaman')).toBe(1)
	})
})
