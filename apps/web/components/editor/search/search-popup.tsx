'use client'

import { ChevronDown, ChevronUp, MoreVertical, X } from 'lucide-react'
import { useEffect, useRef } from 'react'
import type { SearchControls } from '@/features/editor/use-search-controls'
import { cn } from '@/lib/utils'

/**
 * Bilah ringkas yang melayang di pojok kanan atas naskah. Isinya cuma yang
 * dipakai sembilan dari sepuluh kali: kata kunci, jumlah hasil, dan lompat
 * antar hasil. Ia memang menutupi sedikit naskah - itu harga alur cepat, dan
 * tombol tiga titiknya adalah jalan keluarnya: pindah ke panel rail, yang tidak
 * menimpa apa pun.
 */
export function SearchPopup({
	controls,
	focusTick,
	onOpenPanel,
	onClose,
}: {
	controls: SearchControls
	focusTick: number
	onOpenPanel: () => void
	onClose: () => void
}) {
	const inputRef = useRef<HTMLInputElement>(null)

	// biome-ignore lint/correctness/useExhaustiveDependencies: focusTick memang cuma pemicu - naiknya angka itulah sinyal "fokuskan lagi"
	useEffect(
		function focusOnOpen() {
			inputRef.current?.focus()
			inputRef.current?.select()
		},
		[focusTick],
	)

	const { search, setSearch, results, activeIndex, invalidRegex, goNext, goPrevious } = controls
	const total = results.length

	return (
		<search className="flex items-center gap-1 rounded-2xl border border-line-strong bg-surface-raised px-3 py-2.5 shadow-[var(--menu-shadow)]">
			<div className="relative">
				<label
					htmlFor="find-in-document"
					className={cn(
						'-top-2 pointer-events-none absolute left-2.5 rounded bg-surface-raised px-1 font-medium text-[11px]',
						invalidRegex ? 'text-red-500' : 'text-accent',
					)}
				>
					Cari di dokumen
				</label>
				<input
					id="find-in-document"
					ref={inputRef}
					type="text"
					value={search}
					onChange={(event) => setSearch(event.target.value)}
					onKeyDown={(event) => {
						if (event.key === 'Enter') {
							event.preventDefault()
							if (event.shiftKey) goPrevious()
							else goNext()
						}
					}}
					aria-invalid={invalidRegex}
					aria-describedby={invalidRegex ? 'find-in-document-error' : undefined}
					className={cn(
						'w-56 rounded-md border-2 bg-transparent py-1.5 pr-14 pl-2.5 text-foreground text-sm outline-none',
						invalidRegex ? 'border-red-500' : 'border-accent',
					)}
				/>
				<span
					className={cn(
						'-translate-y-1/2 pointer-events-none absolute top-1/2 right-2.5 text-xs tabular-nums',
						total === 0 && search ? 'text-subtle' : 'text-muted',
					)}
				>
					{search ? `${activeIndex + 1}/${total}` : ''}
				</span>
			</div>

			{invalidRegex && (
				<span id="find-in-document-error" className="max-w-32 text-[11px] text-red-500 leading-tight">
					Pola regex tidak sah
				</span>
			)}

			<button
				type="button"
				title="Sebelumnya (Shift+Enter)"
				aria-label="Hasil sebelumnya"
				disabled={total === 0}
				onClick={goPrevious}
				className="flex h-8 w-8 items-center justify-center rounded-full text-muted transition-colors hover:bg-[var(--overlay-hover)] hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
			>
				<ChevronUp className="h-[18px] w-[18px]" />
			</button>
			<button
				type="button"
				title="Berikutnya (Enter)"
				aria-label="Hasil berikutnya"
				disabled={total === 0}
				onClick={goNext}
				className="flex h-8 w-8 items-center justify-center rounded-full text-muted transition-colors hover:bg-[var(--overlay-hover)] hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
			>
				<ChevronDown className="h-[18px] w-[18px]" />
			</button>
			<button
				type="button"
				title="Buka di panel - ganti, opsi lanjutan, dan daftar hasil"
				aria-label="Buka di panel - ganti, opsi lanjutan, dan daftar hasil"
				onClick={onOpenPanel}
				className="flex h-8 w-8 items-center justify-center rounded-full text-muted transition-colors hover:bg-[var(--overlay-hover)] hover:text-foreground"
			>
				<MoreVertical className="h-[18px] w-[18px]" />
			</button>
			<button
				type="button"
				title="Tutup (Esc)"
				aria-label="Tutup pencarian"
				onClick={onClose}
				className="flex h-8 w-8 items-center justify-center rounded-full text-muted transition-colors hover:bg-[var(--overlay-hover)] hover:text-foreground"
			>
				<X className="h-[18px] w-[18px]" />
			</button>
		</search>
	)
}
