'use client'

import type { DocumentTypography } from '@writer-hub/shared'
import type { ReactNode } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { FurnitureEditor } from '@/features/editor/page-furniture/furniture-editor'
import {
	type FurnitureSlot,
	type FurnitureVariant,
	PAGE_TOKEN,
	PAGES_TOKEN,
	type PageFurniture,
	variantFor,
} from '@/features/editor/page-furniture/model'
import { formatSheetNumbers } from '@/features/editor/page-furniture/numbering'
import { FURNITURE_SLOTS } from '@/features/editor/page-furniture/page-furniture-ydoc'
import { SheetFurniture } from '@/features/editor/page-furniture/sheet-furniture'
import {
	footerMarginOf,
	headerMarginOf,
	type PageGeometry,
	type PageMargins,
	type PageSetup,
	pageGeometry,
	type SheetGeometry,
} from '@/features/editor/page-geometry'
import { typographyRules } from '@/features/editor/typography-css'
import { watermarkIsEmpty } from '@/features/editor/watermark'
import { cn } from '@/lib/utils'
import { useWatermarkSrc, WatermarkLayer, WatermarkPrintLayer } from './watermark-layer'

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

function pageRuleBody(setup: PageSetup, bleed = false): string {
	const { width, height, margins } = pageGeometry(setup)
	/* Margin nol adalah SYARAT watermark tanpa batas margin, bukan gaya: lapisan
	 * cetak `fixed` selalu menyusut ke kotak margin `@page`. Marginnya tidak
	 * hilang - ia pindah ke bingkai cetak yang berulang tiap halaman. */
	if (bleed) return `size: ${mm(width)}mm ${mm(height)}mm; margin: 0;`
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

export function printPageRules(base: PageSetup, sections: readonly PageSetup[], bleed = false): string {
	const rules = [`@page { ${pageRuleBody(base, bleed)} }`, flyerPageRule(base)]

	sections.forEach((setup, index) => {
		if (index === 0) return
		rules.push(`@page sec${index} { ${pageRuleBody(setup, bleed)} }`)
		rules.push(`.document-section-${index} { page: sec${index}; }`)
	})

	return rules.join('\n')
}

/**
 * Margin semua section sama dengan margin dasar?
 *
 * Bingkai cetak hanya bisa membawa SATU tinggi spacer untuk seluruh dokumen -
 * `<thead>` yang sama itulah yang diulang peramban di tiap halaman. Dokumen
 * yang margin per bagiannya berbeda-beda karena itu tidak bisa dilayaninya, dan
 * jatuh kembali ke margin `@page` (watermarknya tetap terkurung kotak margin di
 * kertas) alih-alih mencetak bagian yang marginnya salah.
 */
function marginsUniform(base: PageSetup, sections: readonly PageSetup[]): boolean {
	const same = (a: PageSetup) => {
		const one = pageGeometry(a).margins
		const two = pageGeometry(base).margins
		return (
			one.top === two.top && one.right === two.right && one.bottom === two.bottom && one.left === two.left
		)
	}
	return sections.every(same)
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
	/** HTML isi kaya per slot+varian (hanya kanvas yang menyuplainya). */
	furnitureContent?: (slot: FurnitureSlot, variant: FurnitureVariant) => string | null
	/** Kehadiran fragmen per slot+varian, termasuk yang masih kosong. */
	furnitureHasVariant?: (slot: FurnitureSlot, variant: FurnitureVariant) => boolean
	/** Mode sunting di tempat; editor kecil dirender pada lembar targetnya. */
	furnitureEdit?: { slot: FurnitureSlot; variant: FurnitureVariant; sheetIndex: number } | null
	/** Dipanggil saat area margin lembar diklik ganda (khusus kanvas). */
	onFurnitureActivate?: (slot: FurnitureSlot, sheetIndex: number) => void
	/** Keluar dari mode sunting (tombol Selesai / Esc / klik ganda badan). */
	onFurnitureDeactivate?: () => void
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

/** Teks perabot ini menggambar nomor halaman sendiri? */
const carriesNumber = (text: string) => text.includes(PAGE_TOKEN) || text.includes(PAGES_TOKEN)

export function DocumentPaper({
	setup,
	typography,
	furniture = null,
	furnitureContent,
	furnitureHasVariant,
	furnitureEdit = null,
	onFurnitureActivate,
	onFurnitureDeactivate,
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
	const headerMargin = headerMarginOf(setup)
	const footerMargin = footerMarginOf(setup)
	/* Nomor per lembar mengikuti penomoran section (T4); token {pages} selalu
	 * desimal seperti NUMPAGES Word. */
	const sheetNumbers = useMemo(() => formatSheetNumbers(sheets, pageCount), [sheets, pageCount])

	/*
	 * Lencana sudut adalah CADANGAN, bukan penomoran kedua.
	 *
	 * Yang menyingkirkannya bukan "ada perabot", melainkan "perabotnya SUDAH
	 * menggambar nomor". Bedanya penting: perabot yang ada tapi kosong - dan itu
	 * bentuk paling umum, karena impor lama meninggalkan paragraf kosong -
	 * membuat aturan "ada perabot" menelan nomornya diam-diam, sehingga Apply di
	 * dialog tidak menghasilkan apa pun yang terlihat.
	 *
	 * Halaman pertama diperlakukan tersendiri: begitu ia punya perabot sendiri,
	 * itu keputusan sadar pengguna ("Show on first page" dimatikan), jadi
	 * lencananya pun tidak menerobos masuk.
	 */
	const furnitureShowsNumber = useCallback(
		(pageIndex: number): boolean =>
			FURNITURE_SLOTS.some((slot) => {
				const has = (candidate: FurnitureVariant) =>
					Boolean(furniture?.[slot]?.[candidate] || furnitureHasVariant?.(slot, candidate))
				const variant = variantFor(pageIndex, has)
				const html = furnitureContent?.(slot, variant)
				return html ? carriesNumber(html) : carriesNumber(furniture?.[slot]?.[variant]?.text ?? '')
			}),
		[furniture, furnitureContent, furnitureHasVariant],
	)

	const firstPageSeparate = FURNITURE_SLOTS.some((slot) =>
		Boolean(furniture?.[slot]?.first || furnitureHasVariant?.(slot, 'first')),
	)
	const totalPages = String(sheets.length > 0 ? sheets.length : pageCount)

	/* Watermark dibaca sekali di sini, bukan per lembar: satu aset, satu URL
	 * bertanda tangan - menjemputnya per lembar berarti puluhan permintaan
	 * yang sama untuk gambar yang sama. */
	const watermark = setup.watermark
	const watermarkSrc = useWatermarkSrc(watermark)

	/*
	 * Jalur cetak bermargin nol - dipakai HANYA saat memang dibutuhkan.
	 *
	 * Watermark tanpa batas margin adalah satu-satunya alasan menyentuh aliran
	 * cetak, jadi dokumen tanpa watermark seperti itu mencetak persis seperti
	 * sebelumnya: margin tetap di `@page`, tanpa bingkai tabel di DOM-nya.
	 */
	const bleedWanted = !setup.pageless && watermark?.bleed === true && !watermarkIsEmpty(watermark)
	const paperRef = useRef<HTMLDivElement>(null)
	const hasPageBlock = usePageBlockPresence(paperRef, bleedWanted)
	const bleedPrint = bleedWanted && !hasPageBlock && marginsUniform(setup, sections)

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
			{!setup.pageless && <style media="print">{printPageRules(setup, sections, bleedPrint)}</style>}

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
				ref={paperRef}
				className="document-paper document-print-root"
				style={{ width: canvasWidth, minHeight: totalHeight }}
			>
				{/* Lapisan latar lembar; disembunyikan utuh saat mencetak lewat
				 * kelas `document-sheet-layer` — lihat globals.css. */}
				<div aria-hidden="true" className="document-sheet-layer">
					{sheetList.map((sheet) => {
						return (
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
									<WatermarkLayer
										watermark={watermark}
										/* Ukuran lembar ikut, bukan hanya marginnya: bidang acuan
										 * `bleed` adalah kertas lembar INI, dan lembar section bisa
										 * berbeda ukuran dari lembar dasarnya. */
										geometry={{
											...geometry,
											margins: sheet.margins,
											width: sheet.width,
											height: sheet.height,
										}}
										src={watermarkSrc}
									/>
								)}
								{!setup.pageless && (
									<SheetFurniture
										furniture={furniture}
										contentOf={furnitureContent}
										hasVariant={furnitureHasVariant}
										pageIndex={sheet.index}
										margins={sheet.margins}
										headerMargin={headerMargin}
										footerMargin={footerMargin}
										pageNumber={sheetNumbers[sheet.index] ?? String(sheet.index + 1)}
										totalPages={totalPages}
									/>
								)}
								{/* Area sunting di tempat (T5): klik ganda margin atas/bawah
								 * masuk mode sunting slot itu — hanya di kanvas. */}
								{!setup.pageless && onFurnitureActivate && (
									<>
										{/* biome-ignore lint/a11y/noStaticElementInteractions: pintasan tetikus
										 * murni, disembunyikan dari teknologi bantu. Jalur papan tiknya ada di
										 * menu Format → Header & footer, bukan di overlay setinggi margin ini —
										 * menjadikannya tombol justru menyisipkan sasaran tab di tiap lembar. */}
										<div
											aria-hidden="true"
											className="furniture-hitbox furniture-hitbox--header"
											style={{ height: sheet.margins.top }}
											onDoubleClick={() => onFurnitureActivate('header', sheet.index)}
											title="Double-click to edit header"
										/>
										{/* biome-ignore lint/a11y/noStaticElementInteractions: pintasan tetikus
										 * murni, disembunyikan dari teknologi bantu. Jalur papan tiknya ada di
										 * menu Format → Header & footer, bukan di overlay setinggi margin ini —
										 * menjadikannya tombol justru menyisipkan sasaran tab di tiap lembar. */}
										<div
											aria-hidden="true"
											className="furniture-hitbox furniture-hitbox--footer"
											style={{ height: sheet.margins.bottom }}
											onDoubleClick={() => onFurnitureActivate('footer', sheet.index)}
											title="Double-click to edit footer"
										/>
									</>
								)}
								{!setup.pageless && furnitureEdit !== null && furnitureEdit.sheetIndex === sheet.index && (
									<FurnitureEditor
										slot={furnitureEdit.slot}
										variant={furnitureEdit.variant}
										edge={furnitureEdit.slot === 'header' ? 'top' : 'bottom'}
										offset={furnitureEdit.slot === 'header' ? headerMargin : footerMargin}
										margins={sheet.margins}
										sheetIndex={sheet.index}
										onExit={onFurnitureDeactivate ?? (() => {})}
									/>
								)}
								{/* Ikut penomoran dokumen: kalau bagian ini memakai romawi, lencana
								 * sudut pun membaca "iii", bukan "3". Kosong berarti bagian ini
								 * memang disembunyikan - lencananya pun tidak digambar. */}
								{showPageNumbers &&
									!setup.pageless &&
									!furnitureShowsNumber(sheet.index) &&
									!(sheet.index === 0 && firstPageSeparate) &&
									(sheetNumbers[sheet.index] ?? String(sheet.index + 1)) !== '' && (
										<span
											className="absolute text-[11px] text-faint"
											style={{ bottom: sheet.margins.bottom / 3, right: sheet.margins.right }}
										>
											{sheetNumbers[sheet.index] ?? String(sheet.index + 1)}
										</span>
									)}
							</div>
						)
					})}
				</div>

				{/*
				 * Penyaji CETAK watermark - satu lapisan, digandakan peramban ke tiap
				 * halaman. Letaknya di sini bukan kebetulan: di dalam print root
				 * (CSS cetak menyatakan yang boleh dicetak secara positif, di luar itu
				 * lenyap) dan DI LUAR lapisan lembar di atas (lapisan itu disembunyikan
				 * utuh saat mencetak - itulah sebabnya header/footer tidak pernah
				 * tercetak). Di layar ia tidak tampil sama sekali.
				 */}
				{!setup.pageless && (
					<WatermarkPrintLayer watermark={watermark} geometry={geometry} src={watermarkSrc} />
				)}

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
				{withPrintFrame(
					/* biome-ignore lint/a11y/noStaticElementInteractions: klik ganda di badan
					 * naskah hanya jalan keluar tambahan dari mode sunting perabot; padanan
					 * papan tiknya Escape (lihat furniture-editor.tsx) dan tombol "Done".
					 * `aria-hidden` tidak dipakai di sini - ini pembungkus seluruh naskah. */
					<div
						className={cn('document-page-padding relative z-10', furnitureEdit && 'furniture-dimming')}
						onDoubleClick={furnitureEdit ? onFurnitureDeactivate : undefined}
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
					</div>,
					bleedPrint ? margins : null,
				)}
			</div>
		</>
	)
}

