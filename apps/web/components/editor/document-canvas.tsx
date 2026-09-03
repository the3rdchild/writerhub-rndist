'use client'

import type { Editor } from '@tiptap/react'
import { headingBreakLevels } from '@writer-hub/shared'
import { useMemo, useState } from 'react'
import { useEditorInstance } from '@/features/editor/editor-context'
import { usePageFurniture } from '@/features/editor/page-furniture/use-page-furniture'
import {
	type PageMargins,
	type PageSetup,
	pageGeometry,
	type SheetGeometry,
} from '@/features/editor/page-geometry'
import { usePageSetup } from '@/features/editor/use-page-setup'
import { useTypography } from '@/features/editor/use-typography'
import { useSessions } from '@/features/sessions/session-context'
import { useSettings } from '@/features/settings/settings-context'
import { cn } from '@/lib/utils'
import { DocumentLeftRuler, LEFT_RULER_GAP, LEFT_RULER_WIDTH } from './document-left-ruler'
import { DocumentPaper, paperSize } from './document-paper'
import { DocumentRuler } from './document-ruler'
import { TiptapEditor } from './tiptap-editor'

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
	const breakBeforeLevels = useMemo(() => headingBreakLevels(typography), [typography])
	const { width, margins } = geometry
	const onMarginsChange = (patch: Partial<PageMargins>) =>
		setPageSetup({ ...setup, margins: { ...margins, ...patch } }, 'document')
	// Ukuran kertas dihitung `document-paper.tsx`; bingkai zoom memakai angka
	// yang sama supaya scrollbar-nya tidak pernah berselisih dengan isinya.
	const { width: canvasWidth, height: totalHeight } = paperSize(geometry, sheets, pageCount)
	const zoom = settings.zoom
	const leftRulerRoom = settings.showRuler && !setup.pageless ? LEFT_RULER_WIDTH + LEFT_RULER_GAP : 0

	return (
		<div className={cn('document-canvas flex-1 overflow-auto px-6 pb-8', !settings.showRuler && 'pt-8')}>
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
					    tercetak sebagai satu halaman raksasa (peramban tidak memenggal
					    halaman di dalam elemen ber-transform).

					    `document-print-root` sendiri kini melekat pada kertas di dalam
					    (`document-paper.tsx`), supaya ketiga tampilan naskah memakai
					    penanda yang sama. Bingkai ini tetap aman: leluhur print root
					    kehilangan kotaknya lewat `display: contents`, dan elemen tanpa
					    kotak tidak bisa membawa transform. */}
					<div
						className="document-zoom-frame"
						style={{ width: canvasWidth * zoom, height: totalHeight * zoom }}
					>
						<div
							className="document-zoom-inner"
							style={{
								width: canvasWidth,
								minHeight: totalHeight,
								transform: `scale(${zoom})`,
								transformOrigin: 'top left',
							}}
						>
							<DocumentPaper
								setup={setup}
								typography={typography}
								furniture={furniture}
								sheets={sheets}
								pageCount={pageCount}
								sections={sectionSetups}
								showPageNumbers={settings.showPageNumbers}
							>
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
							</DocumentPaper>
						</div>
					</div>
				</div>
			</div>
		</div>
	)
}
