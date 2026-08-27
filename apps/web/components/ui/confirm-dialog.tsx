'use client'

import { TriangleAlert } from 'lucide-react'
import { type ReactNode, useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'

export function ConfirmDialog({
	open,
	title,
	description,
	confirmLabel,
	cancelLabel = 'Batal',
	danger,
	onConfirm,
	onCancel,
}: {
	open: boolean
	title: string
	description: ReactNode
	confirmLabel: string
	cancelLabel?: string
	danger?: boolean
	onConfirm: () => void
	onCancel: () => void
}) {
	const overlayRef = useRef<HTMLDivElement>(null)
	const cancelRef = useRef<HTMLButtonElement>(null)

	useEffect(() => {
		if (!open) return

		cancelRef.current?.focus()
		document.body.style.overflow = 'hidden'
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === 'Escape') onCancel()
		}
		window.addEventListener('keydown', onKeyDown)

		return () => {
			document.body.style.overflow = ''
			window.removeEventListener('keydown', onKeyDown)
		}
	}, [open, onCancel])

	if (!open) return null

	return (
		<div
			ref={overlayRef}
			role="dialog"
			aria-modal="true"
			aria-label={title}
			className="fixed inset-0 z-[70] flex animate-in items-center justify-center bg-black/60 backdrop-blur-sm fade-in duration-200"
			onClick={(event) => {
				if (event.target === overlayRef.current) onCancel()
			}}
		>
			<div className="flex w-full max-w-sm animate-in flex-col gap-4 rounded-2xl border border-line-strong bg-surface-raised p-5 shadow-2xl zoom-in-95 duration-200">
				<div className="flex items-center gap-2">
					<TriangleAlert className={cn('h-5 w-5', danger ? 'text-red-400' : 'text-accent')} />
					<h2 className="text-base font-semibold text-foreground">{title}</h2>
				</div>

				<div className="text-sm leading-relaxed text-muted">{description}</div>

				<div className="flex justify-end gap-2">
					<button
						ref={cancelRef}
						type="button"
						onClick={onCancel}
						className="rounded-xl px-4 py-2 text-sm text-muted transition-colors hover:bg-[var(--overlay-hover)] hover:text-foreground"
					>
						{cancelLabel}
					</button>
					<button
						type="button"
						onClick={onConfirm}
						className={cn(
							'rounded-xl px-4 py-2 text-sm font-medium transition-colors',
							danger
								? 'bg-red-500 text-white hover:bg-red-600'
								: 'bg-accent text-accent-foreground hover:bg-accent-hover',
						)}
					>
						{confirmLabel}
					</button>
				</div>
			</div>
		</div>
	)
}
