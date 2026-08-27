'use client'

import { cn } from '@/lib/utils'

const RADIUS = 16
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

export function qualityColor(value: number): string {
	if (value >= 75) return '#22c55e'
	if (value >= 60) return '#eab308'
	return '#ef4444'
}

export function riskColor(value: number): string {
	if (value < 30) return '#22c55e'
	if (value <= 70) return '#eab308'
	return '#ef4444'
}

interface ScoreRingProps {
	value: number
	color?: string
	label?: string
	size?: number
	strokeWidth?: number
	suffix?: string
	className?: string
}

export function ScoreRing({
	value,
	color,
	label,
	size = 40,
	strokeWidth = 3,
	suffix = '',
	className,
}: ScoreRingProps) {
	const stroke = color ?? qualityColor(value)
	const filled = (Math.max(0, Math.min(100, value)) / 100) * CIRCUMFERENCE

	return (
		<div className={cn('flex flex-col items-center gap-1', className)}>
			<div className="relative" style={{ width: size, height: size }}>
				<svg className="h-full w-full -rotate-90" viewBox="0 0 40 40" aria-hidden="true">
					<circle
						cx="20"
						cy="20"
						r={RADIUS}
						fill="none"
						stroke="var(--border-strong)"
						strokeWidth={strokeWidth}
					/>
					<circle
						cx="20"
						cy="20"
						r={RADIUS}
						fill="none"
						stroke={stroke}
						strokeWidth={strokeWidth}
						strokeDasharray={`${filled} ${CIRCUMFERENCE}`}
						strokeLinecap="round"
						className="transition-all duration-500"
					/>
				</svg>
				<span
					className="absolute inset-0 flex items-center justify-center font-semibold text-foreground"
					style={{ fontSize: Math.max(10, size * 0.28) }}
				>
					{value}
					{suffix}
				</span>
			</div>
			{label && <span className="text-[11px] capitalize text-subtle">{label}</span>}
		</div>
	)
}
