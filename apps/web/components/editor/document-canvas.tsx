'use client'

import type { Editor } from '@tiptap/react'
import { useMemo, useState } from 'react'
import { pageGeometry } from '@/features/editor/page-geometry'
import { useSettings } from '@/features/settings/settings-context'
import { TiptapEditor } from './tiptap-editor'

/**
 * Kanvas tempat lembar dokumen berada.
 *
 * Lembar digambar sebagai lapisan latar, sementara teks mengalir di atasnya
 * sebagai satu dokumen utuh. Yang memindahkan teks melewati batas lembar adalah
 * spacer dari ekstensi Pagination — bukan pemotongan node — sehingga seleksi,
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
	const [pageCount, setPageCount] = useState(1)

	const geometry = useMemo(() => pageGeometry(settings.pageSize), [settings.pageSize])
	const { width, height, margin, gap, pageStride } = geometry

	const totalHeight = pageCount * height + (pageCount - 1) * gap
	const zoom = settings.zoom

	return (
		<div className="document-canvas flex-1 overflow-auto px-6 py-8">
			{/* Pembungkus berukuran hasil zoom supaya scrollbar tetap akurat;
			    elemen di dalamnya yang benar-benar diperbesar. */}
			<div
				className="mx-auto"
				style={{ width: width * zoom, height: totalHeight * zoom }}
			>
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
								style={{ top: index * pageStride, width, height }}
							>
								{settings.showPageNumbers && (
									<span
										className="absolute right-0 text-[11px] text-faint"
										style={{ bottom: margin / 3, right: margin }}
									>
										{index + 1}
									</span>
								)}
							</div>
						))}
					</div>

					<div className="relative z-10" style={{ padding: margin }}>
						<TiptapEditor
							containerRef={containerRef}
							onReady={onReady}
							geometry={geometry}
							onPageCountChange={setPageCount}
						/>
					</div>
				</div>
			</div>
		</div>
	)
}
