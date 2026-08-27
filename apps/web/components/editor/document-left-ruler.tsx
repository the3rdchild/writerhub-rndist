'use client'

import { useRef } from 'react'
import {
	INCH,
	MIN_CONTENT_HEIGHT,
	type PageGeometry,
	type PageMargins,
} from '@/features/editor/page-geometry'
import { clamp, rulerNudge, useRulerDrag } from '@/features/editor/ruler-drag'
import type { MeasurementUnit } from '@/features/settings/settings-context'
import { cn } from '@/lib/utils'
export const LEFT_RULER_WIDTH = 28
export const LEFT_RULER_GAP = 8
type Handle = { kind: 'marginTop' | 'marginBottom'; page: number }

export function DocumentLeftRuler({
	geometry,
	zoom,
	pageCount,
	unit,
	onMarginsChange,
}: {
	geometry: PageGeometry
	zoom: number
	pageCount: number
	unit: MeasurementUnit
	onMarginsChange: (patch: Partial<PageMargins>) => void
}) {
	const { height, margins, gap, pageStride } = geometry
	const trackRef = useRef<HTMLDivElement>(null)
	const applyHandle = (handle: Handle, y: number) => {
		const inPage = y - handle.page * pageStride
		if (handle.kind === 'marginTop') {
			onMarginsChange({ top: clamp(inPage, 0, height - margins.bottom - MIN_CONTENT_HEIGHT) })
		} else {
			onMarginsChange({ bottom: clamp(height - inPage, 0, height - margins.top - MIN_CONTENT_HEIGHT) })
		}
	}
	const { dragging, startDrag } = useRulerDrag<Handle>({
		axis: 'y',
		zoom,
		trackRef,
		onMove: applyHandle,
		onUp: () => {},
	})
	const nudgeTop = rulerNudge('y', { kind: 'marginTop', page: 0 }, margins.top, applyHandle)
	const nudgeBottom = rulerNudge('y', { kind: 'marginBottom', page: 0 }, height - margins.bottom, applyHandle)

	const totalHeight = pageCount * height + (pageCount - 1) * gap

	return (
		<div
			className={cn('document-left-ruler', dragging && 'document-left-ruler--dragging')}
			style={{ width: LEFT_RULER_WIDTH, height: totalHeight * zoom }}
			aria-label="Penggaris vertikal"
		>
			<div ref={trackRef} className="relative h-full">
				{Array.from({ length: pageCount }, (_, page) => (
					<div
						key={page}
						className="absolute left-0 w-full overflow-hidden"
						style={{ top: page * pageStride * zoom, height: height * zoom }}
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
							onPointerDown={startDrag({ kind: 'marginTop', page })}
							onKeyDown={nudgeTop}
						/>
						<MarginHandle
							label="Margin bawah"
							y={(height - margins.bottom) * zoom}
							onPointerDown={startDrag({ kind: 'marginBottom', page })}
							onKeyDown={nudgeBottom}
						/>
					</div>
				))}
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
