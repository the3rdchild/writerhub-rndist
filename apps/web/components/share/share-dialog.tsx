'use client'

import { Check, Copy, Globe, Link2, Lock, Mail, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { getTab } from '@/features/documents/api'
import { useSessions } from '@/features/sessions/session-context'
import { createShare } from '@/features/share/api'
import { useShare } from '@/features/share/share-context'
import {
	SHARE_ACCESS_LABELS,
	SHARE_ROLE_LABELS,
	type ShareAccess,
	type ShareRole,
} from '@/features/share/types'
import { useSync } from '@/features/sync/sync-context'
import { cn } from '@/lib/utils'

const ACCESS_OPTIONS: ShareAccess[] = ['restricted', 'anyone']
const ROLE_OPTIONS: ShareRole[] = ['viewer', 'commenter', 'editor']

/**
 * Dialog bagikan ala Google Docs.
 *
 * Share membagikan SATU DOKUMEN (seluruh tab di dalamnya, dibaca LIVE tiap
 * link dibuka - BUKAN salinan beku) - persis pola Google Docs: "Share" satu
 * file, bukan satu folder. Dokumennya ditentukan lewat tab yang sedang aktif di
 * editor (tab -> dokumen induknya); tab yang belum tersimpan di cloud belum
 * punya dokumen induk sama sekali, jadi dialog ini minta disimpan dulu.
 */
export function ShareDialog() {
	const { shareOpen, setShareOpen } = useShare()
	const { activeId } = useSessions()
	const { linkage } = useSync()
	const overlayRef = useRef<HTMLDivElement>(null)
	const [copied, setCopied] = useState(false)
	const [emails, setEmails] = useState('')
	const [message, setMessage] = useState('')
	const [access, setAccess] = useState<ShareAccess>('anyone')
	const [role, setRole] = useState<ShareRole>('viewer')
	const [link, setLink] = useState('')
	const [documentTitle, setDocumentTitle] = useState('')
	const [loading, setLoading] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [notSynced, setNotSynced] = useState(false)

	useEffect(() => {
		if (!shareOpen) {
			// Reset ringan saat dialog ditutup; tidak perlu menyentuh form.
			setLink('')
			setError(null)
			setLoading(false)
			setCopied(false)
			setNotSynced(false)
			setDocumentTitle('')
			return
		}

		document.body.style.overflow = 'hidden'
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === 'Escape') setShareOpen(false)
		}
		window.addEventListener('keydown', onKeyDown)

		// Tab lokal yang belum pernah tersimpan ke cloud belum punya dokumen
		// induk - tidak ada yang bisa dibagikan.
		const serverId = activeId ? linkage[activeId]?.serverId : undefined
		if (!serverId) {
			setNotSynced(true)
		} else {
			setLoading(true)
			setError(null)
			setNotSynced(false)
			getTab(serverId)
				.then((tab) => createShare({ documentId: tab.documentId, access, role }))
				.then((result) => {
					setLink(`${window.location.origin}${result.url}`)
					setDocumentTitle(result.documentTitle)
				})
				.catch((cause) => setError(cause instanceof Error ? cause.message : 'Gagal membuat link'))
				.finally(() => setLoading(false))
		}

		return () => {
			document.body.style.overflow = ''
			window.removeEventListener('keydown', onKeyDown)
		}
		// biome-ignore lint/correctness/useExhaustiveDependencies: share dibuat ulang saat dialog dibuka atau akses/peran berubah
	}, [shareOpen, activeId, linkage, access, role])

	if (!shareOpen) return null

	const copyLink = async () => {
		if (!link) return
		try {
			await navigator.clipboard.writeText(link)
			setCopied(true)
			setTimeout(() => setCopied(false), 2000)
		} catch {
			// Jatuhkan ke input yang bisa dipilih bila clipboard ditolak.
		}
	}

	const disabled = notSynced || loading || Boolean(error)

	return (
		<div
			ref={overlayRef}
			role="dialog"
			aria-modal="true"
			aria-label="Bagikan dokumen"
			className="fixed inset-0 z-[70] flex animate-in items-center justify-center bg-black/60 backdrop-blur-sm fade-in duration-200"
			onClick={(event) => {
				if (event.target === overlayRef.current) setShareOpen(false)
			}}
		>
			<div className="flex max-h-[90vh] w-full max-w-[520px] animate-in flex-col gap-5 overflow-y-auto rounded-2xl border border-line-strong bg-surface-raised p-6 shadow-2xl zoom-in-95 duration-200">
				{/* Header */}
				<div className="flex items-start justify-between gap-4">
					<div>
						<h2 className="text-xl font-normal text-foreground">
							{documentTitle ? `Bagikan "${documentTitle}"` : 'Bagikan dokumen'}
						</h2>
						<p className="mt-1 text-sm text-muted">
							Seluruh tab di dokumen ini ikut dibagikan lewat satu link.
						</p>
					</div>
					<button
						type="button"
						onClick={() => setShareOpen(false)}
						aria-label="Tutup"
						className="rounded-md p-1 text-subtle transition-colors hover:bg-[var(--overlay-hover)] hover:text-foreground"
					>
						<X className="h-5 w-5" />
					</button>
				</div>

				{/* Email input */}
				<div className="flex flex-col gap-1.5">
					<label htmlFor="share-emails" className="text-sm font-medium text-foreground">
						Kirim ke
					</label>
					<div className="relative">
						<Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
						<input
							id="share-emails"
							type="text"
							value={emails}
							onChange={(event) => setEmails(event.target.value)}
							placeholder="Tambah orang untuk dikirimi link"
							className="w-full rounded-lg border border-line-strong bg-surface-inset py-2.5 pl-9 pr-3 text-sm text-foreground outline-none transition-colors placeholder:text-faint focus:border-accent/50"
						/>
					</div>
				</div>

				{/* Message */}
				<div className="flex flex-col gap-1.5">
					<label htmlFor="share-message" className="text-sm font-medium text-foreground">
						Pesan
					</label>
					<textarea
						id="share-message"
						value={message}
						onChange={(event) => setMessage(event.target.value)}
						rows={3}
						placeholder="Pesan"
						className="w-full resize-none rounded-lg border border-line-strong bg-surface-inset px-3 py-2.5 text-sm text-foreground outline-none transition-colors placeholder:text-faint focus:border-accent/50"
					/>
				</div>

				{/* Link preview */}
				<div className="flex flex-col gap-1.5">
					<label className="text-sm font-medium text-foreground">Link dokumen</label>
					<div className="flex items-center gap-2 rounded-lg border border-line-strong bg-surface-inset px-3 py-2">
						<Link2 className="h-4 w-4 shrink-0 text-faint" />
						<input
							type="text"
							readOnly
							value={notSynced ? '' : loading ? 'Membuat link…' : error ? '' : link}
							className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none"
						/>
						<button
							type="button"
							onClick={() => {
								void copyLink()
							}}
							disabled={!link || disabled}
							className={cn(
								'flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
								copied
									? 'bg-green-500/15 text-green-600'
									: 'text-accent hover:bg-accent/10',
								(!link || disabled) && 'cursor-not-allowed opacity-50',
							)}
						>
							{copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
							{copied ? 'Tersalin' : 'Salin'}
						</button>
					</div>
					{notSynced ? (
						<p className="text-xs text-red-500">
							Simpan dokumen ini ke cloud dulu (tombol Simpan di kartu Library) untuk
							membagikannya.
						</p>
					) : error ? (
						<p className="text-xs text-red-500">{error}</p>
					) : (
						<p className="text-xs text-subtle">
							Link menampilkan isi dokumen ini secara langsung (live) - perubahan terbaru
							langsung terlihat. Siapa pun yang memiliki link dapat membuka.
						</p>
					)}
				</div>

				{/* General access */}
				<div className="flex flex-col gap-3">
					<h3 className="text-sm font-medium text-foreground">Akses umum</h3>
					<div className="rounded-lg border border-line p-1">
						{ACCESS_OPTIONS.map((value) => (
							<button
								key={value}
								type="button"
								onClick={() => setAccess(value)}
								disabled={disabled}
								className={cn(
									'flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left transition-colors',
									access === value
										? 'bg-accent/10 text-foreground'
										: 'text-muted hover:bg-[var(--overlay-hover)] hover:text-foreground',
									disabled && 'cursor-not-allowed opacity-60',
								)}
							>
								{value === 'anyone' ? (
									<Globe className="h-4 w-4 shrink-0" />
								) : (
									<Lock className="h-4 w-4 shrink-0" />
								)}
								<div className="flex-1">
									<p className="text-sm font-medium">{SHARE_ACCESS_LABELS[value].label}</p>
									<p className="text-xs text-subtle">{SHARE_ACCESS_LABELS[value].description}</p>
								</div>
								{access === value && (
									<Check className="h-4 w-4 shrink-0 text-accent" />
								)}
							</button>
						))}
					</div>
				</div>

				{/* Role selector */}
				<div className="flex flex-col gap-1.5">
					<label htmlFor="share-role" className="text-sm font-medium text-foreground">
						Peran penerima
					</label>
					<select
						id="share-role"
						value={role}
						onChange={(event) => setRole(event.target.value as ShareRole)}
						disabled={disabled}
						className={cn(
							'w-full rounded-lg border border-line-strong bg-surface-inset px-3 py-2.5 text-sm text-foreground outline-none transition-colors focus:border-accent/50',
							disabled && 'cursor-not-allowed opacity-60',
						)}
					>
						{ROLE_OPTIONS.map((value) => (
							<option key={value} value={value}>
								{SHARE_ROLE_LABELS[value]}
							</option>
						))}
					</select>
				</div>

				{/* Footer actions */}
				<div className="flex items-center justify-end gap-3 pt-1">
					<button
						type="button"
						onClick={() => setShareOpen(false)}
						className="rounded-xl px-4 py-2 text-sm font-medium text-muted transition-colors hover:bg-[var(--overlay-hover)] hover:text-foreground"
					>
						Batal
					</button>
					<button
						type="button"
						onClick={() => {
							void copyLink()
						}}
						disabled={!link || disabled}
						className={cn(
							'rounded-xl bg-accent px-5 py-2 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent-hover',
							(!link || disabled) && 'cursor-not-allowed opacity-50',
						)}
					>
						Kirim
					</button>
				</div>
			</div>
		</div>
	)
}
