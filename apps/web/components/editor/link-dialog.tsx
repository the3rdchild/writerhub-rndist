'use client'

import { Link as LinkIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { applyLink, type LinkDialogRequest, onLinkDialogRequest, removeLink } from '@/features/editor/link'

/**
 * Dialog tautan untuk Ctrl+K, tombol toolbar, dan Sisip › Tautan. Menggantikan
 * `window.prompt`: tanpa seleksi teks tautannya bisa diisi (atau memakai URL),
 * dan tautan yang ada bisa diganti atau dilepas (TKS-11).
 */
export function LinkDialog() {
	const [request, setRequest] = useState<LinkDialogRequest | null>(null)
	const [href, setHref] = useState('')
	const [text, setText] = useState('')
	const overlayRef = useRef<HTMLDivElement>(null)
	const urlRef = useRef<HTMLInputElement>(null)

	useEffect(function listenForRequests() {
		return onLinkDialogRequest((next) => {
			setRequest(next)
			setHref(next.href)
			setText(next.text)
		})
	}, [])
	useEffect(
		function focusUrlWhenOpened() {
			if (request) requestAnimationFrame(() => urlRef.current?.select())
		},
		[request],
	)

	if (!request) return null

	const close = () => {
		setRequest(null)
		request.editor.commands.focus()
	}
	const submit = () => {
		applyLink(request, href, text)
		setRequest(null)
	}
	const editing = request.href !== ''

	return (
		<div
			ref={overlayRef}
			role="dialog"
			aria-modal="true"
			aria-label="Link"
			className="fixed inset-0 z-[70] flex animate-in items-center justify-center bg-black/60 backdrop-blur-sm fade-in duration-200"
			onClick={(event) => {
				if (event.target === overlayRef.current) close()
			}}
			onKeyDown={(event) => {
				if (event.key === 'Escape') close()
			}}
		>
			<form
				className="flex w-full max-w-md animate-in flex-col gap-4 rounded-2xl border border-line-strong bg-surface-raised p-5 shadow-2xl zoom-in-95 duration-200"
				onSubmit={(event) => {
					event.preventDefault()
					submit()
				}}
			>
				<div className="flex items-center gap-2">
					<LinkIcon className="h-5 w-5 text-accent" />
					<h2 className="text-base font-semibold text-foreground">{editing ? 'Edit link' : 'Insert link'}</h2>
				</div>

				<label className="flex flex-col gap-1.5">
					<span className="text-xs font-medium text-muted">Text to display</span>
					<input
						type="text"
						value={text}
						onChange={(event) => setText(event.target.value)}
						placeholder={request.hasRange ? '' : 'Defaults to the URL'}
						className="rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
					/>
				</label>
				<label className="flex flex-col gap-1.5">
					<span className="text-xs font-medium text-muted">Link (web address or email)</span>
					<input
						ref={urlRef}
						type="text"
						inputMode="url"
						value={href}
						onChange={(event) => setHref(event.target.value)}
						placeholder="example.com"
						className="rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
					/>
				</label>

				<div className="flex items-center gap-2">
					{editing && (
						<button
							type="button"
							onClick={() => {
								removeLink(request.editor)
								setRequest(null)
							}}
							className="rounded-xl px-3 py-2 text-sm text-red-500 transition-colors hover:bg-[var(--overlay-hover)]"
						>
							Remove link
						</button>
					)}
					<div className="ml-auto flex gap-2">
						<button
							type="button"
							onClick={close}
							className="rounded-xl px-4 py-2 text-sm text-muted transition-colors hover:bg-[var(--overlay-hover)] hover:text-foreground"
						>
							Cancel
						</button>
						<button
							type="submit"
							disabled={href.trim() === ''}
							className="rounded-xl bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent-hover disabled:opacity-50"
						>
							Apply
						</button>
					</div>
				</div>
			</form>
		</div>
	)
}
