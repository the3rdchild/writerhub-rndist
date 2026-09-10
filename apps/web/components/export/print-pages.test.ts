import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { inflateSync } from 'node:zlib'
import { type Browser, chromium, type Page } from 'playwright'
import { printPageRules } from '@/components/editor/document-paper'
import { DEFAULT_PAGE_SETUP, type PageSetup, pageGeometry } from '@/features/editor/page-geometry'

/**
 * Uji cetak yang BENAR-BENAR mencetak, lalu menghitung halamannya.
 *
 * Kelas bug T1 (docs/DRAFTS-API-FINDINGS.md) tidak bisa ditangkap uji CSS
 * tekstual: aturannya tertulis benar di globals.css, tapi peramban tetap
 * menghasilkan lembar kosong karena kotak pembungkus setinggi nol yang
 * mendahului blok `page: flyer`. Gejalanya juga tak terlihat di layar -
 * paginasi kanvas tidak tahu-menahu soal `@page`. Satu-satunya pengukur yang
 * jujur adalah mesin cetaknya sendiri.
 *
 * CSS cetaknya BUKAN tulisan tangan: seluruh blok `@media print` globals.css
 * diekstrak apa adanya, dan aturan `@page` datang dari `printPageRules` yang
 * sama dengan yang disuntikkan `documentPaper`. Yang disalin tangan hanya
 * kerangka DOM-nya - dan kerangka itu dijaga uji tekstual di
 * `print-root.test.ts`.
 *
 * Jalankan khusus: `bun test components/export/print-pages.test.ts`.
 * Butuh Chromium; urutannya: `PRINT_TEST_BROWSER` (jalur eksekusi eksplisit -
 * di NixOS misalnya hasil `nix build nixpkgs#chromium`, karena Chromium bawaan
 * Playwright menaut ke pustaka sistem yang tidak ada di sana), lalu Chromium
 * bawaan Playwright (`bunx playwright install chromium`). Tanpa keduanya uji
 * ini dilewati dengan peringatan yang menyebut cara memperbaikinya, bukan gagal
 * senyap.
 */

const css = readFileSync(new URL('../../app/globals.css', import.meta.url), 'utf8')

/** Seluruh isi blok `@media print` - CSS cetak yang benar-benar dipakai aplikasi. */
function printCssOf(cssText: string): string {
	const parts: string[] = []
	let at = cssText.indexOf('@media print')
	while (at !== -1) {
		const open = cssText.indexOf('{', at)
		if (open === -1) break
		let depth = 0
		let cursor = open
		for (; cursor < cssText.length; cursor += 1) {
			if (cssText[cursor] === '{') depth += 1
			else if (cssText[cursor] === '}') {
				depth -= 1
				if (depth === 0) break
			}
		}
		parts.push(cssText.slice(open + 1, cursor))
		at = cssText.indexOf('@media print', cursor)
	}
	return parts.join('\n')
}

/** Lembar rancangan: A4 potret tanpa margin - sama dengan `designPageSetup`. */
const DESIGN_SETUP: PageSetup = {
	...DEFAULT_PAGE_SETUP,
	margins: { top: 0, right: 0, bottom: 0, left: 0 },
}

/*
 * Kerangka layar yang minimal - hanya aturan di luar `@media print` yang kotak
 * kotaknya benar-benar dibaca mesin cetak. Yang paling penting: bingkai blok
 * HARUS berposisi mutlak - sebagai elemen inline ia duduk di atas baseline
 * teks, dan descent itulah yang membuat isinya meluber beberapa piksel ke
 * lembar berikutnya (terlihat sebagai "halaman kosong" tambahan). Aturan ini
 * salinan dari globals.css; dijaga sinkron oleh uji tekstual print-root.
 */
const SCREEN_CSS = `
* { box-sizing: border-box }
body { margin: 0; background: #fff }
.document-sheet { position: absolute }
.document-page-padding { position: relative; z-index: 10 }
.document-body > * + * { margin-top: 0.75em }
p { margin: 0 }
.document-watermark-item { position: absolute }
.document-print-frame, .document-print-frame > tbody, .document-print-frame > tbody > tr, .document-print-frame > tbody > tr > td { display: block; width: auto; margin: 0; padding: 0; border: 0 }
.document-print-frame > thead, .document-print-frame > tfoot { display: none }
.html-block-page .html-block-stage { position: relative; height: var(--page-content-height, 640px) }
.html-block-page .html-block-frame { position: absolute; top: calc(-1 * var(--page-margin-top, 0px)); left: calc(-1 * var(--page-margin-left, 0px)); width: var(--page-width, 100%); height: var(--page-height, 100%); border: 0; border-radius: 0 }
`

