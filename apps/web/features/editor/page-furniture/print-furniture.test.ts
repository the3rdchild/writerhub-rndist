import { describe, expect, test } from 'bun:test'
import { ACADEMIC_NUMBERING } from '@writer-hub/shared'
import { DEFAULT_PAGE_SETUP, type PageSetup } from '@/features/editor/page-geometry'
import { type PrintFurnitureInput, printFurnitureRules } from './print-furniture'

const front: PageSetup = { ...DEFAULT_PAGE_SETUP, pageNumbering: ACADEMIC_NUMBERING.front }
const body: PageSetup = { ...DEFAULT_PAGE_SETUP, pageNumbering: ACADEMIC_NUMBERING.body }

function rules(input: Partial<PrintFurnitureInput>): string {
	return printFurnitureRules({
		sections: [DEFAULT_PAGE_SETUP],
		lines: {},
		has: () => false,
		showPageNumbers: true,
		fontFamily: 'serif',
		...input,
	})
}

/** Isi satu kotak margin di satu aturan `@page`, mis. ('@page sec1o ', 'bottom-center'). */
function box(css: string, page: string, name: string): string | null {
	const start = css.split('\n').find((line) => line.startsWith(`${page}{`) || line.startsWith(`${page} {`))
	const match = start ? new RegExp(`@${name} \\{ content: ([^;]+);`).exec(start) : null
	return match ? match[1] : null
}

describe('perabot di kertas cetak', () => {
	test('karya ilmiah: romawi tengah bawah; BAB I penghitung baru, pembuka tengah bawah, lainnya kanan atas', () => {
		const css = rules({
			sections: [front, body],
			has: (slot, variant) => variant === 'first' && slot === 'footer',
		})
		expect(box(css, '@page', 'bottom-center')).toBe('counter(wh-run-0, lower-roman)')
		expect(box(css, '@page:first', 'bottom-center')).toBe('none')
		expect(box(css, '@page sec1', 'top-right')).toBe('counter(wh-run-1, decimal)')
		expect(box(css, '@page sec1', 'bottom-center')).toBe('none')
		expect(box(css, '@page sec1o', 'bottom-center')).toBe('counter(wh-run-1, decimal)')
		expect(box(css, '@page sec1o', 'top-right')).toBe('none')
		expect(css).toContain('@page sec1 { counter-increment: wh-run-1 1;')
	})

	test('bagian yang melanjutkan memakai penghitung bagian sebelumnya; mulai dari 5 naik 5 di lembar pertamanya', () => {
		const next: PageSetup = {
			...DEFAULT_PAGE_SETUP,
			pageNumbering: { format: 'decimal', restart: 'continue' },
		}
		const fromFive: PageSetup = { ...DEFAULT_PAGE_SETUP, pageNumbering: { format: 'decimal', restart: 5 } }
		const css = rules({ sections: [DEFAULT_PAGE_SETUP, next, fromFive] })
		expect(css).toContain('@page sec1 { counter-increment: wh-run-0 1;')
		expect(css).toContain('@page sec2f { counter-increment: wh-run-2 5;')
	})

	test('header/footer: token menjadi penghitung, teks di-escape, perataan memilih kotaknya', () => {
		const css = rules({
			lines: { footer: { default: { text: 'Hal. {page} dari {pages} "draf"', align: 'right' } } },
			has: (slot, variant) => slot === 'footer' && variant === 'default',
		})
		expect(box(css, '@page', 'bottom-right')).toBe(
			'"Hal. " counter(wh-run-0, decimal) " dari " counter(pages) " \\"draf\\""',
		)
		// Perabot sudah membawa nomor: lencana cadangan tidak ditambahkan.
		expect(box(css, '@page', 'bottom-center')).toBe('none')
	})

	test('tanpa letak dan tanpa perabot bernomor: lencana kanan bawah, bila pengaturannya menyala', () => {
		expect(box(rules({}), '@page', 'bottom-right')).toBe('counter(wh-run-0, decimal)')
		expect(box(rules({ showPageNumbers: false }), '@page', 'bottom-right')).toBe('none')
	})

	test('bagian yang nomornya disembunyikan tetap dihitung, tanpa nomor', () => {
		const hidden: PageSetup = {
			...DEFAULT_PAGE_SETUP,
			pageNumbering: { format: 'decimal', restart: 'continue', show: false },
		}
		const css = rules({ sections: [hidden] })
		expect(box(css, '@page', 'bottom-right')).toBe('none')
		expect(css).toContain('@page { counter-increment: wh-run-0 1;')
	})
})
