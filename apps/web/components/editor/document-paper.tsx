'use client'

import type { DocumentTypography } from '@writer-hub/shared'
import type { ReactNode } from 'react'
import { useMemo } from 'react'
import type { PageFurniture } from '@/features/editor/page-furniture/model'
import { SheetFurniture } from '@/features/editor/page-furniture/sheet-furniture'
import {
	type PageGeometry,
	type PageSetup,
	pageGeometry,
	type SheetGeometry,
} from '@/features/editor/page-geometry'
import { typographyRules } from '@/features/editor/typography-css'

/**
 * Kertasnya - dan hanya kertasnya.
 *
 * Tiga tempat menampilkan naskah: kanvas penyunting, tampilan berbagi, dan
 * riwayat versi. Dulu ketiganya menyusun lembarnya sendiri, dan dua di antaranya
 * membeku pada angka Letter-pada-96dpi yang diketik di hari itu. Prosa biasa
 * selamat dari lembar yang salah, jadi tak ada yang curiga - sampai muncul dua
 * hal yang benar-benar membaca geometri: paginasi, dan blok HTML mode satu
 * halaman. Yang pertama mengukur lewat `offsetTop`, yang kedua lewat custom
 * property. Keduanya diam-diam salah di dua tampilan itu selama berbulan-bulan.
 *
 * Komponen ini karena itu memiliki **seluruh kontrak** yang dituntut keduanya:
 *
 * - `.document-page-padding` yang berposisi, sehingga ia yang jadi offsetParent
 *   dan `offsetTop` blok pertama sama dengan margin atas halaman;
 * - margin halaman sebagai padding di pembungkus itu, bukan di lembarnya;
 * - lima variabel geometri plus `--code-block-max-height`;
 * - latar N lembar beserta perabot dan nomor halamannya;
 * - aturan tipografi dan aturan `@page` untuk mencetak.
 *
 * Yang **bukan** miliknya: zoom, penggaris, dan editornya sendiri. Itu perkakas
 * di sekeliling kertas, bukan kertas - dan halaman berbagi bahkan tidak punya
 * provider yang dibutuhkannya. Garis potongnya di situ, bukan di "satu komponen
 * dengan delapan boolean".
 */

const CODE_BLOCK_HEIGHT_RATIO = 0.6
const CODE_BLOCK_CHROME = 48
const CODE_BLOCK_MIN_HEIGHT = 120

const mm = (px: number) => Math.round((px / 96) * 25.4 * 100) / 100

function pageRuleBody(setup: PageSetup): string {
	const { width, height, margins } = pageGeometry(setup)
	return `size: ${mm(width)}mm ${mm(height)}mm; margin: ${mm(margins.top)}mm ${mm(margins.right)}mm ${mm(margins.bottom)}mm ${mm(margins.left)}mm;`
}

/**
 * Lembar khusus untuk flyer satu halaman: seukuran kertas, tanpa margin sama
 * sekali.
 *
 * Di layar, blok mode halaman menembus margin dengan digeser keluar sejauh
 * margin itu. Di kertas cara itu tidak bisa dipakai: peramban memotong apa pun
 * yang jatuh di luar area halaman, jadi flyer-nya keluar tergeser dan
 * terpangkas. Yang benar adalah menghapus marginnya, dan `@page` bernama
 * satu-satunya cara CSS menyatakan itu untuk sebagian halaman saja - mekanisme
 * yang sama yang dipakai `page: secN` di bawah.
 *
 * Ukurannya diambil dari tata letak dasar. Dokumen dengan section berukuran
 * kertas berbeda-beda hanya punya satu lembar flyer; itu penyederhanaan yang
 * disengaja - flyer adalah cetakan promosi, bukan bagian dari aliran naskah
 * yang berganti geometri.
 */
function flyerPageRule(base: PageSetup): string {
	const { width, height } = pageGeometry(base)
	return `@page flyer { size: ${mm(width)}mm ${mm(height)}mm; margin: 0; }`
}

export function printPageRules(base: PageSetup, sections: readonly PageSetup[]): string {
	const rules = [`@page { ${pageRuleBody(base)} }`, flyerPageRule(base)]

	sections.forEach((setup, index) => {
		if (index === 0) return
		rules.push(`@page sec${index} { ${pageRuleBody(setup)} }`)
		rules.push(`.document-section-${index} { page: sec${index}; }`)
	})

	return rules.join('\n')
}

/**
 * Ukuran kotak yang memuat seluruh lembar.
 *
 * Diekspor karena kanvas memerlukan angka yang sama untuk bingkai zoom-nya -
 * ia harus sebesar kertas dikali zoom supaya scrollbar-nya akurat. Dihitung
 * sekali di sini supaya kertas dan bingkainya tidak bisa berselisih.
 */
export function paperSize(
	geometry: PageGeometry,
	sheets: readonly SheetGeometry[],
	pageCount: number,
): { width: number; height: number } {
	const width =
		sheets.length > 0 ? Math.max(geometry.width, ...sheets.map((sheet) => sheet.width)) : geometry.width
	const last = sheets[sheets.length - 1]
	const height = last ? last.top + last.height : pageCount * geometry.height + (pageCount - 1) * geometry.gap
	return { width, height }
}

