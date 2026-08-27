'use client'
import { type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

export function IconButton({
	icon: Icon,
	label,
	onClick,
	active,
	disabled,
}: {
	icon: LucideIcon
	label: string
	onClick: () => void
	active?: boolean
	disabled?: boolean
}) {
	return (
		<button
			type="button"
			title={label}
			aria-label={label}
			aria-pressed={active}
			disabled={disabled}
			onClick={onClick}
			className={cn(
				'flex h-7 w-7 items-center justify-center rounded-md transition-colors',
				active
					? 'bg-accent/15 text-accent'
					: 'text-muted hover:bg-[var(--overlay-hover)] hover:text-foreground',
				disabled && 'cursor-not-allowed opacity-40',
			)}
		>
			<Icon className="h-4 w-4" />
		</button>
	)
}

export function Divider() {
	return <div className="mx-1 h-5 w-px shrink-0 bg-line-strong" />
}
