import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'

const canvas = readFileSync(new URL('../../components/editor/document-canvas.tsx', import.meta.url), 'utf8')
const paper = readFileSync(new URL('../../components/editor/document-paper.tsx', import.meta.url), 'utf8')
const shareView = readFileSync(
	new URL('../../components/share/shared-document-view.tsx', import.meta.url),
	'utf8',
)
const versionView = readFileSync(
	new URL('../../components/versions/version-history-view.tsx', import.meta.url),
	'utf8',
)
const geometryHook = readFileSync(new URL('./use-document-geometry.ts', import.meta.url), 'utf8')
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
	/*
	 * Penandanya melekat pada kertas, bukan pada bingkai zoom kanvas: hanya di
	 * sana ia berlaku untuk ketiga tampilan naskah. Dulu ia milik kanvas saja,
	 * dan mencetak dari halaman berbagi tidak cocok dengan selektornya sama
	 * sekali - seluruh chrome peramban ikut tercetak.
	 */
	test('kertas yang membawa penanda print root', () => {
		expect(paper).toContain('document-print-root')
	})

	test('bingkai zoom kanvas tidak lagi memikulnya', () => {
		// Namanya masih disebut di komentar kanvas - yang harus hilang adalah
		// pemasangannya sebagai kelas.
		expect(canvas).not.toContain('document-zoom-frame document-print-root')
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
	test('kertas menyuntikkan lembar tanpa margin', () => {
		expect(paper).toContain('@page flyer')
		expect(paper).toContain('margin: 0')
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

/*
 * Kontrak DOM yang dituntut paginasi dan blok HTML mode halaman: pembungkus
 * berposisi sebagai offsetParent, margin sebagai padding di pembungkus itu, dan
 * geometri sebagai custom property. Ketiganya pernah disalin tangan di tiga
 * tempat, dan dua salinan menyimpang tanpa gejala sampai ada fitur yang
 * benar-benar membacanya. Tes ini menjaga ketiganya tetap satu sumber.
 */
describe('kontrak kertas dipakai bersama', () => {
	test('kertas memegang offsetParent, padding margin, dan variabel geometri', () => {
		expect(paper).toContain('document-page-padding relative')
		expect(paper).toContain('--page-content-height')
		expect(paper).toContain('--page-margin-top')
		expect(paper).toContain('--code-block-max-height')
	})

	test('ketiga tampilan naskah memakainya, tidak ada yang menyusun sendiri', () => {
		for (const view of [canvas, shareView, versionView]) {
			expect(view).toContain('<DocumentPaper')
			expect(view).not.toContain('--page-content-height')
		}
	})

	test('sisi editornya juga satu - geometri didorong lewat satu hook', () => {
		expect(geometryHook).toContain('paginationKey')
		for (const view of [shareView, versionView]) {
			expect(view).toContain('useDocumentGeometry(editor')
		}
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
