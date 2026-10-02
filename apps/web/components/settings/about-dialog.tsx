'use client'

import { Keyboard, X } from 'lucide-react'
import Image from 'next/image'
import { useEffect, useRef } from 'react'
import { useSettings } from '@/features/settings/settings-context'

const VERSION = process.env.NEXT_PUBLIC_APP_VERSION

/**
 * Bantuan › Tentang WritingHub. Dulu item menu itu membuka dialog Pengaturan
 * tab Profil, tanpa satu pun keterangan tentang aplikasinya (uji editor 2 Okt,
 * SHL-13).
 */
export function AboutDialog() {
	const { aboutOpen, setAboutOpen, setShortcutsOpen } = useSettings()
	const overlayRef = useRef<HTMLDivElement>(null)

	useEffect(
		function lockScrollAndCloseOnEscape() {
			if (!aboutOpen) return

			document.body.style.overflow = 'hidden'
			const onKeyDown = (event: KeyboardEvent) => {
				if (event.key === 'Escape') setAboutOpen(false)
			}
			window.addEventListener('keydown', onKeyDown)

			return () => {
				document.body.style.overflow = ''
				window.removeEventListener('keydown', onKeyDown)
			}
		},
		[aboutOpen, setAboutOpen],
	)

	if (!aboutOpen) return null

	return (
		// biome-ignore lint/a11y/useKeyWithClickEvents: klik latar hanya pelengkap; Escape ditangani di window
		<div
			ref={overlayRef}
			role="dialog"
			aria-modal="true"
			aria-label="About WritingHub"
			className="fixed inset-0 z-[70] flex animate-in items-center justify-center bg-black/60 backdrop-blur-sm fade-in duration-200"
			onClick={(event) => {
				if (event.target === overlayRef.current) setAboutOpen(false)
			}}
		>
			<div className="relative flex w-full max-w-sm animate-in flex-col items-center gap-4 rounded-2xl border border-line-strong bg-surface-raised px-6 pt-8 pb-6 text-center shadow-2xl zoom-in-95 duration-200">
				<button
					type="button"
					onClick={() => setAboutOpen(false)}
					aria-label="Close"
					className="absolute top-3 right-3 rounded-md p-1 text-subtle transition-colors hover:bg-[var(--overlay-hover)] hover:text-foreground"
				>
					<X className="h-5 w-5" />
				</button>
				<Image
					src="/Logo/Logo-small.png"
					alt=""
					width={40}
					height={40}
					className="h-10 w-10 object-contain"
				/>
				<div>
					<h2 className="text-lg font-semibold text-foreground">WritingHub</h2>
					{VERSION && <p className="mt-0.5 text-xs text-subtle">Version {VERSION}</p>}
				</div>
				<p className="text-sm text-muted">
					Write, check, and polish documents in one workspace. Your documents are kept in this browser and
					saved to the cloud when you choose Save to cloud.
				</p>
				<div className="mt-1 flex w-full items-center justify-center gap-3">
					<button
						type="button"
						onClick={() => {
							setAboutOpen(false)
							setShortcutsOpen(true)
						}}
						className="flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium text-muted transition-colors hover:bg-[var(--overlay-hover)] hover:text-foreground"
					>
						<Keyboard className="h-4 w-4" />
						Keyboard shortcuts
					</button>
					<button
						type="button"
						onClick={() => setAboutOpen(false)}
						className="rounded-xl bg-accent px-5 py-2 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent-hover"
					>
						Close
					</button>
				</div>
			</div>
		</div>
	)
}