const FLYER_SRC =
	"<body style='margin:0'><div style='width:100%;height:100%;background:#0a3d62;" +
	'color:#fff;font:700 48px sans-serif;display:flex;align-items:center;' +
	"justify-content:center'>FLYER</div></body>"

/** Satu blok rancangan mode halaman - struktur DOM node view htmlBlock. */
function flyerBlock(label: string): string {
	const src = FLYER_SRC.replace('FLYER', label).replace(/"/g, '&quot;')
	return (
		"<div class='react-renderer node-htmlBlock' data-html-block-fit='page'>" +
		"<div class='html-block html-block-page'><div class='html-block-stage'>" +
		`<iframe class="html-block-frame" srcdoc="${src}"></iframe>` +
		'</div></div></div>'
	)
}

/** Lapisan latar lembar persis seperti `document-paper.tsx` merendernya. */
function sheetLayer(setup: PageSetup, inSheet = ''): string {
	const { width, height } = pageGeometry(setup)
	return (
		'<div class="document-sheet-layer" aria-hidden="true">' +
		`<div class="document-sheet absolute" style="top:0;left:0;width:${width}px;height:${height}px">` +
		`${inSheet}</div>` +
		'</div>'
	)
}

interface Slots {
	/** Saudara lapisan lembar, di dalam print root - tempat watermark cetak tinggal. */
	printRoot?: string
	/** Di dalam `.document-sheet` - tempat salinan layarnya tinggal. */
	inSheet?: string
}

function fixture(inner: string, setup: PageSetup = DESIGN_SETUP, slots: Slots = {}): string {
	const geometry = pageGeometry(setup)
	const vars = [
		`--page-content-height:${geometry.contentHeight}px`,
		`--page-width:${geometry.width}px`,
		`--page-height:${geometry.height}px`,
		`--page-margin-top:${geometry.margins.top}px`,
		`--page-margin-left:${geometry.margins.left}px`,
	].join(';')

	return [
		'<!doctype html><html><head><meta charset="utf-8">',
		`<style>${SCREEN_CSS}</style>`,
		`<style>${printCssOf(css)}</style>`,
		`<style media="print">${printPageRules(setup, [])}</style>`,
		'</head><body>',
		'<div class="document-canvas">',
		'<div class="document-paper document-print-root">',
		sheetLayer(setup, slots.inSheet ?? ''),
		slots.printRoot ?? '',
		`<div class="document-page-padding" style="padding:0;${vars}">`,
		`<div class="document-body">${inner}</div>`,
		'</div></div></div></body></html>',
	].join('')
}

function pageCount(pdf: Buffer): number {
	return (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length
}

let browser: Browser | null = null

beforeAll(async () => {
	/** Kandidat eksekusi yang bisa dipakai, urut prioritasnya. */
	const candidates: Array<{ label: string; launch: () => Promise<Browser> }> = [
		...(process.env.PRINT_TEST_BROWSER
			? [
					{
						label: `PRINT_TEST_BROWSER (${process.env.PRINT_TEST_BROWSER})`,
						launch: () =>
							chromium.launch({
								executablePath: process.env.PRINT_TEST_BROWSER,
								args: ['--no-sandbox', '--disable-dev-shm-usage'],
							}),
					},
				]
			: []),
		{
			label: 'Chromium bawaan Playwright (bunx playwright install chromium)',
			launch: () => chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] }),
		},
	]

	for (const candidate of candidates) {
		try {
			browser = await candidate.launch()
			return
		} catch (error) {
			console.warn(`[print-pages] ${candidate.label} tidak bisa dipakai: ${String(error).slice(0, 160)}`)
		}
	}

	console.warn(
		'[print-pages] Tidak ada Chromium yang bisa dijalankan - uji cetak DILEWATI. ' +
			'Pasang dengan `bunx playwright install chromium`, atau di NixOS arahkan ' +
			'PRINT_TEST_BROWSER ke chromium sistem (mis. hasil `nix build nixpkgs#chromium`).',
	)
	browser = null
})

