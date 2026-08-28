'use client'

import type { CSSProperties } from 'react'
import type { PageMargins } from '@/features/editor/page-geometry'
import { furnitureLineFor, PAGE_TOKEN, type PageFurniture } from './model'

/**
 * Teks header/footer di dalam satu lembar halaman. Dirender absolut di area
 * margin — tidak memengaruhi tata letak naskah sama sekali.
 */

function textOf(text: string, pageIndex: number): string {
	return text.split(PAGE_TOKEN).join(String(pageIndex + 1))
}

function positionOf(
	align: 'left' | 'center' | 'right',
	margins: PageMargins,
	edge: 'top' | 'bottom',
): CSSProperties {
	const vertical =
		edge === 'top' ? { top: Math.max(8, margins.top / 3) } : { bottom: Math.max(8, margins.bottom / 3) }
	const horizontal =
		align === 'center'
			? { left: margins.left, right: margins.right, textAlign: 'center' as const }
			: align === 'right'
				? { right: margins.right }
				: { left: margins.left }
	return { ...vertical, ...horizontal }
}

export function SheetFurniture({
	furniture,
	pageIndex,
	margins,
}: {
	furniture: PageFurniture | null
	pageIndex: number
	margins: PageMargins
}) {
	const header = furnitureLineFor(furniture, 'header', pageIndex)
	const footer = furnitureLineFor(furniture, 'footer', pageIndex)
	if (!header && !footer) return null

	return (
		<>
			{header && (
				<span
					className="pointer-events-none absolute text-[10px] leading-4 text-faint"
					style={positionOf(header.align, margins, 'top')}
				>
					{textOf(header.text, pageIndex)}
				</span>
			)}
			{footer && (
				<span
					className="pointer-events-none absolute text-[10px] leading-4 text-faint"
					style={positionOf(footer.align, margins, 'bottom')}
				>
					{textOf(footer.text, pageIndex)}
				</span>
			)}
		</>
	)
}
