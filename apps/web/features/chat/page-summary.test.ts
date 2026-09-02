import { describe, expect, test } from 'bun:test'
import { DEFAULT_PAGE_SETUP, type PageSetup } from '@/features/editor/page-geometry'
import { pageSummary } from './tools'

const a4: PageSetup = { ...DEFAULT_PAGE_SETUP, size: 'a4', orientation: 'portrait' }

describe('geometri halaman untuk model', () => {
	/*
	 * Alasan baris ini ikut di setiap permintaan: rancangan HTML satu halaman
	 * harus tahu kertasnya potret atau lanskap sebelum menulis satu baris CSS,
	 * dan mengandalkan model ingat memanggil get_page_setup terbukti tidak cukup.
	 */
	test('menyebut orientasi secara harfiah', () => {
		expect(pageSummary(a4)).toContain('portrait')
		expect(pageSummary({ ...a4, orientation: 'landscape' })).toContain('landscape')
	})

	test('menyebut ukuran lembar dalam piksel, bukan cuma nama kertas', () => {
		const summary = pageSummary(a4)

		expect(summary).toContain('794x1123px')
		expect(summary).toContain('96dpi')
	})

	// Lanskap menukar sisi-sisinya; kalau tidak, model menulis lebar 794 di
	// kertas selebar 1123 dan rancangannya terpotong di kanan.
	test('lanskap menukar sisi lembarnya', () => {
		expect(pageSummary({ ...a4, orientation: 'landscape' })).toContain('1123x794px')
	})

	test('kotak konten disebut terpisah dari lembar', () => {
		const summary = pageSummary(a4)

		expect(summary).toContain('sheet')
		expect(summary).toContain('content box')
	})

	// Mode pageless tidak punya lembar; menyebut ukuran di sana adalah dusta.
	test('pageless mengaku tidak punya lembar tetap', () => {
		const summary = pageSummary({ ...a4, pageless: true })

		expect(summary).toContain('pageless')
		// Yang tidak boleh ada adalah ukurannya, bukan katanya.
		expect(summary).not.toContain('96dpi')
		expect(summary).not.toMatch(/\d+x\d+px/)
	})

	test('ukuran kustom memakai angkanya sendiri', () => {
		const summary = pageSummary({
			...a4,
			size: 'custom',
			customWidth: 600,
			customHeight: 900,
		})

		expect(summary).toContain('600x900px')
	})
})