/**
 * Adakah rancangan satu halaman (`fit: page`) di kertas ini?
 *
 * Bingkai cetak dan blok itu tidak bisa hidup bersama: bingkainya menyisakan
 * ruang setinggi margin di SETIAP halaman, sementara rancangan itu menuntut
 * setinggi kertas - hasilnya pecah jadi dua halaman, yang kedua nyaris kosong
 * (terukur di print-pages.test.ts). Yang mengalah watermarknya, bukan
 * rancangannya: dokumen yang sudah benar tidak boleh berubah karena setelan
 * yang baru dinyalakan.
 *
 * Diperiksa dari DOM, bukan dari prop, supaya ketiga tampilan naskah - kanvas,
 * halaman berbagi, riwayat versi - terlayani satu kali. Pengamatnya hanya
 * dipasang saat watermark tembus margin memang diminta, jadi dokumen lain tidak
 * memikul biayanya sama sekali.
 */
function usePageBlockPresence(paper: React.RefObject<HTMLDivElement | null>, enabled: boolean): boolean {
	const [present, setPresent] = useState(false)

	useEffect(
		function watchPageBlocks() {
			if (!enabled) {
				setPresent(false)
				return
			}
			const node = paper.current
			if (!node) return

			const look = () => setPresent(node.querySelector('[data-html-block-fit="page"]') !== null)
			look()

			const observer = new MutationObserver(look)
			observer.observe(node, { childList: true, subtree: true })
			return () => observer.disconnect()
		},
		[enabled, paper],
	)

	return present
}