export interface DocumentPaperProps {
	setup: PageSetup
	typography: DocumentTypography
	/** Header/footer dokumen; null berarti tanpa perabot halaman. */
	furniture?: PageFurniture | null
	/** Lembar hasil paginasi; kosong berarti jatuh ke `pageCount` lembar seragam. */
	sheets?: readonly SheetGeometry[]
	pageCount?: number
	/**
	 * Tata letak tiap section, untuk aturan `@page secN` saat mencetak. Hanya
	 * kanvas yang mengetahuinya; tampilan baca-saja cukup mengabaikannya.
	 */
	sections?: readonly PageSetup[]
	showPageNumbers?: boolean
	children: ReactNode
}

export function DocumentPaper({
	setup,
	typography,
	furniture = null,
	sheets = [],
	pageCount = 1,
	sections = [],
	showPageNumbers = true,
	children,
}: DocumentPaperProps) {
	const geometry = useMemo(() => pageGeometry(setup), [setup])
	const typeRules = useMemo(() => typographyRules(typography), [typography])
	const { width: canvasWidth, height: totalHeight } = paperSize(geometry, sheets, pageCount)
	const { width, height, margins, pageStride, contentHeight } = geometry

	/*
	 * Batas tinggi blok kode, dihitung dari lembar yang sedang dipakai. Tanpa
	 * ini blok kode panjang mengalir menembus batas halaman dan terbaca
	 * menyambung seolah tidak ada batas; mode pageless tidak punya lembar untuk
	 * dibatasi.
	 */
	const codeBlockMaxHeight = setup.pageless
		? 'none'
		: `${Math.max(
				CODE_BLOCK_MIN_HEIGHT,
				Math.min(contentHeight * CODE_BLOCK_HEIGHT_RATIO, contentHeight - CODE_BLOCK_CHROME),
			)}px`

	const sheetList =
		sheets.length > 0
			? sheets.map((sheet) => ({
					key: sheet.index,
					index: sheet.index,
					top: sheet.top,
					left: (canvasWidth - sheet.width) / 2,
					width: sheet.width,
					height: sheet.height,
					margins: sheet.margins,
				}))
			: Array.from({ length: pageCount }, (_, index) => ({
					key: index,
					index,
					top: index * pageStride,
					left: 0,
					width,
					height,
					margins,
				}))

	return (
		<>
			{/* Rupa huruf dokumen: dibangkitkan dari tipografi yang berlaku, bukan
			    ditulis tangan di `globals.css`, supaya template benar-benar
			    menentukan ukuran judul dan badan naskahnya sendiri. Tanpa atribut
			    `media` karena ia harus berlaku di layar maupun di hasil cetak. */}
			<style>{typeRules}</style>
			{!setup.pageless && <style media="print">{printPageRules(setup, sections)}</style>}

			{/*
			 * `document-print-root` (E1): satu-satunya bagian DOM yang boleh
			 * dicetak. Ia ada di sini, bukan di bingkai zoom kanvas, karena hanya
			 * di sini ia berlaku untuk ketiga tampilan - mencetak dari halaman
			 * berbagi dulu tidak cocok dengan selektornya sama sekali, sehingga
			 * seluruh chrome peramban ikut tercetak.
			 *
			 * Bingkai zoom kanvas tetap aman: setiap leluhur print root kehilangan
			 * kotaknya lewat `display: contents`, dan elemen tanpa kotak tidak bisa
			 * membawa transform - yang justru satu-satunya alasan transform itu
			 * harus dilepas saat mencetak.
			 */}
			<div
				className="document-paper document-print-root"
				style={{ width: canvasWidth, minHeight: totalHeight }}
			>
				<div aria-hidden="true">
					{sheetList.map((sheet) => (
						<div
							key={sheet.key}
							className="document-sheet absolute"
							style={{
								top: sheet.top,
								left: sheet.left,
								width: sheet.width,
								height: sheet.height,
								...(setup.pageColor ? { background: setup.pageColor } : {}),
							}}
						>
							{!setup.pageless && (
								<SheetFurniture furniture={furniture} pageIndex={sheet.index} margins={sheet.margins} />
							)}
							{showPageNumbers && !setup.pageless && (
								<span
									className="absolute text-[11px] text-faint"
									style={{ bottom: sheet.margins.bottom / 3, right: sheet.margins.right }}
								>
									{sheet.index + 1}
								</span>
							)}
						</div>
					))}
				</div>

				{/*
				 * Pembungkus inilah kontraknya. Ia berposisi, jadi ia yang menjadi
				 * offsetParent tiap blok naskah - dan `pagination.ts` mengukur dengan
				 * `offsetTop`, yang selalu relatif ke offsetParent. Margin halaman
				 * jadi padding DI SINI, bukan di lembarnya, supaya `offsetTop` blok
				 * pertama persis sama dengan margin atas. Geometri diteruskan sebagai
				 * custom property karena node view tidak memakai context React
				 * (lihat `toc-block-view.tsx`); itulah satu-satunya cara blok HTML
				 * mode satu halaman tahu setinggi apa kertasnya.
				 */}
				<div
					className="document-page-padding relative z-10"
					style={
						{
							paddingTop: margins.top,
							paddingRight: margins.right,
							paddingBottom: margins.bottom,
							paddingLeft: margins.left,
							'--code-block-max-height': codeBlockMaxHeight,
							...(setup.pageless
								? {}
								: {
										'--page-content-height': `${contentHeight}px`,
										'--page-width': `${width}px`,
										'--page-height': `${height}px`,
										'--page-margin-top': `${margins.top}px`,
										'--page-margin-left': `${margins.left}px`,
									}),
						} as React.CSSProperties
					}
				>
					{children}
				</div>
			</div>
		</>
	)
}
