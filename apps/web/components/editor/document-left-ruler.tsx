'use client'

import { useRef, useState } from 'react'
import {
	INCH,
	MIN_CONTENT_HEIGHT,
	type PageGeometry,
	type PageMargins,
	type SheetGeometry,
} from '@/features/editor/page-geometry'
import { clamp, rulerNudge, useRulerDrag } from '@/features/editor/ruler-drag'
import type { MeasurementUnit } from '@/features/settings/settings-context'
import { cn } from '@/lib/utils'
export const LEFT_RULER_WIDTH = 28
export const LEFT_RULER_GAP = 8
type Handle = { kind: 'marginTop' | 'marginBottom' }

export interface LeftRulerSheet {
	index: number
	top: number
	height: number
	margins: PageMargins
}

/**
 * Lembar yang ditempeli penggaris vertikal.
 *
 * Hanya SATU lembar yang pernah menggambar penggaris - yang sedang ditempati
 * kursor. Dulu setiap lembar menggambar sepasang gagang sendiri, dan itu keliru
 * dua kali: mahal (empat puluh satu salinan blok skala yang isinya identik) dan
 * membohongi, karena margin di sini setelan tingkat dokumen - menyeret gagang
 * di lembar 30 mengubah semua lembar, sementara tampilannya menjanjikan lembar
 * 30 saja.
 *
 * Marginnya dibaca dari lembar itu sendiri, bukan dari setelan tingkat tab:
 * dokumen bersection bisa punya margin berbeda per bagian, dan penggaris yang
 * menempel di satu lembar harus menunjukkan angka lembar ITU.
 */
export function leftRulerSheet(
	sheets: readonly SheetGeometry[],
	page: number,
	geometry: PageGeometry,
): LeftRulerSheet {
	/* Sebelum paginasi selesai belum ada lembar sama sekali - yang ada baru
	 * geometri halamannya, dan halaman pertama satu-satunya yang bisa dituju. */
	if (sheets.length === 0) {
		return { index: 0, top: 0, height: geometry.height, margins: geometry.margins }
	}
	const index = Math.min(Math.max(page, 0), sheets.length - 1)
	const sheet = sheets[index]
	return { index, top: sheet.top, height: sheet.height, margins: sheet.margins }
}

