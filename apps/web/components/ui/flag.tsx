'use client'

import * as FlagIcons from 'country-flag-icons/react/3x2'
import type { SVGProps } from 'react'
import { cn } from '@/lib/utils'
const FLAGS = FlagIcons as unknown as Record<string, React.ComponentType<SVGProps<SVGSVGElement>>>

export interface FlagProps {
	code: string
	className?: string
}

export function Flag({ code, className }: FlagProps) {
	const FlagSvg = FLAGS[code.toUpperCase()]
	if (!FlagSvg) return null
	return <FlagSvg aria-hidden focusable={false} className={cn('inline-block h-3 w-[1.125rem]', className)} />
}
