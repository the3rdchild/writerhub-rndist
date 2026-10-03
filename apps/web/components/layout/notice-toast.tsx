'use client'

import { Info, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { onNotice } from '@/lib/notice'

const VISIBLE_MS = 6000

/** Menampilkan `showNotice()` di pojok bawah, hilang sendiri setelah beberapa detik. */
export function NoticeToast() {
	const [message, setMessage] = useState<string | null>(null)

	useEffect(function listenForNotices() {
		return onNotice(setMessage)
	}, [])
	useEffect(
		function hideAfterAWhile() {
			if (!message) return
			const timer = setTimeout(() => setMessage(null), VISIBLE_MS)
			return () => clearTimeout(timer)
		},
		[message],
	)

	if (!message) return null

	return (
		<div
			role="status"
			className="fixed bottom-6 left-1/2 z-[80] flex max-w-md -translate-x-1/2 animate-in items-start gap-2 rounded-xl border border-line-strong bg-surface-raised px-4 py-3 text-sm text-foreground shadow-[var(--menu-shadow)] fade-in slide-in-from-bottom-2 duration-200"
		>
			<Info className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
			<p className="flex-1">{message}</p>
			<button
				type="button"
				onClick={() => setMessage(null)}
				aria-label="Dismiss"
				className="rounded-md p-0.5 text-subtle transition-colors hover:bg-[var(--overlay-hover)] hover:text-foreground"
			>
				<X className="h-4 w-4" />
			</button>
		</div>
	)
}
