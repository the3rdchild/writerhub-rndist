'use client'

import type { Editor } from '@tiptap/react'
import { headingBreakLevels } from '@writer-hub/shared'
import { useMemo, useState } from 'react'
import { useEditorInstance } from '@/features/editor/editor-context'
import { SheetFurniture } from '@/features/editor/page-furniture/sheet-furniture'
import { usePageFurniture } from '@/features/editor/page-furniture/use-page-furniture'
import {
	type PageMargins,
	type PageSetup,
	pageGeometry,
	type SheetGeometry,
} from '@/features/editor/page-geometry'
import { typographyRules } from '@/features/editor/typography-css'
import { usePageSetup } from '@/features/editor/use-page-setup'
import { useTypography } from '@/features/editor/use-typography'
import { useSessions } from '@/features/sessions/session-context'
import { useSettings } from '@/features/settings/settings-context'
import { cn } from '@/lib/utils'
import { DocumentLeftRuler, LEFT_RULER_GAP, LEFT_RULER_WIDTH } from './document-left-ruler'
import { DocumentRuler } from './document-ruler'
import { TiptapEditor } from './tiptap-editor'

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
 * Di kanvas, blok mode halaman menembus margin dengan digeser keluar sejauh
 * margin itu (`globals.css`). Di kertas cara itu tidak bisa dipakai: peramban
 * memotong apa pun yang jatuh di luar area halaman, jadi flyer-nya keluar
 * tergeser dan terpangkas. Yang benar adalah menghapus marginnya, dan `@page`
 * bernama satu-satunya cara CSS menyatakan itu untuk sebagian halaman saja -
 * mekanisme yang sama yang sudah dipakai `page: secN` di bawah.
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

function printPageRules(base: PageSetup, sections: readonly PageSetup[]): string {
	const rules = [`@page { ${pageRuleBody(base)} }`, flyerPageRule(base)]

	sections.forEach((setup, index) => {
		if (index === 0) return
		rules.push(`@page sec${index} { ${pageRuleBody(setup)} }`)
		rules.push(`.document-section-${index} { page: sec${index}; }`)
	})

	return rules.join('\n')
}

export function DocumentCanvas({
	containerRef,
	onReady,
}: {
	containerRef: React.RefObject<HTMLDivElement | null>
	onReady?: (editor: Editor | null) => void
}) {
	const { settings } = useSettings()
	const { setup, setPageSetup } = usePageSetup()
	const { furniture } = usePageFurniture()
	const { typography } = useTypography()
	const { editor } = useEditorInstance()
	const { activeId } = useSessions()
	const [pageCount, setPageCount] = useState(1)
	const [sheets, setSheets] = useState<SheetGeometry[]>([])
	const [sectionSetups, setSectionSetups] = useState<PageSetup[]>([])

	const geometry = useMemo(() => pageGeometry(setup), [setup])
	const typeRules = useMemo(() => typographyRules(typography), [typography])
	const breakBeforeLevels = useMemo(() => headingBreakLevels(typography), [typography])
	const { width, height, margins, gap, pageStride, contentHeight } = geometry
	const codeBlockMaxHeight = setup.pageless
		? 'none'
		: `${Math.max(
				CODE_BLOCK_MIN_HEIGHT,
				Math.min(contentHeight * CODE_BLOCK_HEIGHT_RATIO, contentHeight - CODE_BLOCK_CHROME),
			)}px`
	const onMarginsChange = (patch: Partial<PageMargins>) =>
		setPageSetup({ ...setup, margins: { ...margins, ...patch } }, 'document')
	const canvasWidth = sheets.length > 0 ? Math.max(width, ...sheets.map((sheet) => sheet.width)) : width
	const totalHeight =
		sheets.length > 0
			? sheets[sheets.length - 1].top + sheets[sheets.length - 1].height
			: pageCount * height + (pageCount - 1) * gap
	const zoom = settings.zoom
	const leftRulerRoom = settings.showRuler && !setup.pageless ? LEFT_RULER_WIDTH + LEFT_RULER_GAP : 0

	return (
		<div className={cn('document-canvas flex-1 overflow-auto px-6 pb-8', !settings.showRuler && 'pt-8')}>
			{/*
			 */}
			{/* Rupa huruf dokumen: dibangkitkan dari tipografi yang berlaku, bukan
			    ditulis tangan di `globals.css`, supaya template benar-benar
			    menentukan ukuran judul dan badan naskahnya sendiri. Tanpa atribut
			    `media` karena ia harus berlaku di layar maupun di hasil cetak. */}
			<style>{typeRules}</style>
			{!setup.pageless && <style media="print">{printPageRules(setup, sectionSetups)}</style>}
			<div className="mx-auto" style={{ width: canvasWidth * zoom + leftRulerRoom }}>
				{settings.showRuler && (
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
					    halaman di dalam elemen ber-transform). *)

					    Bingkai luar sekaligus memikul peran `document-print-root` (E1):
					    satu-satunya bagian DOM yang boleh dicetak. Ia yang dipilih,
					    bukan pembungkus editor di luarnya, karena hanya ia yang memuat
					    lembar + naskah TANPA chrome - penggaris, bilah status, dan
					    spanduk semuanya berada di luar bingkai ini. */}
					<div
						className="document-zoom-frame document-print-root"
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
													left: (canvasWidth - sheet.width) / 2,
													width: sheet.width,
													height: sheet.height,
													...(setup.pageColor ? { background: setup.pageColor } : {}),
												}}
											>
												{' '}
												{!setup.pageless && (
													<SheetFurniture
														furniture={furniture}
														pageIndex={sheet.index}
														margins={sheet.margins}
													/>
												)}{' '}
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
												{!setup.pageless && (
													<SheetFurniture furniture={furniture} pageIndex={index} margins={margins} />
												)}
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
										/*
										 * Geometri lembar untuk blok yang harus tahu ukuran
										 * halaman, bukan cuma ukuran kolom teks
										 * (`features/editor/html-block.ts`). Mode pageless
										 * tidak punya lembar, jadi nilainya sengaja tidak
										 * diisi dan CSS-nya jatuh ke bawaan.
										 */
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
								{/*
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
										onSectionsChange={setSectionSetups}
										breakBeforeLevels={breakBeforeLevels}
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
