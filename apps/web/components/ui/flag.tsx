'use client'

import * as FlagIcons from 'country-flag-icons/react/3x2'
import type { SVGProps } from 'react'
import { cn } from '@/lib/utils'

/**
 * Bendera pendamping label bahasa (§P1).
 *
 * Bendera adalah aksesori, bukan pengganti label: nama bahasa tetap ditulis,
 * dan bendera punya `aria-hidden` supaya pembaca layar tidak membacanya. Pakai
 * SVG dari `country-flag-icons` (bukan emoji) supaya tampil sama di Chrome,
 * Edge, dan Safari - termasuk Windows yang tidak merender emoji bendera.
 *
 * Kode yang tidak dikenal (mis. bahasa tanpa negara jelas) tidak menggambar
 * apa-apa; pemanggil tetap menampilkan label teksnya.
 */
const FLAGS = FlagIcons as unknown as Record<string, React.ComponentType<SVGProps<SVGSVGElement>>>

export interface FlagProps {
	/** Kode negara ISO 3166 (huruf kecil atau kapital, mis. "id"/"US"). */
	code: string
	className?: string
}

export function Flag({ code, className }: FlagProps) {
	const FlagSvg = FLAGS[code.toUpperCase()]
	if (!FlagSvg) return null
	return <FlagSvg aria-hidden focusable={false} className={cn('inline-block h-3 w-[1.125rem]', className)} />
}
