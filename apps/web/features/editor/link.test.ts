import { describe, expect, test } from 'bun:test'
import { normalizeHref } from './link'

describe('normalisasi alamat tautan (TKS-11)', () => {
	test('domain tanpa skema mendapat https://', () => {
		expect(normalizeHref('contoh.id')).toBe('https://contoh.id')
		expect(normalizeHref('  contoh.id/halaman?q=1 ')).toBe('https://contoh.id/halaman?q=1')
	})

	test('email menjadi mailto:', () => {
		expect(normalizeHref('nama@contoh.id')).toBe('mailto:nama@contoh.id')
	})

	test('skema, path, dan anchor dibiarkan', () => {
		expect(normalizeHref('https://contoh.id')).toBe('https://contoh.id')
		expect(normalizeHref('mailto:a@b.id')).toBe('mailto:a@b.id')
		expect(normalizeHref('tel:+62811')).toBe('tel:+62811')
		expect(normalizeHref('/bantuan')).toBe('/bantuan')
		expect(normalizeHref('#bab-2')).toBe('#bab-2')
		expect(normalizeHref('   ')).toBe('')
	})
})
