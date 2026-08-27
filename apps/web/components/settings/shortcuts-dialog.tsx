'use client'

import { useEffect, useMemo, useRef } from 'react'
import { useSettings } from '@/features/settings/settings-context'
import {
	CATEGORY_ORDER,
	formatKeys,
	SHORTCUTS,
	type Shortcut,
	type ShortcutCategory,
} from '@/features/shortcuts/registry'
import { useIsMac } from '@/features/shortcuts/use-shortcuts'

export function ShortcutsDialog() {
	const { shortcutsOpen, setShortcutsOpen } = useSettings()
	const mac = useIsMac()
	const overlayRef = useRef<HTMLDivElement>(null)

	const grouped = useMemo(() => {
		const map = new Map<ShortcutCategory, Shortcut[]>()
		for (const item of SHORTCUTS) {
			const list = map.get(item.category)
			if (list) list.push(item)
			else map.set(item.category, [item])
		}
		return CATEGORY_ORDER.map((category) => ({
			category,
			items: map.get(category) ?? [],
		})).filter((group) => group.items.length > 0)
	}, [])

	useEffect(() => {
		if (!shortcutsOpen) return

		document.body.style.overflow = 'hidden'
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === 'Escape') setShortcutsOpen(false)
		}
		window.addEventListener('keydown', onKeyDown)

		return () => {
			document.body.style.overflow = ''
			window.removeEventListener('keydown', onKeyDown)
		}
	}, [shortcutsOpen, setShortcutsOpen])

	if (!shortcutsOpen) return null

	return (
		<div
			ref={overlayRef}
			role="dialog"
			aria-modal="true"
			aria-label="Pintasan papan tik"
			className="fixed inset-0 z-[70] flex animate-in items-center justify-center bg-black/60 backdrop-blur-sm fade-in duration-200"
			onClick={(event) => {
				if (event.target === overlayRef.current) setShortcutsOpen(false)
			}}
		>
			<div className="flex max-h-[85vh] w-full max-w-2xl animate-in flex-col overflow-hidden rounded-2xl border border-line-strong bg-surface-raised shadow-2xl zoom-in-95 duration-200">
				<div className="flex shrink-0 items-center justify-between border-b border-line px-5 py-4">
					<h2 className="text-base font-semibold text-foreground">Pintasan papan tik</h2>
					<button
						type="button"
						onClick={() => setShortcutsOpen(false)}
						aria-label="Tutup"
						className="rounded-md p-1 text-subtle transition-colors hover:bg-[var(--overlay-hover)] hover:text-foreground"
					>
						×
					</button>
				</div>

				{/* Dua kolom supaya seluruh daftar terbaca tanpa banyak menggulung. */}
				<div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
					<div className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
						{grouped.map(({ category, items }) => (
							<section key={category} className="break-inside-avoid">
								<h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-faint">
									{category}
								</h3>
								<ul className="flex flex-col">
									{items.map((item) => (
										<li
											key={item.id}
											className="flex items-center justify-between gap-4 border-b border-line py-1.5 last:border-b-0"
										>
											<span className="min-w-0 truncate text-[13px] text-foreground">{item.label}</span>
											<kbd className="shrink-0 rounded-md bg-[var(--overlay-hover)] px-2 py-0.5 font-sans text-[11px] font-medium text-muted">
												{formatKeys(item.keys, mac)}
											</kbd>
										</li>
									))}
								</ul>
							</section>
						))}
					</div>
				</div>
			</div>
		</div>
	)
}
