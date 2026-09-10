import { describe, expect, test } from 'bun:test'
import { DEFAULT_PAGE_SETUP, pageGeometry } from './page-geometry'
import {
	DEFAULT_WATERMARK,
	effectiveScale,
	TILE_COLUMNS,
	TILE_ROWS,
	type Watermark,
	watermarkBox,
	watermarkIsEmpty,
	watermarkSizePx,
	watermarkSlots,
	watermarkTransform,
} from './watermark'

const at = (patch: Partial<Watermark> = {}): Watermark => ({ ...DEFAULT_WATERMARK, ...patch })

describe('watermarkSlots', () => {
	test('jangkar tengah duduk di tengah kotak isi dan digeser separuh dirinya', () => {
		const [slot] = watermarkSlots(at({ anchor: 'center' }))
		expect(slot.left).toBe(0.5)
		expect(slot.top).toBe(0.5)
		expect(slot.shiftX).toBe(-50)
		expect(slot.shiftY).toBe(-50)
	})

	test('jangkar sudut menempelkan sisinya, bukan titik tengahnya', () => {
		const [kiriAtas] = watermarkSlots(at({ anchor: 'top-left' }))
		expect(kiriAtas.shiftX).toBe(0)
		expect(kiriAtas.shiftY).toBe(0)

		const [kananBawah] = watermarkSlots(at({ anchor: 'bottom-right' }))
		expect(kananBawah.shiftX).toBe(-100)
		expect(kananBawah.shiftY).toBe(-100)
		/* Simetris terhadap jangkar kiri-atas: sisipan tepinya sama besar. */
		expect(kananBawah.left).toBeCloseTo(1 - kiriAtas.left, 10)
		expect(kananBawah.top).toBeCloseTo(1 - kiriAtas.top, 10)
	})

	test('jangkar tepi hanya mengunci satu sumbu', () => {
		const [kiri] = watermarkSlots(at({ anchor: 'left' }))
		expect(kiri.shiftX).toBe(0)
		expect(kiri.top).toBe(0.5)
		expect(kiri.shiftY).toBe(-50)
	})

	test('geseran ditambahkan ke titik jangkarnya', () => {
		const [slot] = watermarkSlots(at({ anchor: 'center', offsetX: 0.1, offsetY: -0.2 }))
		expect(slot.left).toBeCloseTo(0.6, 10)
		expect(slot.top).toBeCloseTo(0.3, 10)
	})

	test('ubin memenuhi kotak isi dan mengabaikan geseran', () => {
		const slots = watermarkSlots(at({ anchor: 'tile', offsetX: 0.3, offsetY: 0.3 }))
		expect(slots).toHaveLength(TILE_COLUMNS * TILE_ROWS)
		expect(slots.every((slot) => slot.shiftX === -50 && slot.shiftY === -50)).toBe(true)
		/* Petak pertama berpusat di seperenam-lebar, bukan di tepi. */
		expect(slots[0].left).toBeCloseTo(0.5 / TILE_COLUMNS, 10)
		expect(slots[0].top).toBeCloseTo(0.5 / TILE_ROWS, 10)
		/* Semua titik masih di dalam kotak isi. */
		expect(slots.every((slot) => slot.left > 0 && slot.left < 1 && slot.top > 0 && slot.top < 1)).toBe(true)
	})
})

describe('ukuran', () => {
	test('lebar dihitung dari lebar KOTAK ISI, bukan lebar kertas', () => {
		const geometry = pageGeometry(DEFAULT_PAGE_SETUP)
		expect(geometry.contentWidth).toBeLessThan(geometry.width)
		expect(watermarkSizePx(at({ scale: 0.5 }), geometry)).toBeCloseTo(geometry.contentWidth / 2, 6)
	})

	test('satu petak ubin lebih kecil daripada watermark tunggal berskala sama', () => {
		expect(effectiveScale(at({ anchor: 'tile', scale: 0.6 }))).toBeCloseTo(0.6 / TILE_COLUMNS, 10)
		expect(effectiveScale(at({ anchor: 'center', scale: 0.6 }))).toBe(0.6)
	})

	test('skala nol tidak pernah menghasilkan lebar nol', () => {
		expect(watermarkSizePx(at({ scale: 0 }), pageGeometry(DEFAULT_PAGE_SETUP))).toBeGreaterThan(0)
	})
})