/**
 * Bingkai cetak: margin halaman yang dipindah dari `@page` ke DOM.
 *
 * Bentuknya tabel SUNGGUHAN, dan itu bukan selera: hanya `<thead>`/`<tfoot>`
 * tabel HTML yang diulang peramban di tiap halaman cetak - `display:
 * table-header-group` pada div tidak diulang sama sekali (terukur di
 * print-pages.test.ts). Spacer setinggi margin itulah yang menjaga naskah tetap
 * masuk ke dalam, sementara `@page`-nya sendiri sudah bermargin nol sehingga
 * watermark boleh menembus sampai tepi kertas.
 *
 * Di layar ia tidak berbekas: CSS mengembalikan semua elemennya ke `display:
 * block` dan menyembunyikan spacernya, jadi kanvas, halaman berbagi, dan
 * riwayat versi tetap seperti sebelumnya.
 */
function withPrintFrame(content: ReactNode, margins: PageMargins | null): ReactNode {
	if (!margins) return content

	return (
		<table
			className="document-print-frame"
			style={
				{
					'--print-margin-top': `${margins.top}px`,
					'--print-margin-right': `${margins.right}px`,
					'--print-margin-bottom': `${margins.bottom}px`,
					'--print-margin-left': `${margins.left}px`,
				} as React.CSSProperties
			}
		>
			{/* Spacer, bukan perabot: kosong dan `aria-hidden`, semata-mata
			    penyedia ruang margin yang berulang di tiap halaman. */}
			<thead aria-hidden="true">
				<tr>
					<td />
				</tr>
			</thead>
			<tfoot aria-hidden="true">
				<tr>
					<td />
				</tr>
			</tfoot>
			<tbody>
				<tr>
					<td>{content}</td>
				</tr>
			</tbody>
		</table>
	)
}
