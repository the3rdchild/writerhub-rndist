import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { printPageRules } from '@/components/editor/document-paper'
import { DEFAULT_PAGE_SETUP } from './page-geometry'

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
const exportView = readFileSync(
	new URL('../../components/export/export-document-view.tsx', import.meta.url),
	'utf8',
)
const extensions = readFileSync(new URL('./extensions.ts', import.meta.url), 'utf8')
const printPages = readFileSync(
	new URL('../../components/export/print-pages.test.ts', import.meta.url),
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

	/*
	 * Bingkai rancangan wajib berposisi mutlak: sebagai elemen inline ia duduk
	 * di atas baseline teks, dan descent itu meluberkannya beberapa piksel ke
	 * lembar berikutnya. Salinannya dipakai fixture uji cetak
	 * (`print-pages.test.ts`) - dua salinan harus tetap menunjuk aturan yang sama.
	 */
	test('bingkai rancangan berposisi mutlak di layar', () => {
		expect(css).toContain('.html-block-page .html-block-frame {')
		expect(css).toMatch(/\.html-block-page \.html-block-frame \{\s*position: absolute;/)
		expect(css).toContain('top: calc(-1 * var(--page-margin-top, 0px));')
	})
})

/*
 * T1 (docs/DRAFTS-API-FINDINGS.md): dua halaman kosong mengapit rancangan di
 * PDF. Perbaikannya dua lapis - CSS menyembunyikan lapisan lembar UTUH, dan
 * halaman ekspor berhenti memuat paragraf penutup. Yang dijaga di sini
 * kontraknya; jumlah lembar yang benar-benar keluar dijaga uji cetak
 * `components/export/print-pages.test.ts`.
 */
describe('lembar kosong di sekitar rancangan (T1)', () => {
	test('lapisan lembar punya kelasnya sendiri dan disembunyikan utuh saat cetak', () => {
		expect(paper).toContain('document-sheet-layer')
		expect(css).toContain('.document-sheet-layer')
	})

	test('halaman ekspor tidak memuat paragraf penutup', () => {
		expect(extensions).toContain('trailingParagraph')
		expect(exportView).toContain('trailingParagraph: false')
	})
})

