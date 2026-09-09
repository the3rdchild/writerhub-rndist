import { describe, expect, test } from 'bun:test'
import { tabLayoutOverrideSchema, tabLayoutSchema } from './dto'

const VALID_SETUP = {
	size: 'a4',
	orientation: 'portrait',
	margins: { top: 96, right: 96, bottom: 96, left: 96 },
	pageColor: null,
	pageless: false,
}

describe('tabLayoutSchema', () => {
	test('tata letak utuh diterima apa adanya', () => {
		const layout = {
			pageSetup: { ...VALID_SETUP, size: 'a5', customWidth: undefined },
			furniture: { footer: { default: { text: 'Hal {page}', align: 'right' } } },
		}
		const parsed = tabLayoutSchema.safeParse(layout)
		expect(parsed.success).toBe(true)
	})

	test('pageSetup tanpa margins ditolak', () => {
		const { margins, ...setup } = VALID_SETUP
		expect(tabLayoutSchema.safeParse({ pageSetup: setup }).success).toBe(false)
	})

	test('ukuran kertas di luar daftar ditolak', () => {
		expect(tabLayoutSchema.safeParse({ pageSetup: { ...VALID_SETUP, size: 'a2' } }).success).toBe(false)
	})
})

describe('tabLayoutOverrideSchema', () => {
	test('objek kosong sah - tab tanpa penimpa', () => {
		expect(tabLayoutOverrideSchema.safeParse({}).success).toBe(true)
	})

	test('perabot saja tanpa pageSetup sah', () => {
		const parsed = tabLayoutOverrideSchema.safeParse({
			furniture: {
				header: { first: { text: 'Kop', align: 'center' } },
				footer: { even: { text: '{page}', align: 'left' } },
			},
		})
		expect(parsed.success).toBe(true)
	})

	test('varian perabot di luar default/first/even ditolak', () => {
		const parsed = tabLayoutOverrideSchema.safeParse({
			furniture: { header: { ketiga: { text: 'X', align: 'left' } } },
		})
		expect(parsed.success).toBe(false)
	})
})

/*
 * `z.object` membuang kunci yang tidak dikenalnya. Bidang `pageSetup` yang lupa
 * didaftarkan di skema akan tersimpan di peramban lalu lenyap begitu tab
 * disinkron - dan karena muatan ekspor dibangun dari baris peladen, hilangnya
 * baru ketahuan sebagai "kenapa PDF-nya tidak ada watermarknya".
 */
describe('watermark selamat melewati skema', () => {
	const WATERMARK = {
		kind: 'text' as const,
		text: 'RAHASIA',
		anchor: 'center' as const,
		offsetX: 0,
		offsetY: 0,
		scale: 0.6,
		opacity: 0.15,
		rotation: -45,
	}

	test('watermark teks tidak dibuang saat parsing', () => {
		const parsed = tabLayoutOverrideSchema.safeParse({
			pageSetup: { ...VALID_SETUP, watermark: WATERMARK },
		})
		expect(parsed.success).toBe(true)
		expect(parsed.data?.pageSetup?.watermark).toEqual(WATERMARK)
	})

	test('watermark gambar membawa assetId-nya', () => {
		const watermark = {
			...WATERMARK,
			kind: 'image' as const,
			text: undefined,
			assetId: 'a1',
			anchor: 'tile' as const,
		}
		const parsed = tabLayoutSchema.safeParse({
			pageSetup: { ...VALID_SETUP, watermark },
		})
		expect(parsed.success).toBe(true)
		expect(parsed.data?.pageSetup.watermark?.assetId).toBe('a1')
	})

	test('pageSetup tanpa watermark tetap sah - ia opsional', () => {
		expect(tabLayoutOverrideSchema.safeParse({ pageSetup: VALID_SETUP }).success).toBe(true)
	})

	test('jangkar di luar daftar ditolak, bukan diam-diam dibetulkan', () => {
		const parsed = tabLayoutOverrideSchema.safeParse({
			pageSetup: { ...VALID_SETUP, watermark: { ...WATERMARK, anchor: 'entah' } },
		})
		expect(parsed.success).toBe(false)
	})
})