export function DocumentLeftRuler({
	geometry,
	sheets,
	page,
	trackHeight,
	zoom,
	unit,
	onMarginsChange,
}: {
	geometry: PageGeometry
	sheets: readonly SheetGeometry[]
	/** Lembar berkursor, 0-basis. */
	page: number
	/** Tinggi seluruh tumpukan lembar - selokan kirinya tetap dipesan penuh. */
	trackHeight: number
	zoom: number
	unit: MeasurementUnit
	onMarginsChange: (patch: Partial<PageMargins>) => void
}) {
	const trackRef = useRef<HTMLDivElement>(null)
	/*
	 * Selama diseret, marginnya hanya hidup di sini. Dulu tiap `pointermove`
	 * menulis ke Y.Doc, dan tiap tulis memicu paginasi menghitung ulang SELURUH
	 * dokumen - enam puluh kali sedetik, di dokumen berapa pun panjangnya.
	 * Naskahnya kini mengalir sekali, saat jari diangkat; yang bergerak selama
	 * seret adalah arsiran dan gagang di penggaris ini.
	 */
	const [preview, setPreview] = useState<Partial<PageMargins> | null>(null)

	const target = leftRulerSheet(sheets, page, geometry)
	const margins = { ...target.margins, ...preview }
	const { height } = target

	const patchFor = (handle: Handle, y: number): Partial<PageMargins> => {
		const inPage = y - target.top
		if (handle.kind === 'marginTop') {
			return { top: clamp(inPage, 0, height - margins.bottom - MIN_CONTENT_HEIGHT) }
		}
		return { bottom: clamp(height - inPage, 0, height - margins.top - MIN_CONTENT_HEIGHT) }
	}

	const commit = (handle: Handle, y: number) => {
		const patch = patchFor(handle, y)
		setPreview(null)
		onMarginsChange(patch)
	}

	const { dragging, startDrag } = useRulerDrag<Handle>({
		axis: 'y',
		zoom,
		trackRef,
		onMove: (handle, y) => setPreview(patchFor(handle, y)),
		onUp: (handle, y) => {
			if (y === null) setPreview(null)
			else commit(handle, y)
		},
	})

	/* Papan tik tidak punya "lepas jari": nudge langsung dikomit. */
	const nudgeTop = rulerNudge('y', { kind: 'marginTop' }, target.top + margins.top, commit)
	const nudgeBottom = rulerNudge('y', { kind: 'marginBottom' }, target.top + height - margins.bottom, commit)

	return (
		/*
		 * Jalurnya setinggi seluruh tumpukan - itu yang membuat koordinat seret
		 * berada di ruang dokumen - tapi yang TERLIHAT hanya satu blok setinggi
		 * satu lembar. Batang abu-abu sepanjang empat puluh satu lembar yang isinya
		 * kosong bukan penggaris, cuma bekas tempatnya.
		 */
		<div ref={trackRef} className="relative" style={{ width: LEFT_RULER_WIDTH, height: trackHeight * zoom }}>
			<div
				className={cn(
					'document-left-ruler absolute left-0 w-full overflow-hidden',
					dragging && 'document-left-ruler--dragging',
				)}
				style={{ top: target.top * zoom, height: height * zoom }}
				/* Tanpa peran maupun nama: pembungkus ini murni hiasan, dan yang
				   membawa makna adalah dua tombol gagang di dalamnya - masing-masing
				   sudah bernama sendiri. Nama pada div telanjang tidak pernah sampai
				   ke teknologi bantu. */
			>
				{/* Arsiran margin: area di luar batas tulis. */}
				<div className="document-left-ruler__margin" style={{ top: 0, height: margins.top * zoom }} />
				<div
					className="document-left-ruler__margin"
					style={{ top: (height - margins.bottom) * zoom, height: margins.bottom * zoom }}
				/>

				<Ticks height={height} zoom={zoom} unit={unit} />

				<MarginHandle
					label="Margin atas"
					y={margins.top * zoom}
					onPointerDown={startDrag({ kind: 'marginTop' })}
					onKeyDown={nudgeTop}
				/>
				<MarginHandle
					label="Margin bawah"
					y={(height - margins.bottom) * zoom}
					onPointerDown={startDrag({ kind: 'marginBottom' })}
					onKeyDown={nudgeBottom}
				/>
			</div>
		</div>
	)
}

function Ticks({ height, zoom, unit }: { height: number; zoom: number; unit: MeasurementUnit }) {
	const unitPx = unit === 'cm' ? INCH / 2.54 : INCH
	const step = zoom < 0.75 ? unitPx / 2 : unitPx / 4
	const count = Math.floor(height / step)

	return (
		<>
			{Array.from({ length: count + 1 }, (_, index) => {
				const y = index * step
				const isUnit = Math.abs(y % unitPx) < 0.01
				const isHalf = Math.abs(y % (unitPx / 2)) < 0.01

				if (isUnit) {
					if (y === 0) return null
					return (
						<span key={y} className="document-left-ruler__label" style={{ top: y * zoom }}>
							{Math.round(y / unitPx)}
						</span>
					)
				}

				return (
					<span
						key={y}
						className={cn('document-left-ruler__tick', isHalf && 'document-left-ruler__tick--major')}
						style={{ top: y * zoom }}
					/>
				)
			})}
		</>
	)
}

function MarginHandle({
	label,
	y,
	onPointerDown,
	onKeyDown,
}: {
	label: string
	y: number
	onPointerDown: (event: React.PointerEvent) => void
	onKeyDown: (event: React.KeyboardEvent) => void
}) {
	return (
		<button
			type="button"
			aria-label={label}
			title={label}
			className="document-left-ruler__margin-handle"
			style={{ top: y }}
			onPointerDown={onPointerDown}
			onKeyDown={onKeyDown}
		/>
	)
}
