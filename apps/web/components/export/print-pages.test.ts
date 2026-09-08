import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
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
function sheetLayer(setup: PageSetup): string {
	const { width, height } = pageGeometry(setup)
	return (
		'<div class="document-sheet-layer" aria-hidden="true">' +
		`<div class="document-sheet absolute" style="top:0;left:0;width:${width}px;height:${height}px"></div>` +
		'</div>'
	)
}

function fixture(inner: string, setup: PageSetup = DESIGN_SETUP): string {
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
		sheetLayer(setup),
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

async function printedPagesOf(page: Page, html: string): Promise<number> {
	await page.setContent(html, { waitUntil: 'load' })
	const pdf = await page.pdf({ printBackground: true, preferCSSPageSize: true })
	return pageCount(pdf)
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
