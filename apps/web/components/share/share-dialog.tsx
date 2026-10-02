'use client'

import { Check, Copy, Globe, Link2, Lock, Mail, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { getTab } from '@/features/documents/api'
import { useSessions } from '@/features/sessions/session-context'
import { createShare, fetchCurrentShare, revokeShare, updateShare } from '@/features/share/api'
import { parseEmails } from '@/features/share/emails'
import { useShare } from '@/features/share/share-context'
import {
	type CreateShareResult,
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
 * Bagikan dokumen.
 *
 * Dulu dialog ini membuat tautan publik BARU setiap kali dibuka dan setiap
 * kali akses atau peran diganti - tautan lama tetap berlaku dan tidak bisa
 * dicabut - dan "Kirim" hanya menyalin tautan, mengabaikan alamat dan pesannya
 * (uji editor 2 Okt, SHL-10). Kini: satu tautan per dokumen yang dibuat hanya
 * atas permintaan, pengaturannya diubah di tautan yang sama, bisa dihentikan,
 * dan "Send" membuka aplikasi email dengan pesan dan tautannya.
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
	const [documentId, setDocumentId] = useState<string | null>(null)
	const [share, setShare] = useState<CreateShareResult | null>(null)
	const [documentTitle, setDocumentTitle] = useState('')
	const [loading, setLoading] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [notSynced, setNotSynced] = useState(false)

	const serverId = activeId ? linkage[activeId]?.serverId : undefined

	useEffect(
		function loadCurrentShare() {
			if (!shareOpen) {
				setShare(null)
				setDocumentId(null)
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
			let cancelled = false
			if (!serverId) {
				setNotSynced(true)
			} else {
				setLoading(true)
				setError(null)
				setNotSynced(false)
				getTab(serverId)
					.then(async (tab) => {
						const current = await fetchCurrentShare(tab.documentId)
						if (cancelled) return
						setDocumentId(tab.documentId)
						setShare(current)
						if (current) {
							setAccess(current.access)
							setRole(current.role)
							setDocumentTitle(current.documentTitle)
						}
					})
					.catch((cause) => {
						if (!cancelled)
							setError(cause instanceof Error ? cause.message : 'Could not load sharing settings')
					})
					.finally(() => {
						if (!cancelled) setLoading(false)
					})
			}

			return () => {
				cancelled = true
				document.body.style.overflow = ''
				window.removeEventListener('keydown', onKeyDown)
			}
		},
		[shareOpen, serverId, setShareOpen],
	)

	if (!shareOpen) return null

	const link = share ? `${window.location.origin}${share.url}` : ''
	const busy = notSynced || loading || !documentId

	const run = async (action: () => Promise<CreateShareResult | null>) => {
		setLoading(true)
		setError(null)
		try {
			const next = await action()
			setShare(next)
			if (next) setDocumentTitle(next.documentTitle)
			return next
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : 'Could not update the link')
			return null
		} finally {
			setLoading(false)
		}
	}

	const createLink = () =>
		documentId ? run(() => createShare({ documentId, access, role })) : Promise.resolve(null)

	const changeAccess = (value: ShareAccess) => {
		setAccess(value)
		if (share) void run(() => updateShare(share.token, { access: value }))
	}
	const changeRole = (value: ShareRole) => {
		setRole(value)
		if (share) void run(() => updateShare(share.token, { role: value }))
	}
	const stopSharing = () => {
		if (!share) return
		void run(async () => {
			await revokeShare(share.token)
			return null
		})
	}

	const copyLink = async (url = link) => {
		if (!url) return
		try {
			await navigator.clipboard.writeText(url)
			setCopied(true)
			setTimeout(() => setCopied(false), 2000)
		} catch {}
	}

	const recipients = parseEmails(emails)
	const sendByEmail = async () => {
		const current = share ?? (await createLink())
		if (!current) return
		const url = `${window.location.origin}${current.url}`
		const subject = current.documentTitle || 'Shared document'
		const body = [message.trim(), url].filter(Boolean).join('\n\n')
		window.location.href = `mailto:${recipients.join(',')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
	}

	return (
		<div
			ref={overlayRef}
			role="dialog"
			aria-modal="true"
			aria-label="Share document"
			className="fixed inset-0 z-[70] flex animate-in items-center justify-center bg-black/60 backdrop-blur-sm fade-in duration-200"
			onClick={(event) => {
				if (event.target === overlayRef.current) setShareOpen(false)
			}}
		>
			<div className="flex max-h-[90vh] w-full max-w-[520px] animate-in flex-col gap-5 overflow-y-auto rounded-2xl border border-line-strong bg-surface-raised p-6 shadow-2xl zoom-in-95 duration-200">
				<div className="flex items-start justify-between gap-4">
					<div>
						<h2 className="text-xl font-normal text-foreground">
							{documentTitle ? `Share "${documentTitle}"` : 'Share document'}
						</h2>
						<p className="mt-1 text-sm text-muted">All tabs in this document are shared through one link.</p>
					</div>
					<button
						type="button"
						onClick={() => setShareOpen(false)}
						aria-label="Close"
						className="rounded-md p-1 text-subtle transition-colors hover:bg-[var(--overlay-hover)] hover:text-foreground"
					>
						<X className="h-5 w-5" />
					</button>
				</div>

				{notSynced ? (
					<p className="text-sm text-red-500">
						Save this document to the cloud first (Save to cloud in the tab menu) to share it.
					</p>
				) : (
					<>
						<div className="flex flex-col gap-1.5">
							<span className="text-sm font-medium text-foreground">Document link</span>
							{share ? (
								<div className="flex items-center gap-2 rounded-lg border border-line-strong bg-surface-inset px-3 py-2">
									<Link2 className="h-4 w-4 shrink-0 text-faint" />
									<input
										type="text"
										readOnly
										aria-label="Share link"
										value={link}
										className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none"
									/>
									<button
										type="button"
										onClick={() => void copyLink()}
										className={cn(
											'flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
											copied ? 'bg-green-500/15 text-green-600' : 'text-accent hover:bg-accent/10',
										)}
									>
										{copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
										{copied ? 'Copied' : 'Copy'}
									</button>
								</div>
							) : (
								<div className="flex items-center justify-between gap-3 rounded-lg border border-dashed border-line-strong px-3 py-2.5">
									<p className="text-sm text-muted">
										{loading ? 'Loading…' : 'This document is not shared yet.'}
									</p>
									<button
										type="button"
										onClick={() => void createLink()}
										disabled={busy}
										className="shrink-0 rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent-hover disabled:opacity-50"
									>
										Create link
									</button>
								</div>
							)}
							{error ? (
								<p className="text-xs text-red-500">{error}</p>
							) : share ? (
								<p className="text-xs text-subtle">
									The link shows the live document - recent changes appear right away.
								</p>
							) : null}
						</div>

						<div className="flex flex-col gap-3">
							<h3 className="text-sm font-medium text-foreground">General access</h3>
							<div className="rounded-lg border border-line p-1">
								{ACCESS_OPTIONS.map((value) => (
									<button
										key={value}
										type="button"
										onClick={() => changeAccess(value)}
										disabled={busy}
										className={cn(
											'flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left transition-colors',
											access === value
												? 'bg-accent/10 text-foreground'
												: 'text-muted hover:bg-[var(--overlay-hover)] hover:text-foreground',
											busy && 'cursor-not-allowed opacity-60',
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
										{access === value && <Check className="h-4 w-4 shrink-0 text-accent" />}
									</button>
								))}
							</div>
						</div>

						<div className="flex flex-col gap-1.5">
							<label htmlFor="share-role" className="text-sm font-medium text-foreground">
								People with the link can
							</label>
							<select
								id="share-role"
								value={role}
								onChange={(event) => changeRole(event.target.value as ShareRole)}
								disabled={busy}
								className={cn(
									'w-full rounded-lg border border-line-strong bg-surface-inset px-3 py-2.5 text-sm text-foreground outline-none transition-colors focus:border-accent/50',
									busy && 'cursor-not-allowed opacity-60',
								)}
							>
								{ROLE_OPTIONS.map((value) => (
									<option key={value} value={value}>
										{SHARE_ROLE_LABELS[value]}
									</option>
								))}
							</select>
						</div>

						<div className="flex flex-col gap-1.5">
							<label htmlFor="share-emails" className="text-sm font-medium text-foreground">
								Send to
							</label>
							<div className="relative">
								<Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
								<input
									id="share-emails"
									type="text"
									value={emails}
									onChange={(event) => setEmails(event.target.value)}
									placeholder="Email addresses, separated by commas"
									className="w-full rounded-lg border border-line-strong bg-surface-inset py-2.5 pl-9 pr-3 text-sm text-foreground outline-none transition-colors placeholder:text-faint focus:border-accent/50"
								/>
							</div>
							<textarea
								id="share-message"
								aria-label="Message"
								value={message}
								onChange={(event) => setMessage(event.target.value)}
								rows={3}
								placeholder="Message (optional)"
								className="w-full resize-none rounded-lg border border-line-strong bg-surface-inset px-3 py-2.5 text-sm text-foreground outline-none transition-colors placeholder:text-faint focus:border-accent/50"
							/>
							<p className="text-xs text-subtle">Send opens your email app with the message and the link.</p>
						</div>
					</>
				)}

				<div className="flex items-center gap-3 pt-1">
					{share && (
						<button
							type="button"
							onClick={stopSharing}
							disabled={loading}
							className="rounded-xl px-3 py-2 text-sm text-red-500 transition-colors hover:bg-[var(--overlay-hover)] disabled:opacity-50"
						>
							Stop sharing
						</button>
					)}
					<div className="ml-auto flex items-center gap-3">
						<button
							type="button"
							onClick={() => setShareOpen(false)}
							className="rounded-xl px-4 py-2 text-sm font-medium text-muted transition-colors hover:bg-[var(--overlay-hover)] hover:text-foreground"
						>
							Done
						</button>
						<button
							type="button"
							onClick={() => void sendByEmail()}
							disabled={busy || recipients.length === 0}
							className="rounded-xl bg-accent px-5 py-2 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
						>
							Send
						</button>
					</div>
				</div>
			</div>
		</div>
	)
}
