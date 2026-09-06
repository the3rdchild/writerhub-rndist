'use client'

import { useRef, useState } from 'react'

/**
 * Indikator "Page x of y" yang angka halamannya sekaligus input: ketik nomor
 * lalu Enter (atau lepas fokus) untuk melompat ke lembar itu — instan, tanpa
 * animasi gulungan. Esc membatalkan.
 *
 * Angka tampilan mengikuti `page` selagi tidak sedang disunting, jadi sumber
 * kebenarannya tetap milik pemanggil (kursor di editor, lembar terlihat di
 * tampilan baca-saja).
 */
export function PageIndicator({
	page,
	pageCount,
	onJump,
}: {
	page: number
	pageCount: number
	onJump: (page: number) => void
}) {
	const [draft, setDraft] = useState<string | null>(null)
	const inputRef = useRef<HTMLInputElement>(null)

	const commit = () => {
		if (draft === null) return
		setDraft(null)
		const target = Number.parseInt(draft, 10)
		if (Number.isFinite(target) && target >= 1) onJump(Math.min(target, pageCount))
	}

	return (
		<span className="flex items-center gap-1 text-xs text-subtle">
			Page
			<input
				ref={inputRef}
				type="text"
				inputMode="numeric"
				value={draft ?? String(page)}
				onChange={(event) => setDraft(event.target.value.replace(/\D/g, '').slice(0, 3))}
				onFocus={(event) => event.currentTarget.select()}
				onBlur={commit}
				onKeyDown={(event) => {
					if (event.key === 'Enter') {
						commit()
						inputRef.current?.blur()
					} else if (event.key === 'Escape') {
						setDraft(null)
						inputRef.current?.blur()
					}
				}}
				aria-label="Nomor halaman tujuan"
				title="Ketik nomor halaman lalu Enter untuk melompat"
				className="h-5 w-8 rounded border border-transparent bg-transparent px-0.5 text-center text-xs leading-none text-subtle tabular-nums outline-none transition-colors hover:border-line focus:border-accent focus:text-foreground"
			/>
			of {pageCount}
		</span>
	)
}