describe('blok kode di kertas', () => {
	test('perkakas penyuntingnya tidak ikut tercetak', () => {
		expect(css).toContain('.document-body .code-block-toolbar,')
	})

	/*
	 * Diagram editorial dilucuti ukurannya oleh `diagram-svg.ts`, jadi kalau
	 * aturan ini hilang ia menyusut ke ukuran cadangan SVG - kecil di layar,
	 * dan kecil di kertas, tanpa satu pun pesan yang menjelaskan kenapa.
	 */
	test('diagram editorial mendapat lebarnya dari CSS, bukan dari atribut', () => {
		expect(css).toContain(".code-block-visual-preview[data-visual='diagram'] svg")
		expect(css).toContain(".code-block-visual-print[data-visual='diagram'] svg")
	})

	test('diagram tercetak sebagai gambar, bukan sumbernya', () => {
		expect(css).toContain('.code-block:has(.code-block-visual-print) .code-block-pre')
		expect(css).toContain('.document-body .code-block-visual-print {\n    display: block !important;')
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

/*
 * Watermark: satu-satunya isi yang sengaja diulang di tiap halaman cetak.
 *
 * Uji cetak sungguhannya (print-pages.test.ts) butuh Chromium dan melewati diri
 * sendiri kalau tidak ada. Dua aturan letaknya bisa dijaga tanpa mencetak apa
 * pun, dan justru itu yang paling gampang terlanggar saat merapikan JSX -
 * lihat docs/WATERMARK-PLAN.md §1.3.
 */
describe('letak lapisan watermark', () => {
	/* Yang dicari pemasangannya di JSX, bukan penyebutan namanya di komentar. */
	const sheetLayer = paper.indexOf('className="document-sheet-layer"')
	const pagePadding = paper.indexOf("cn('document-page-padding")
	const printLayer = paper.indexOf('<WatermarkPrintLayer')
	const screenLayer = paper.indexOf('<WatermarkLayer')

	test('kedua penyaji terpasang di kertas', () => {
		expect(printLayer).toBeGreaterThan(-1)
		expect(screenLayer).toBeGreaterThan(-1)
	})

	test('lapisan cetak: sesudah lapisan lembar, sebelum pembungkus naskah', () => {
		/* Di luar print root ia lenyap - CSS cetak menyatakan yang boleh dicetak
		 * secara positif. Di DALAM lapisan lembar ia juga lenyap, karena lapisan
		 * itu disembunyikan utuh: sumbatan yang sama yang menahan header/footer. */
		expect(sheetLayer).toBeLessThan(printLayer)
		expect(printLayer).toBeLessThan(pagePadding)
	})

	test('salinan layar dirender di dalam lembarnya, bukan di samping lapisan lembar', () => {
		expect(screenLayer).toBeGreaterThan(sheetLayer)
		expect(screenLayer).toBeLessThan(printLayer)
	})

	function ruleBody(source: string, at: number): string {
		const open = source.indexOf('{', at)
		return source.slice(open, source.indexOf('}', open))
	}

	test('di layar lapisan cetak itu tidak pernah tampil', () => {
		expect(ruleBody(css, css.indexOf('.document-watermark-print'))).toContain('display: none')
	})

	test('CSS cetak menghidupkannya dengan position: fixed', () => {
		/* Aturan terakhir yang menyebut kelas itu adalah yang di dalam @media print;
		   globals.css punya beberapa blok cetak, jadi memotong di blok pertama
		   akan melewatkannya. */
		expect(ruleBody(css, css.lastIndexOf('.document-watermark-print'))).toContain('position: fixed')
	})
})

/*
 * Bingkai cetak: margin halaman yang pindah dari `@page` ke DOM saat watermark
 * diminta menembus batas margin. Bentuknya terikat pada satu temuan yang hanya
 * bisa diukur dari mesin cetaknya (print-pages.test.ts): hanya `<thead>` tabel
 * SUNGGUHAN yang diulang peramban di tiap halaman. Uji di sini menjaga
 * bentuknya; uji cetak menjaga hasilnya.
 */
describe('bingkai cetak watermark tanpa batas margin', () => {
	test('kertas merendernya sebagai tabel, bukan div', () => {
		expect(paper).toContain('document-print-frame')
		expect(paper).toContain('<thead')
		expect(paper).toContain('<tfoot')
	})

	test('dipakai hanya saat memang diminta - dokumen lain mencetak seperti sebelumnya', () => {
		expect(paper).toContain('watermark?.bleed === true')
		expect(paper).toContain('printPageRules(setup, sections, bleedPrint)')
	})

	test('margin @page jadi nol, karena kotak `fixed` selalu menyusut ke sana', () => {
		const bleed = printPageRules(DEFAULT_PAGE_SETUP, [], true)
		const biasa = printPageRules(DEFAULT_PAGE_SETUP, [], false)
		expect(bleed).toContain('margin: 0;')
		expect(biasa).not.toContain('@page { size: 216mm 279mm; margin: 0;')
	})

	test('bagian dengan margin berbeda ikut bermargin nol - satu bingkai untuk semua', () => {
		const landscape = { ...DEFAULT_PAGE_SETUP, orientation: 'landscape' as const }
		const rules = printPageRules(DEFAULT_PAGE_SETUP, [DEFAULT_PAGE_SETUP, landscape], true)
		expect(rules).toContain('@page sec1 {')
		expect(rules.match(/margin: 0;/g)?.length).toBeGreaterThan(1)
	})

	/*
	 * Rancangan satu halaman menuntut setinggi kertas, sedangkan bingkai selalu
	 * menyisakan ruang margin di tiap halaman - bersama-sama mereka memecah
	 * rancangan itu jadi dua lembar (terukur). Yang mengalah watermarknya.
	 */
	test('mengalah pada rancangan satu halaman, bukan sebaliknya', () => {
		expect(paper).toContain('usePageBlockPresence')
		expect(paper).toContain('data-html-block-fit="page"')
		expect(paper).toContain('bleedWanted && !hasPageBlock')
	})

	test('di layar bingkainya tak berbekas: blok biasa, spacer disembunyikan', () => {
		const screen = css.slice(css.indexOf('.document-print-frame'))
		expect(screen).toContain('display: block')
		expect(screen.slice(0, screen.indexOf('@media print'))).toContain('display: none')
	})

	test('CSS cetak menghidupkannya sebagai tabel dengan spacer setinggi margin', () => {
		const print = css.slice(css.lastIndexOf('.document-print-frame {'))
		expect(print).toContain('display: table')
		expect(print).toContain('table-header-group')
		expect(print).toContain('var(--print-margin-top')
	})

	/* Kerangka DOM di uji cetak disalin tangan; kalau netralisasi layarnya tidak
	 * ikut disalin, uji itu mengukur bentuk yang tidak pernah ada di aplikasi. */
	test('uji cetak memakai netralisasi layar yang sama', () => {
		expect(printPages).toContain('.document-print-frame > thead, .document-print-frame > tfoot')
	})
})
