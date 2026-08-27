'use client'
import { type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

export function ToggleIcon({
	icon: Icon,
	label,
	hint,
	active,
	onClick,
}: {
	icon: LucideIcon
	label: string
	hint: string
	active: boolean
	onClick: () => void
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			title={`${label} - ${hint}`}
			aria-label={label}
			aria-pressed={active}
			className={cn(
				'shrink-0 rounded-full p-1.5 transition-colors',
				active
					? 'bg-accent/15 text-accent'
					: 'text-subtle hover:bg-[var(--overlay-hover)] hover:text-foreground',
			)}
		>
			<Icon className="h-3.5 w-3.5" />
		</button>
	)
}
