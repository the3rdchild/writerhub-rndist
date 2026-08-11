'use client'

import { ChevronRight } from 'lucide-react'
import { type ReactNode, useCallback, useEffect, useId, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

/**
 * Popup ringan untuk menu bar dan pemilih di toolbar.
 *
 * Ditulis sendiri, bukan memakai pustaka menu, karena kebutuhannya sempit -
 * satu lapis, ditutup lewat klik di luar atau Escape - dan supaya tidak ada
 * dependensi baru hanya demi ini.
 */

interface DropdownProps {
	/** Diberi `open` supaya pemicu bisa menandai keadaannya sendiri. */
	trigger: (props: { open: boolean; toggle: () => void; id: string }) => ReactNode
	children: (props: { close: () => void }) => ReactNode
	align?: 'start' | 'end'
	/** Ditempel di atas pemicu, dipakai toolbar yang berada di dekat dasar layar. */
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
						// Sengaja TIDAK `overflow-hidden`: submenu bersarang duduk di
						// `left-full`, di luar kotak panel ini, dan akan terpotong habis.
						// Sudut membulatnya dijaga dengan membulatkan baris pertama &
						// terakhir, bukan dengan memangkas isi.
						'absolute z-50 min-w-[200px] rounded-xl border border-line-strong bg-surface-raised py-1 shadow-[var(--menu-shadow)]',
						'[&>*:first-child]:rounded-t-[10px] [&>*:last-child]:rounded-b-[10px]',
						'animate-in fade-in zoom-in-95 duration-100',
						side === 'bottom' ? 'top-full mt-1' : 'bottom-full mb-1',
						align === 'start' ? 'left-0' : 'right-0',
						menuClassName,
					)}
				>
					{children({ close })}
				</div>
			)}
		</div>
	)
}

interface DropdownItemProps {
	onSelect?: () => void
	icon?: ReactNode
	/** Pintasan papan tik; hanya ditampilkan, tidak didaftarkan di sini. */
	shortcut?: string
	/**
	 * Elemen di ujung kanan baris - mis. panah bentang atau lencana hitungan.
	 * Dipakai bersama `shortcut` pun tidak masalah; keduanya duduk berdampingan.
	 */
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
	return (
		<button
			type="button"
			role="menuitem"
			disabled={disabled}
			onClick={onSelect}
			className={cn(
				'flex w-full items-center gap-3 px-3 py-1.5 text-left text-sm transition-colors',
				disabled
					? 'cursor-not-allowed text-faint'
					: 'text-foreground hover:bg-[var(--overlay-hover)]',
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

/**
 * Item menu yang membuka submenu bersarang ke samping (kanan).
 *
 * Submenu terbuka saat hover (dengan jeda tutup), klik, atau panah kanan;
 * tertutup saat pointer keluar, panah kiri, atau saat menu induknya ditutup.
 * Dipakai untuk mengelompokkan item padat (mis. menu Format → Teks/Warna/...)
 * tanpa memanjangkan menu utama.
 *
 * Tidak memakai hover murni: hover saja membuat submenu "menempel" ketika
 * pointer melintas cepat, dan tidak bisa dipakai lewat keyboard. Kombinasi
 * hover-dengan-jeda + klik + tombol panah memberi keduanya.
 *
 * Panel induk tidak boleh `overflow-hidden` - submenu ini duduk di luar
 * kotaknya dan akan terpotong habis.
 */
export function Submenu({
	label,
	icon,
	children,
}: {
	label: string
	icon?: ReactNode
	/** Item submenu; `close` menutup submenu ini (bukan seluruh rantai menu). */
	children: (props: { close: () => void }) => ReactNode
}) {
	const [open, setOpen] = useState(false)
	const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

	const cancelClose = () => {
		if (closeTimer.current) {
			clearTimeout(closeTimer.current)
			closeTimer.current = null
		}
	}

	// Tutup saat parent menu ditutup: item ini ikut unmount, state reset otomatis.
	// Timernya tetap perlu dibatalkan supaya tidak menyentuh state pasca-unmount.
	useEffect(() => cancelClose, [])

	return (
		<div
			className="relative"
			onMouseEnter={() => {
				cancelClose()
				setOpen(true)
			}}
			onMouseLeave={() => {
				cancelClose()
				closeTimer.current = setTimeout(() => setOpen(false), 120)
			}}
		>
			<button
				type="button"
				role="menuitem"
				aria-haspopup="menu"
				aria-expanded={open}
				onClick={() => setOpen((v) => !v)}
				onKeyDown={(event) => {
					if (event.key === 'ArrowRight') {
						event.preventDefault()
						setOpen(true)
					} else if (event.key === 'ArrowLeft') {
						event.preventDefault()
						setOpen(false)
					}
				}}
				className="flex w-full items-center gap-3 px-3 py-1.5 text-left text-sm text-foreground transition-colors hover:bg-[var(--overlay-hover)]"
			>
				<span className="flex h-4 w-4 shrink-0 items-center justify-center text-subtle">{icon}</span>
				<span className="flex-1 truncate">{label}</span>
				<ChevronRight className="h-3.5 w-3.5 shrink-0 text-faint" />
			</button>
			{open && (
				// Seperti panel induk: tanpa `overflow-hidden`, supaya submenu bisa
				// bersarang lagi ke dalam (mis. Jenis huruf → Sans-serif → Arial).
				// Daftar panjang dipecah jadi kelompok, bukan digulung - menu yang
				// perlu digulung tandanya kelompoknya kurang.
				<div
					role="menu"
					className="absolute left-full top-0 z-50 ml-1 min-w-[200px] rounded-xl border border-line-strong bg-surface-raised py-1 shadow-[var(--menu-shadow)] animate-in fade-in zoom-in-95 duration-100 [&>*:first-child]:rounded-t-[10px] [&>*:last-child]:rounded-b-[10px]"
				>
					{children({ close: () => setOpen(false) })}
				</div>
			)}
		</div>
	)
}
