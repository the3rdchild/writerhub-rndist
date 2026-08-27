import { describe, expect, test } from 'bun:test'
import { ptToPx, pxToPt } from './spacing-units'

describe('ptToPx', () => {
	test('12 pt menjadi 16 px (kelipatan persis)', () => {
		expect(ptToPx(12)).toBe(16)
	})

	test('hasil dibulatkan ke piksel terdekat', () => {
		expect(ptToPx(1)).toBe(1)
		expect(ptToPx(7)).toBe(9)
	})
})

describe('pxToPt', () => {
	test('16 px menjadi 12 pt', () => {
		expect(pxToPt(16)).toBe(12)
	})

	test('nol tetap nol', () => {
		expect(pxToPt(0)).toBe(0)
	})
})
