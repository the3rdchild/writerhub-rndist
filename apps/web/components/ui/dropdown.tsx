'use client'

import { ChevronRight } from 'lucide-react'
import {
	createContext,
	type Dispatch,
	type ReactNode,
	type SetStateAction,
	useCallback,
	useContext,
	useEffect,
	useId,
	useMemo,
	useRef,
	useState,
} from 'react'
import { cn } from '@/lib/utils'

interface DropdownProps {
	trigger: (props: { open: boolean; toggle: () => void; id: string }) => ReactNode
	children: (props: { close: () => void }) => ReactNode
	align?: 'start' | 'end'
	side?: 'bottom' | 'top'
	className?: string
	menuClassName?: string
}

export function Dropdown({
	trigger,
	children,
	align = 'start',
	side = 'bottom',
	className,
	menuClassName,
}: DropdownProps) {
	const [open, setOpen] = useState(false)
	const containerRef = useRef<HTMLDivElement>(null)
	const id = useId()

	const close = useCallback(() => setOpen(false), [])
	const toggle = useCallback(() => setOpen((current) => !current), [])

	useEffect(() => {
		if (!open) return

		const onPointerDown = (event: PointerEvent) => {
			if (!containerRef.current?.contains(event.target as Node)) close()
		}
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === 'Escape') close()
		}

		document.addEventListener('pointerdown', onPointerDown)
		document.addEventListener('keydown', onKeyDown)
		return () => {
			document.removeEventListener('pointerdown', onPointerDown)
			document.removeEventListener('keydown', onKeyDown)
		}
	}, [open, close])

	return (
		<div ref={containerRef} className={cn('relative', className)}>
			{trigger({ open, toggle, id })}
			{open && (
				<div
					id={id}
					role="menu"
					className={cn(
						'absolute z-50 min-w-[200px] rounded-xl border border-line-strong bg-surface-raised py-1 shadow-[var(--menu-shadow)]',
						'[&>*:first-child]:rounded-t-[10px] [&>*:last-child]:rounded-b-[10px]',
						'animate-in fade-in zoom-in-95 duration-100',
						side === 'bottom' ? 'top-full mt-1' : 'bottom-full mb-1',
						align === 'start' ? 'left-0' : 'right-0',
						menuClassName,
					)}
				>
					<SubmenuGroup>{children({ close })}</SubmenuGroup>
				</div>
			)}
		</div>
	)
}

const SubmenuGroupContext = createContext<{
	openId: string | null
	setOpenId: Dispatch<SetStateAction<string | null>>
} | null>(null)

function SubmenuGroup({ children }: { children: ReactNode }) {
	const [openId, setOpenId] = useState<string | null>(null)
	const value = useMemo(() => ({ openId, setOpenId }), [openId])
	return <SubmenuGroupContext.Provider value={value}>{children}</SubmenuGroupContext.Provider>
}

interface DropdownItemProps {
	onSelect?: () => void
	icon?: ReactNode
	shortcut?: string
	trailing?: ReactNode
	active?: boolean
	disabled?: boolean
	children: ReactNode
}

export function DropdownItem({
	onSelect,
	icon,
	shortcut,
	trailing,
	active,
	disabled,
	children,
}: DropdownItemProps) {
	const group = useContext(SubmenuGroupContext)

	return (
		<button
			type="button"
			role="menuitem"
			disabled={disabled}
			onClick={onSelect}
			onMouseEnter={() => group?.setOpenId(null)}
			className={cn(
				'flex w-full items-center gap-3 px-3 py-1.5 text-left text-sm transition-colors',
				disabled ? 'cursor-not-allowed text-faint' : 'text-foreground hover:bg-[var(--overlay-hover)]',
				active && !disabled && 'text-accent',
			)}
		>
			<span className="flex h-4 w-4 shrink-0 items-center justify-center text-subtle">{icon}</span>
			<span className="flex-1 truncate">{children}</span>
			{shortcut && <span className="shrink-0 text-xs text-faint">{shortcut}</span>}
			{trailing && <span className="flex shrink-0 items-center">{trailing}</span>}
		</button>
	)
}

export function DropdownSeparator() {
	return <div role="separator" className="my-1 h-px bg-line" />
}

export function DropdownLabel({ children }: { children: ReactNode }) {
	return (
		<div className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-faint">
			{children}
		</div>
	)
}

export function Submenu({
	label,
	icon,
	children,
}: {
	label: string
	icon?: ReactNode
	children: (props: { close: () => void }) => ReactNode
}) {
	const id = useId()
	const group = useContext(SubmenuGroupContext)
	const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

	const open = group?.openId === id

	const cancelClose = () => {
		if (closeTimer.current) {
			clearTimeout(closeTimer.current)
			closeTimer.current = null
		}
	}
	useEffect(() => cancelClose, [])

	const openNow = () => {
		cancelClose()
		group?.setOpenId(id)
	}

	const closeNow = () => {
		cancelClose()
		group?.setOpenId((current) => (current === id ? null : current))
	}
	const scheduleClose = () => {
		cancelClose()
		closeTimer.current = setTimeout(closeNow, 120)
	}

	return (
		<div className="relative" onMouseEnter={openNow} onMouseLeave={scheduleClose}>
			<button
				type="button"
				role="menuitem"
				aria-haspopup="menu"
				aria-expanded={open}
				onClick={() => (open ? closeNow() : openNow())}
				onKeyDown={(event) => {
					if (event.key === 'ArrowRight') {
						event.preventDefault()
						openNow()
					} else if (event.key === 'ArrowLeft') {
						event.preventDefault()
						closeNow()
					}
				}}
				className="flex w-full items-center gap-3 px-3 py-1.5 text-left text-sm text-foreground transition-colors hover:bg-[var(--overlay-hover)]"
			>
				<span className="flex h-4 w-4 shrink-0 items-center justify-center text-subtle">{icon}</span>
				<span className="flex-1 truncate">{label}</span>
				<ChevronRight className="h-3.5 w-3.5 shrink-0 text-faint" />
			</button>
			{open && (
				<div
					role="menu"
					className="absolute left-full top-0 z-50 ml-1 min-w-[200px] rounded-xl border border-line-strong bg-surface-raised py-1 shadow-[var(--menu-shadow)] [&>*:first-child]:rounded-t-[10px] [&>*:last-child]:rounded-b-[10px]"
				>
					{/* Tingkat ini punya kelompoknya sendiri, jadi submenu bersarang di
					    dalamnya juga saling menutup secara instan. */}
					<SubmenuGroup>{children({ close: closeNow })}</SubmenuGroup>
				</div>
			)}
		</div>
	)
}
