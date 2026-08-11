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
					<SubmenuGroup>{children({ close })}</SubmenuGroup>
				</div>
			)}
		</div>
	)
}

/**
 * Satu tingkat menu berbagi "siapa yang sedang terbuka".
 *
 * Tanpa ini tiap `Submenu` hanya tahu dirinya sendiri: berpindah dari submenu A
 * ke B membuat A menjadwalkan tutup (jeda 120 ms untuk menyeberangi celah menuju
 * panelnya) sementara B langsung terbuka, jadi keduanya sempat tampil bertumpuk.
 * Dengan satu `openId` bersama, membuka B menutup A pada render yang sama.
 */
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
	const group = useContext(SubmenuGroupContext)

	return (
		<button
			type="button"
			role="menuitem"
			disabled={disabled}
			onClick={onSelect}
			// Menyentuh butir biasa menutup submenu yang sedang terbuka di tingkat
			// ini - kalau tidak, panelnya menggantung di samping menu yang sudah
			// tidak lagi disorot.
			onMouseEnter={() => group?.setOpenId(null)}
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

	// Tutup saat parent menu ditutup: item ini ikut unmount, state reset otomatis.
	// Timernya tetap perlu dibatalkan supaya tidak menyentuh state pasca-unmount.
	useEffect(() => cancelClose, [])

	const openNow = () => {
		cancelClose()
		group?.setOpenId(id)
	}

	const closeNow = () => {
		cancelClose()
		group?.setOpenId((current) => (current === id ? null : current))
	}

	// Jeda hanya untuk menyeberangi celah 4 px antara butir dan panelnya. Saat
	// waktunya habis, yang ditutup hanya kalau submenu ini masih yang terbuka -
	// kalau pointer sudah pindah ke saudaranya, jangan tutup milik orang lain.
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
				// Seperti panel induk: tanpa `overflow-hidden`, supaya submenu bisa
				// bersarang lagi ke dalam (mis. Jenis huruf → Sans-serif → Arial).
				// Daftar panjang dipecah jadi kelompok, bukan digulung - menu yang
				// perlu digulung tandanya kelompoknya kurang.
				//
				// Tanpa animasi masuk, sengaja: berpindah antar submenu adalah
				// mengarahkan pandangan, bukan memunculkan sesuatu yang baru, dan
				// fade 100 ms di tiap perpindahan terbaca sebagai jeda.
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
