import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'

const canvas = readFileSync(new URL('../../components/editor/document-canvas.tsx', import.meta.url), 'utf8')
const css = readFileSync(new URL('../../app/globals.css', import.meta.url), 'utf8')
const sandbox = readFileSync(new URL('./html-sandbox.ts', import.meta.url), 'utf8')
const prepare = readFileSync(new URL('../document/prepare-export.ts', import.meta.url), 'utf8')
const pdfDialog = readFileSync(
	new URL('../../components/settings/export-pdf-dialog.tsx', import.meta.url),
	'utf8',
)
const fileMenu = readFileSync(
	new URL('../../components/layout/menu-bar/file-menu.tsx', import.meta.url),
	'utf8',
)

describe('document-print-root (E1)', () => {
	test('kanvas menandai bingkai zoom-nya document-print-root', () => {
		expect(canvas).toContain('document-print-root')
	})

	test('CSS cetak menyatakan yang boleh dicetak secara positif', () => {
		expect(css).toContain('body *:has(.document-print-root)')
		expect(css).toContain(':not(.document-print-root *)')
	})

	test('selektor chrome lama tidak hidup berdampingan dengan yang baru', () => {
		expect(css).not.toContain('.document-canvas ~ *')
	})
})

describe('kesetiaan warna saat dicetak', () => {
	test('naskah memaksa warnanya ikut ke kertas', () => {
		expect(css).toContain('print-color-adjust: exact')
	})

	test('bingkai blok HTML membawa aturannya sendiri', () => {
		// Bingkainya dokumen terpisah: aturan cetak di globals.css tidak
		// menembus ke dalamnya.
		expect(sandbox).toContain('print-color-adjust: exact')
	})

	test('naskah berangkat dari palet terang berapa pun tema layarnya', () => {
		expect(css).toContain('.document-print-root {\n    color-scheme: light;')
	})
})

describe('flyer satu halaman di kertas', () => {
	test('kanvas menyuntikkan lembar tanpa margin', () => {
		expect(canvas).toContain('@page flyer')
		expect(canvas).toContain('margin: 0')
	})

	test('blok mode halaman memakai lembar itu', () => {
		expect(css).toContain('page: flyer;')
	})
})

describe('blok kode di kertas', () => {
	test('perkakas penyuntingnya tidak ikut tercetak', () => {
		expect(css).toContain('.document-body .code-block-toolbar,')
	})

	test('Mermaid tercetak sebagai diagram, bukan sumbernya', () => {
		expect(css).toContain('.code-block:has(.code-block-mermaid-print) .code-block-pre')
		expect(css).toContain('.document-body .code-block-mermaid-print {\n    display: block !important;')
	})
})

describe('penyegaran sebelum ekspor', () => {
	test('dialog PDF menunggu blok turunan selesai sebelum mencetak', () => {
		expect(pdfDialog).toContain('await prepareForExport(editor)')
	})

	test('menu Cetak menempuh jalur yang sama', () => {
		expect(fileMenu).toContain('await prepareForExport(editor)')
	})

	test('penyegar itu mencakup ketiga jenis blok turunan', () => {
		expect(prepare).toContain('refreshTocBlocks')
		expect(prepare).toContain('refreshHtmlBlocks')
		expect(prepare).toContain('refreshMermaidBlocks')
	})
})