afterAll(async () => {
	await browser?.close()
})

async function printedPdfOf(page: Page, html: string): Promise<Buffer> {
	await page.setContent(html, { waitUntil: 'load' })
	return page.pdf({ printBackground: true, preferCSSPageSize: true })
}

async function printedPagesOf(page: Page, html: string): Promise<number> {
	return pageCount(await printedPdfOf(page, html))
}

/**
 * Berapa kali sebuah XObject dipanggil di seluruh PDF.
 *
 * Kenapa bukan "berapa halaman memuat gambar": Chrome menaruh dua aliran
 * ber-`Do` untuk tiap halaman, jadi angka mutlaknya membawa faktor tetap yang
 * bisa berubah antarversi. Yang bermakna adalah RASIONYA terhadap jumlah
 * halaman - faktor tetap itu habis dibagi, dan yang tersisa persis pertanyaan
 * yang ingin dijawab: apakah gambarnya berulang di tiap halaman.
 *
 * Aliran isi terkompresi Flate, jadi tidak ada gunanya mencari teks di byte
 * mentah; tiap aliran dikempis dulu. Fixture-nya tidak memuat gambar lain, jadi
 * satu-satunya XObject yang mungkin adalah watermarknya.
 */
function xobjectInvocations(pdf: Buffer): number {
	const bytes = pdf.toString('latin1')
	let count = 0
	let at = 0

	for (;;) {
		const start = bytes.indexOf('stream', at)
		if (start === -1) break
		let from = start + 'stream'.length
		if (bytes[from] === '\r') from += 1
		if (bytes[from] === '\n') from += 1
		const end = bytes.indexOf('endstream', from)
		if (end === -1) break

		const raw = pdf.subarray(from, end)
		let content: string
		try {
			content = inflateSync(raw).toString('latin1')
		} catch {
			content = raw.toString('latin1')
		}
		count += (content.match(/\/\w+\s+Do\b/g) ?? []).length
		at = end + 'endstream'.length
	}

	return count
}

describe('uji cetak T1 - lembar kosong di sekitar rancangan', () => {
	test('rancangan tunggal, tanpa perabot lain: tepat satu halaman', async () => {
		if (!browser) return
		const page = await browser.newPage()
		try {
			expect(await printedPagesOf(page, fixture(flyerBlock('SATU')))).toBe(1)
		} finally {
			await page.close()
		}
	})

	/*
	 * Kondisi nyata draf rancangan: lapisan lembar ada (dan kini disembunyikan
	 * utuh oleh CSS cetak), paragraf penutup TIDAK ada lagi karena halaman
	 * ekspor mematikan TrailingParagraph. Dulu kondisi ini keluar 3 halaman
	 * dengan halaman 1 dan 3 kosong - persis keluhan produksinya.
	 */
	test('lapisan lembar + rancangan: tetap satu halaman', async () => {
		if (!browser) return
		const page = await browser.newPage()
		try {
			const withLayer = fixture(flyerBlock('SATU'))
			// Lapisan lembar sudah di dalam fixture(); ini jaga-jaga eksplisit.
			expect(withLayer).toContain('document-sheet-layer')
			expect(await printedPagesOf(page, withLayer)).toBe(1)
		} finally {
			await page.close()
		}
	})

	/*
	 * Paragraf penutup masih berharga sebagai bukti kenapa ia harus dilepas
	 * dari halaman ekspor: dengan CSS cetak yang benar sekalipun, satu paragraf
	 * di belakang blok `page: flyer` selalu menambah satu lembar.
	 */
	test('paragraf setelah rancangan menambah tepat satu halaman - tidak lebih', async () => {
		if (!browser) return
		const page = await browser.newPage()
		try {
			const html = fixture(`${flyerBlock('SATU')}<p><br /></p>`)
			expect(await printedPagesOf(page, html)).toBe(2)
		} finally {
			await page.close()
		}
	})

	/* T2: N blok `page: flyer` berurutan = N lembar, tanpa lembar kosong sisipan. */
	test('tiga rancangan berurutan: tepat tiga halaman', async () => {
		if (!browser) return
		const page = await browser.newPage()
		try {
			const html = fixture(flyerBlock('SATU') + flyerBlock('DUA') + flyerBlock('TIGA'))
			expect(await printedPagesOf(page, html)).toBe(3)
		} finally {
			await page.close()
		}
	})

	/* Dokumen campuran: rancangan lalu prosa - dua lembar, keduanya berisi. */
	test('rancangan lalu prosa: dua halaman tanpa lembar kosong di antaranya', async () => {
		if (!browser) return
		const page = await browser.newPage()
		try {
			const html = fixture(`${flyerBlock('SATU')}<p>Paragraf biasa setelahnya.</p>`)
			expect(await printedPagesOf(page, html)).toBe(2)
		} finally {
			await page.close()
		}
	})
})

