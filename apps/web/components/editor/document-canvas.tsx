'use client'

import type { Editor } from '@tiptap/react'
import { useMemo, useState } from 'react'
import { useEditorInstance } from '@/features/editor/editor-context'
import { useSessions } from '@/features/sessions/session-context'
import { pageGeometry, type PageMargins, type SheetGeometry } from '@/features/editor/page-geometry'
import { usePageSetup } from '@/features/editor/use-page-setup'
import { useSettings } from '@/features/settings/settings-context'
import { cn } from '@/lib/utils'
import { DocumentRuler } from './document-ruler'
import { DocumentLeftRuler, LEFT_RULER_GAP, LEFT_RULER_WIDTH } from './document-left-ruler'
import { TiptapEditor } from './tiptap-editor'

/**
 * Bagian area teks yang boleh dipakai satu blok kode sebelum isinya digulung.
 *
 * Batas atasnya sudah pasti: satu blok tidak boleh lebih tinggi dari area teks,
 * sebab paginasi tidak bisa memenggal isi satu node - yang lebih tinggi dari
 * satu lembar hanya bisa dibiarkan meluber menembus margin dan celah.
 *
 * Angka di bawah batas itu adalah pilihan rasa: makin besar, makin jarang perlu
 * menggulung di dalam blok, tapi makin sering satu blok yang tidak muat
 * meninggalkan ruang kosong lebar di ujung halaman sebelumnya. 0.6 memberi
 * sekitar 30 baris kode pada A4 - cukup untuk dibaca sekali pandang tanpa
 * memakan satu halaman penuh.
 */
const CODE_BLOCK_HEIGHT_RATIO = 0.6

/** Toolbar bahasa di kepala blok, plus sedikit kelonggaran. */
const CODE_BLOCK_CHROME = 48

/** Sisa ruang sependek ini tidak lagi berguna untuk menampilkan kode. */
const CODE_BLOCK_MIN_HEIGHT = 120

/** Piksel 96 dpi → milimeter, dibulatkan 2 desimal untuk aturan `@page`. */
const mm = (px: number) => Math.round((px / 96) * 25.4 * 100) / 100

/**
 * Kanvas tempat lembar dokumen berada.
 *
 * Lembar digambar sebagai lapisan latar, sementara teks mengalir di atasnya
 * sebagai satu dokumen utuh. Yang memindahkan teks melewati batas lembar adalah
 * spacer dari ekstensi Pagination - bukan pemotongan node - sehingga seleksi,
 * penyalinan, dan pemetaan offset untuk sorotan grammar tetap berjalan seperti
 * pada dokumen biasa.
 */
