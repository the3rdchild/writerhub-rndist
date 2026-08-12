'use client'

import type { Editor } from '@tiptap/react'
import { useMemo, useState } from 'react'
import { useEditorInstance } from '@/features/editor/editor-context'
import { useSessions } from '@/features/sessions/session-context'
import { pageGeometry, type PageMargins } from '@/features/editor/page-geometry'
import { usePageSetup } from '@/features/editor/use-page-setup'
import { useSettings } from '@/features/settings/settings-context'
import { cn } from '@/lib/utils'
import { DocumentRuler } from './document-ruler'
import { TiptapEditor } from './tiptap-editor'

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

	const geometry = useMemo(() => pageGeometry(setup), [setup])
	const { width, height, margins, gap, pageStride } = geometry

	/*
	 * Penggaris menulis perubahan margin langsung ke tata letak dokumen
	 * (Y.Doc), bukan ke preferensi pemakai - keputusan §2.1. scope 'document'
	 * menyamaratak semua tab; di sinilah ruler atas bekerja.
	 */
	const onMarginsChange = (patch: Partial<PageMargins>) =>
		setPageSetup({ ...setup, margins: { ...margins, ...patch } }, 'document')

	const totalHeight = pageCount * height + (pageCount - 1) * gap
	const zoom = settings.zoom

	return (
		<div
			className={cn(
				'document-canvas flex-1 overflow-auto px-6 pb-8',
				!settings.showRuler && 'pt-8',
			)}
		>
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
					className="document-ruler-bar sticky top-0 z-10 mx-auto"
					style={{ width: width * zoom }}
				>
					<DocumentRuler
						geometry={geometry}
						zoom={zoom}
						editor={editor}
						onMarginsChange={onMarginsChange}
					/>
				</div>
			)}

			{/* Pembungkus berukuran hasil zoom supaya scrollbar tetap akurat;
			    elemen di dalamnya yang benar-benar diperbesar. */}
			<div className="mx-auto" style={{ width: width * zoom, height: totalHeight * zoom }}>
				<div
					className="relative"
					style={{
						width,
						minHeight: totalHeight,
						transform: `scale(${zoom})`,
						transformOrigin: 'top left',
					}}
				>
					<div aria-hidden="true">
						{Array.from({ length: pageCount }, (_, index) => (
							<div
								key={index}
								className="document-sheet absolute left-0"
								style={{
									top: index * pageStride,
									width,
									height,
									// pageColor null = ikuti tema (kelas CSS). Diisi eksplisit
									// hanya bila pengguna memilih warna (WYSIWYG, putusan §9).
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
						className="relative z-10"
						style={{
							paddingTop: margins.top,
							paddingRight: margins.right,
							paddingBottom: margins.bottom,
							paddingLeft: margins.left,
						}}
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
								geometry={geometry}							pageless={setup.pageless}								onPageCountChange={setPageCount}
							/>
						)}
					</div>
				</div>
			</div>
		</div>
	)
}