/*
 * PNG 2x2; satu-satunya gambar di fixture watermark, jadi tiap invokasi XObject
 * yang terhitung pasti miliknya.
 */
const WATERMARK_PNG =
	'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR4nGP8' +
	'z8Dwn4GBgYEJRIAAADPuAgE1c1kaAAAAAElFTkSuQmCC'

const WATERMARK_ITEM =
	`<img class="document-watermark-item" src="${WATERMARK_PNG}" alt="" ` +
	'style="left:50%;top:50%;width:60%;transform:translate(-50%,-50%)">'

/**
 * Lebar & posisi tiap tinta XObject, dari matriks `cm` sebelum `Do`.
 *
 * Satuannya ruang gambar Chrome, bukan poin PDF - jadi yang bermakna adalah
 * PERBANDINGANNYA: watermark yang terkurung margin selebar kotak isi, yang
 * menembus margin selebar kertas. Angka mutlaknya boleh berubah antarversi,
 * rasionya tidak.
 */
function inkPlacements(pdf: Buffer): { width: number; left: number }[] {
	const bytes = pdf.toString('latin1')
	const out: { width: number; left: number }[] = []
	let at = 0

	for (;;) {
		const start = bytes.indexOf('stream', at)
		if (start === -1) break
		let from = start + 'stream'.length
		if (bytes[from] === '\r') from += 1
		if (bytes[from] === '\n') from += 1
		const end = bytes.indexOf('endstream', from)
		if (end === -1) break

		const raw = pdf.subarray(from, end)
		let content: string
		try {
			content = inflateSync(raw).toString('latin1')
		} catch {
			content = raw.toString('latin1')
		}
		const matrix = /([-\d.]+) ([-\d.]+) ([-\d.]+) ([-\d.]+) ([-\d.]+) ([-\d.]+) cm[\s\S]{0,120}?\/\w+\s+Do/g
		for (const hit of content.matchAll(matrix)) {
			out.push({ width: Number(hit[1]), left: Number(hit[5]) })
		}
		at = end + 'endstream'.length
	}

	return out
}

/** Prosa secukupnya untuk memaksa berapa pun halaman yang dibutuhkan uji. */
function prose(paragraphs: number): string {
	const sentence =
		'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor ' +
		'incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud.'
	return Array.from({ length: paragraphs }, (_, i) => `<p>${i + 1}. ${sentence} ${sentence}</p>`).join('')
}

/**
 * Naskah bermargin yang dibungkus BINGKAI CETAK - persis bentuk yang dirender
 * `document-paper.tsx` saat watermarknya diminta menembus margin: `@page`
 * bermargin nol, dan margin naskahnya dipikul spacer `<thead>`/`<tfoot>` yang
 * diulang peramban tiap halaman.
 */
function bleedFixture(paragraphs: number, extra = ''): string {
	const setup = DEFAULT_PAGE_SETUP
	const geometry = pageGeometry(setup)
	const vars = [
		`--page-content-height:${geometry.contentHeight}px`,
		`--page-width:${geometry.width}px`,
		`--page-height:${geometry.height}px`,
		`--page-margin-top:${geometry.margins.top}px`,
		`--page-margin-left:${geometry.margins.left}px`,
	].join(';')
	const frameVars = [
		`--print-margin-top:${geometry.margins.top}px`,
		`--print-margin-right:${geometry.margins.right}px`,
		`--print-margin-bottom:${geometry.margins.bottom}px`,
		`--print-margin-left:${geometry.margins.left}px`,
	].join(';')

	return [
		'<!doctype html><html><head><meta charset="utf-8">',
		`<style>${SCREEN_CSS}</style>`,
		`<style>${printCssOf(css)}</style>`,
		`<style media="print">${printPageRules(setup, [], true)}</style>`,
		'</head><body>',
		'<div class="document-canvas">',
		'<div class="document-paper document-print-root">',
		sheetLayer(setup),
		`<div class="document-watermark-print" aria-hidden="true">${WATERMARK_ITEM}</div>`,
		`<table class="document-print-frame" style="${frameVars}">`,
		'<thead aria-hidden="true"><tr><td></td></tr></thead>',
		'<tfoot aria-hidden="true"><tr><td></td></tr></tfoot>',
		'<tbody><tr><td>',
		`<div class="document-page-padding" style="padding:0;${vars}">`,
		`<div class="document-body">${prose(paragraphs)}${extra}</div>`,
		'</div></td></tr></tbody></table>',
		'</div></div></body></html>',
	].join('')
}

