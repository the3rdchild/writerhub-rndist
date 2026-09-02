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
		expect(
			tabLayoutSchema.safeParse({ pageSetup: { ...VALID_SETUP, size: 'a2' } }).success,
		).toBe(false)
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