export function DocumentCanvas({
	containerRef,
	onReady,
}: {
	containerRef: React.RefObject<HTMLDivElement | null>
	onReady?: (editor: Editor | null) => void
}) {
	const { settings } = useSettings()
	const { setup, setPageSetup } = usePageSetup()
	const { editor } = useEditorInstance()
	const { activeId } = useSessions()
	const [pageCount, setPageCount] = useState(1)
	// Lembar hasil perhitungan paginasi; kosong pada bingkai-bingkai pertama.
	// Dengan section (§P8&P9) lembar boleh berbeda ukuran dan orientasi.
	const [sheets, setSheets] = useState<SheetGeometry[]>([])

	const geometry = useMemo(() => pageGeometry(setup), [setup])
	const { width, height, margins, gap, pageStride, contentHeight } = geometry

	/*
	 * Blok kode dibatasi setinggi area teks dan sisanya digulung di dalam bloknya
	 * sendiri. Tanpa itu, blok kode panjang tumbuh melewati batas lembar dan
	 * isinya terbaca menyambung menembus celah antar halaman.
	 *
	 * Nilainya dikirim sebagai custom property, bukan ditulis di CSS: hanya di
	 * sini geometri lembar diketahui, dan ia berubah tiap kali ukuran kertas atau
	 * margin diubah. Mode pageless tidak punya batas lembar, jadi tidak dibatasi.
	 */
	const codeBlockMaxHeight = setup.pageless
		? 'none'
		: `${Math.max(
				CODE_BLOCK_MIN_HEIGHT,
				Math.min(contentHeight * CODE_BLOCK_HEIGHT_RATIO, contentHeight - CODE_BLOCK_CHROME),
			)}px`

	/*
	 * Penggaris menulis perubahan margin langsung ke tata letak dokumen
	 * (Y.Doc), bukan ke preferensi pemakai - keputusan §2.1. scope 'document'
	 * menyamaratak semua tab; di sinilah ruler atas bekerja.
	 */
	const onMarginsChange = (patch: Partial<PageMargins>) =>
		setPageSetup({ ...setup, margins: { ...margins, ...patch } }, 'document')

	// Kanvas selebar lembar terlebar; lembar yang lebih sempit dipusatkan.
	const canvasWidth = sheets.length > 0 ? Math.max(width, ...sheets.map((sheet) => sheet.width)) : width
	const totalHeight =
		sheets.length > 0
			? sheets[sheets.length - 1].top + sheets[sheets.length - 1].height
			: pageCount * height + (pageCount - 1) * gap
	const zoom = settings.zoom

	// Ruang penggaris kiri: lembar bergeser selebar ini ke kanan saat penggaris
	// tampil. Penggaris atas ikut digeser (marginLeft) supaya keduanya tetap
	// sejajar dengan tepi lembar. Pada pageless penggaris kiri disembunyikan
	// (§A1.5) - tidak ada lembar yang bisa dijadikan asal skala.
	const leftRulerRoom =
		settings.showRuler && !setup.pageless ? LEFT_RULER_WIDTH + LEFT_RULER_GAP : 0

	return (
		<div
			className={cn(
				'document-canvas flex-1 overflow-auto px-6 pb-8',
				!settings.showRuler && 'pt-8',
			)}
		>
			{/*
			 * Ukuran kertas & margin untuk pencetakan.
			 *
			 * Harus disuntikkan dari sini, bukan ditulis di globals.css: keduanya
			 * milik naskah dan berubah kapan saja lewat dialog Penyiapan halaman,
			 * sedangkan `@page` tidak menerima custom property.
			 *
			 * Di kertas, margin datang dari `@page` - bukan dari padding pembungkus
			 * seperti di layar. Bedanya penting: di layar tiap lembar berhenti
			 * sendiri di batas area teks, sementara saat dicetak naskah mengalir
			 * menerus dan peramban yang memenggalnya, jadi hanya `@page` yang bisa
			 * memberi margin pada halaman KEDUA dan seterusnya.
			 *
			 * Batasan yang diketahui: dokumen dengan section berukuran berbeda
			 * (§P8&P9) tercetak seluruhnya pada ukuran section pertama - CSS baru
			 * bisa membedakannya lewat named pages, dan dukungannya belum merata.
			 */}
			{!setup.pageless && (
				<style media="print">{`@page { size: ${mm(width)}mm ${mm(height)}mm; margin: ${mm(margins.top)}mm ${mm(margins.right)}mm ${mm(margins.bottom)}mm ${mm(margins.left)}mm; }`}</style>
			)}
			<div className="mx-auto" style={{ width: canvasWidth * zoom + leftRulerRoom }}>
				{settings.showRuler && (
					// Penggaris ikut menggulung mendatar bersama lembar, tapi menempel di
					// atas saat menggulung vertikal - ia harus tetap terbaca sepanjang
					// dokumen, bukan hanya di halaman pertama.
					//
					// z-10 = lapisan isi kanvas (lihat skala lapisan di globals.css), jauh
					// di bawah TopBar: menu yang terbuka dari sana terkurung di stacking
					// context TopBar, jadi penggaris yang menyamai nilainya akan menutupi
					// seluruh dropdown.
					<div
						className="document-ruler-bar sticky top-0 z-10"
						style={{ marginLeft: leftRulerRoom, width: width * zoom }}
					>
						<DocumentRuler
							geometry={geometry}
							zoom={zoom}
							editor={editor}
							onMarginsChange={onMarginsChange}
						/>
					</div>
				)}

				<div className="flex">
					{settings.showRuler && !setup.pageless && (
						// Penggaris kiri menggulung bersama lembar ke dua arah - ia milik
						// lembar, bukan bingkai layar.
						<div className="shrink-0" style={{ width: leftRulerRoom, paddingRight: LEFT_RULER_GAP }}>
							<DocumentLeftRuler
								geometry={geometry}
								zoom={zoom}
								pageCount={pageCount}
								unit={settings.measurementUnit}
								onMarginsChange={onMarginsChange}
							/>
						</div>
					)}

					{/* Pembungkus berukuran hasil zoom supaya scrollbar tetap akurat;
					    elemen di dalamnya yang benar-benar diperbesar.

					    Keduanya diberi nama kelas, bukan dibiarkan jadi div polos:
					    aturan cetak harus melepas ukuran dan transform-nya, dan
					    menyasarnya lewat rantai `>` sempat meleset diam-diam begitu
					    satu lapisan pembungkus bertambah - hasilnya seluruh dokumen
					    tercetak sebagai satu halaman raksasa (browser tidak memenggal
					    halaman di dalam elemen ber-transform). */}
					<div
						className="document-zoom-frame"
						style={{ width: canvasWidth * zoom, height: totalHeight * zoom }}
					>
						<div
							className="document-zoom-inner relative"
							style={{
								width: canvasWidth,
								minHeight: totalHeight,
								transform: `scale(${zoom})`,
								transformOrigin: 'top left',
							}}
						>
							<div aria-hidden="true">
								{sheets.length > 0
									? sheets.map((sheet) => (
											<div
												key={sheet.index}
												className="document-sheet absolute"
												style={{
													top: sheet.top,
													// Lembar yang lebih sempit dari kanvas dipusatkan (§P8&P9).
													left: (canvasWidth - sheet.width) / 2,
													width: sheet.width,
													height: sheet.height,
													// pageColor null = ikuti tema (kelas CSS). Diisi eksplisit
													// hanya bila pengguna memilih warna (WYSIWYG, putusan §9).
													...(setup.pageColor ? { background: setup.pageColor } : {}),
												}}
											>
												{settings.showPageNumbers && !setup.pageless && (
													<span
														className="absolute text-[11px] text-faint"
														style={{
															bottom: sheet.margins.bottom / 3,
															right: sheet.margins.right,
														}}
													>
														{sheet.index + 1}
													</span>
												)}
											</div>
										))
									: Array.from({ length: pageCount }, (_, index) => (
											<div
												key={index}
												className="document-sheet absolute left-0"
												style={{
													top: index * pageStride,
													width,
													height,
													...(setup.pageColor ? { background: setup.pageColor } : {}),
												}}
											>
												{settings.showPageNumbers && !setup.pageless && (
													<span
														className="absolute text-[11px] text-faint"
														style={{ bottom: margins.bottom / 3, right: margins.right }}
													>
														{index + 1}
													</span>
												)}
											</div>
										))}
							</div>

							<div
								className="document-page-padding relative z-10"
								style={
									{
										paddingTop: margins.top,
										paddingRight: margins.right,
										paddingBottom: margins.bottom,
										paddingLeft: margins.left,
										'--code-block-max-height': codeBlockMaxHeight,
									} as React.CSSProperties
								}
							>
								{/*
								 * Editor menunggu naskah tersimpan selesai dimuat.
								 *
								 * Ia terikat ke fragmen Y.Doc milik tab aktif, jadi membuatnya
								 * sebelum tab itu diketahui berarti satu editor sia-sia yang
								 * langsung dibuang - dan lembar kosong yang berkelebat sebelum
								 * naskah muncul.
								 */}
								{activeId && (
									<TiptapEditor
										containerRef={containerRef}
										onReady={onReady}
										geometry={geometry}
										setup={setup}
										pageless={setup.pageless}
										onPageCountChange={setPageCount}
										onSheetsChange={setSheets}
									/>
								)}
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	)
}