describe('watermarkTransform', () => {
	test('menggeser dulu, baru memutar - putarannya di sekitar pusat watermark', () => {
		const [slot] = watermarkSlots(at({ anchor: 'center', rotation: -45 }))
		expect(watermarkTransform(slot, at({ rotation: -45 }))).toBe('translate(-50%, -50%) rotate(-45deg)')
	})
})

describe('watermarkIsEmpty', () => {
	test('tanpa watermark sama sekali', () => {
		expect(watermarkIsEmpty(undefined)).toBe(true)
	})

	test('teks kosong atau hanya spasi tidak menggambar apa pun', () => {
		expect(watermarkIsEmpty(at({ kind: 'text', text: '' }))).toBe(true)
		expect(watermarkIsEmpty(at({ kind: 'text', text: '   ' }))).toBe(true)
		expect(watermarkIsEmpty(at({ kind: 'text', text: 'RAHASIA' }))).toBe(false)
	})

	test('gambar tanpa aset maupun data URI belum bisa digambar', () => {
		expect(watermarkIsEmpty(at({ kind: 'image', text: undefined }))).toBe(true)
		expect(watermarkIsEmpty(at({ kind: 'image', assetId: 'a1' }))).toBe(false)
		/* Jalur ekspor: asetnya sudah tersemat, id-nya tidak lagi diperlukan. */
		expect(watermarkIsEmpty(at({ kind: 'image', imageDataUrl: 'data:image/png;base64,AA' }))).toBe(false)
	})
})

describe('watermarkBox - bidang acuan', () => {
	const geometry = pageGeometry(DEFAULT_PAGE_SETUP)

	test('bawaannya kotak isi, sejauh margin dari tepi kertas', () => {
		const box = watermarkBox(at(), geometry)
		expect(box.left).toBe(geometry.margins.left)
		expect(box.top).toBe(geometry.margins.top)
		expect(box.width).toBe(geometry.contentWidth)
		expect(box.height).toBe(geometry.contentHeight)
	})

	test('bleed menukarnya dengan kertas utuh', () => {
		const box = watermarkBox(at({ bleed: true }), geometry)
		expect(box.left).toBe(0)
		expect(box.top).toBe(0)
		expect(box.width).toBe(geometry.width)
		expect(box.height).toBe(geometry.height)
	})

	/*
	 * `scale` adalah fraksi bidang acuannya, bukan angka mutlak - kalau ia tetap
	 * mengukur dari kotak isi, watermark "100%" pada mode bleed akan berhenti
	 * sebelum tepi kertas dan mode itu tidak menepati namanya.
	 */
	test('ukuran ikut bidangnya: bleed lebih besar sebanding lebar kertas', () => {
		const biasa = watermarkSizePx(at({ scale: 1 }), geometry)
		const tembus = watermarkSizePx(at({ scale: 1, bleed: true }), geometry)
		expect(biasa).toBeCloseTo(geometry.contentWidth, 6)
		expect(tembus).toBeCloseTo(geometry.width, 6)
		expect(tembus).toBeGreaterThan(biasa)
	})

	test('jangkar sudut pada mode bleed tetap fraksi - yang berubah kotaknya', () => {
		/* Slot tidak tahu-menahu soal bleed: ia selalu fraksi bidang acuannya,
		 * dan itulah yang membuat satu rumus melayani kedua mode. */
		const [biasa] = watermarkSlots(at({ anchor: 'top-left' }))
		const [tembus] = watermarkSlots(at({ anchor: 'top-left', bleed: true }))
		expect(tembus.left).toBe(biasa.left)
		expect(tembus.top).toBe(biasa.top)
	})
})