/** Naskah biasa (A4 bermargin) dengan watermark di salah satu dari dua letak. */
function watermarkFixture(paragraphs: number, where: 'print-root' | 'sheet-layer' | 'none'): string {
	const slots =
		where === 'print-root'
			? { printRoot: `<div class="document-watermark-print" aria-hidden="true">${WATERMARK_ITEM}</div>` }
			: where === 'sheet-layer'
				? { inSheet: `<div class="document-watermark" aria-hidden="true">${WATERMARK_ITEM}</div>` }
				: {}
	return fixture(prose(paragraphs), DEFAULT_PAGE_SETUP, slots)
}

/**
 * Watermark adalah satu-satunya isi yang sengaja diulang di tiap halaman cetak,
 * dan kegagalannya SENYAP: kalau lapisannya berhenti berulang - misalnya karena
 * ada `transform`, `filter`, atau `contain` baru di jalur leluhur saat mencetak -
 * tidak ada error, tidak ada peringatan, hanya PDF yang watermarknya cuma di
 * halaman pertama. Tidak ada uji CSS tekstual yang bisa menangkap itu.
 *
 * Lihat docs/WATERMARK-PLAN.md §1 untuk pengukuran yang melahirkan dua aturan
 * yang dijaga di sini.
 */
describe('uji cetak watermark - lapisan yang berulang per halaman', () => {
	test('watermark di dalam print root berulang di TIAP halaman', async () => {
		if (!browser) return
		const page = await browser.newPage()
		try {
			const short = await printedPdfOf(page, watermarkFixture(2, 'print-root'))
			const long = await printedPdfOf(page, watermarkFixture(24, 'print-root'))

			const shortPages = pageCount(short)
			const longPages = pageCount(long)
			expect(shortPages).toBe(1)
			expect(longPages).toBeGreaterThan(1)

			/* Faktor tetap per halaman habis dibagi; yang tersisa adalah buktinya. */
			const perPage = xobjectInvocations(short) / shortPages
			expect(perPage).toBeGreaterThan(0)
			expect(xobjectInvocations(long)).toBe(perPage * longPages)
		} finally {
			await page.close()
		}
	})

	test('watermark di dalam lapisan lembar tidak tercetak sama sekali', async () => {
		if (!browser) return
		const page = await browser.newPage()
		try {
			/* Aturan (b): lapisan lembar disembunyikan utuh saat mencetak - itulah
			 * sebabnya header/footer tidak pernah tercetak. Uji ini yang menahan
			 * watermark supaya tidak ikut pindah ke sana "karena rapi". */
			const pdf = await printedPdfOf(page, watermarkFixture(24, 'sheet-layer'))
			expect(pageCount(pdf)).toBeGreaterThan(1)
			expect(xobjectInvocations(pdf)).toBe(0)
		} finally {
			await page.close()
		}
	})

	/*
	 * Watermark tanpa batas margin (bleed). Kegagalannya sama senyapnya: PDF
	 * tetap terbit, watermarknya sekadar berhenti di garis margin - dan tidak
	 * ada uji CSS tekstual yang bisa melihat itu, karena aturannya SUDAH benar
	 * di globals.css. Yang menentukan adalah dua hal yang hanya bisa diukur
	 * dari mesin cetaknya: kotak `fixed` selalu menyusut ke kotak margin
	 * `@page` (jadi marginnya harus nol), dan hanya `<thead>` tabel SUNGGUHAN
	 * yang diulang tiap halaman (jadi ruang margin naskah punya pemikul).
	 */
	test('bingkai cetak: tinta watermark selebar KERTAS, bukan kotak isi', async () => {
		if (!browser) return
		const page = await browser.newPage()
		try {
			const terkurung = inkPlacements(await printedPdfOf(page, watermarkFixture(2, 'print-root')))
			const tembus = inkPlacements(await printedPdfOf(page, bleedFixture(2)))

			expect(terkurung.length).toBeGreaterThan(0)
			expect(tembus.length).toBe(terkurung.length)

			/* Rasionya = lebar kertas : lebar kotak isi. Satuan gambarnya boleh
			 * berubah antarversi Chrome; perbandingan ini tidak. */
			const { width, contentWidth, margins } = pageGeometry(DEFAULT_PAGE_SETUP)
			expect(tembus[0].width / terkurung[0].width).toBeCloseTo(width / contentWidth, 2)

			/*
			 * Dan ia benar-benar berangkat dari kertas, bukan dari garis margin.
			 * Tintanya selebar 60% bidangnya dan berjangkar tengah, jadi tepi
			 * kirinya 20% bidang itu - dinyatakan sebagai rasio terhadap lebar
			 * tintanya sendiri supaya bebas satuan.
			 */
			expect(tembus[0].left / tembus[0].width).toBeCloseTo((0.2 * width) / (0.6 * width), 2)
			expect(terkurung[0].left / terkurung[0].width).toBeCloseTo(
				(margins.left + 0.2 * contentWidth) / (0.6 * contentWidth),
				2,
			)
			expect(tembus[0].left).toBeLessThan(terkurung[0].left)
		} finally {
			await page.close()
		}
	})

	test('bingkai cetak: watermarknya tetap berulang di TIAP halaman', async () => {
		if (!browser) return
		const page = await browser.newPage()
		try {
			const pendek = await printedPdfOf(page, bleedFixture(2))
			const panjang = await printedPdfOf(page, bleedFixture(24))

			const halamanPendek = pageCount(pendek)
			expect(halamanPendek).toBe(1)
			expect(pageCount(panjang)).toBeGreaterThan(1)

			const perHalaman = xobjectInvocations(pendek) / halamanPendek
			expect(perHalaman).toBeGreaterThan(0)
			expect(xobjectInvocations(panjang)).toBe(perHalaman * pageCount(panjang))
		} finally {
			await page.close()
		}
	})

	/*
	 * Margin naskah tidak boleh ikut hilang bersama margin `@page`.
	 *
	 * Yang memikulnya spacer `<thead>`/`<tfoot>`, dan itu hanya bekerja kalau
	 * bingkainya tabel SUNGGUHAN - div ber-`display: table-header-group` tidak
	 * diulang peramban sama sekali. Buktinya jumlah halaman: ruang per halaman
	 * yang sama besar menghasilkan paginasi yang sama persis dengan jalur
	 * `@page` bermargin. Kalau spacernya berhenti berulang, halaman kedua dan
	 * seterusnya jadi lebih lega dan naskah yang sama muat di lebih sedikit
	 * halaman - persis kegagalan yang tidak terlihat di halaman pertama.
	 */
	test('bingkai cetak: paginasinya sama dengan jalur @page bermargin', async () => {
		if (!browser) return
		const page = await browser.newPage()
		try {
			const denganMargin = await printedPagesOf(page, watermarkFixture(24, 'print-root'))
			const denganBingkai = await printedPagesOf(page, bleedFixture(24))

			expect(denganMargin).toBeGreaterThan(1)
			expect(denganBingkai).toBe(denganMargin)
		} finally {
			await page.close()
		}
	})

	test('tanpa watermark: tidak ada XObject sama sekali - penghitungnya jujur', async () => {
		if (!browser) return
		const page = await browser.newPage()
		try {
			const pdf = await printedPdfOf(page, watermarkFixture(24, 'none'))
			expect(xobjectInvocations(pdf)).toBe(0)
		} finally {
			await page.close()
		}
	})

	test('watermark tidak menambah atau mengurangi halaman', async () => {
		if (!browser) return
		const page = await browser.newPage()
		try {
			const withWatermark = await printedPdfOf(page, watermarkFixture(24, 'print-root'))
			const without = await printedPdfOf(page, watermarkFixture(24, 'none'))
			expect(pageCount(withWatermark)).toBe(pageCount(without))
		} finally {
			await page.close()
		}
	})
})
