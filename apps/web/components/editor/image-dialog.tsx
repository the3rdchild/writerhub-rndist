'use client'

import { Image as ImageIcon, Link as LinkIcon, Upload } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import {
	type ImageDialogRequest,
	MAX_IMAGE_BYTES,
	onImageDialogRequest,
	readImageFile,
	replaceSelectedImage,
	setSelectedImageAlt,
} from '@/features/editor/image-insert'
import { cn } from '@/lib/utils'

const TITLES: Record<ImageDialogRequest['mode'], string> = {
	insert: 'Insert image',
	replace: 'Replace image',
	alt: 'Alt text',
}

/**
 * Satu dialog gambar untuk Sisip › Gambar, tombol toolbar, slash "Gambar"
 * (dulu `window.prompt`), serta Ganti gambar dan Teks alt dari toolbar
 * gambar (uji editor 2 Okt, OBJ-10).
 */
export function ImageDialog() {
	const [request, setRequest] = useState<ImageDialogRequest | null>(null)
	const [src, setSrc] = useState('')
	const [alt, setAlt] = useState('')
	const [title, setTitle] = useState('')
	const [source, setSource] = useState<'url' | 'upload'>('url')
	const [error, setError] = useState<string | null>(null)
	const overlayRef = useRef<HTMLDivElement>(null)
	const firstFieldRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null)

	useEffect(function listenForRequests() {
		return onImageDialogRequest((next) => {
			setRequest(next)
			setSrc('')
			setAlt(next.alt)
			setTitle('')
			setSource('url')
			setError(null)
		})
	}, [])
	useEffect(
		function focusFirstFieldWhenOpened() {
			if (request) requestAnimationFrame(() => firstFieldRef.current?.focus())
		},
		[request],
	)

	if (!request) return null
	const { editor, mode } = request

	const close = () => {
		setRequest(null)
		if (!editor.isDestroyed) editor.commands.focus()
	}

	const onFile = (file: File) => {
		setError(null)
		if (file.size > MAX_IMAGE_BYTES) {
			setError('The file is too large (5 MB at most).')
			return
		}
		readImageFile(file)
			.then(setSrc)
			.catch(() => setError('Could not read the file.'))
	}

	const submit = () => {
		if (mode === 'alt') {
			setSelectedImageAlt(editor, alt)
			setRequest(null)
			return
		}
		const value = src.trim()
		if (!value) {
			setError('Enter an image URL or choose a file.')
			return
		}
		if (mode === 'replace') void replaceSelectedImage(editor, value, alt.trim() || undefined)
		else
			editor
				.chain()
				.focus()
				.setImage({ src: value, alt: alt.trim() || undefined, title: title.trim() || undefined })
				.run()
		setRequest(null)
	}

	const field = 'rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-accent'

	return (
		<div
			ref={overlayRef}
			role="dialog"
			aria-modal="true"
			aria-label={TITLES[mode]}
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
					<ImageIcon className="h-5 w-5 text-accent" />
					<h2 className="text-base font-semibold text-foreground">{TITLES[mode]}</h2>
				</div>

				{mode !== 'alt' && (
					<>
						<div className="flex gap-1 rounded-xl bg-[var(--overlay-hover)] p-1">
							{(['url', 'upload'] as const).map((value) => (
								<button
									key={value}
									type="button"
									onClick={() => {
										if (value === source) return
										setSource(value)
										setSrc('')
										setError(null)
									}}
									className={cn(
										'flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition-colors',
										source === value
											? 'bg-surface-raised text-foreground shadow-sm'
											: 'text-muted hover:text-foreground',
									)}
								>
									{value === 'url' ? (
										<LinkIcon className="h-3.5 w-3.5" />
									) : (
										<Upload className="h-3.5 w-3.5" />
									)}
									{value === 'url' ? 'URL' : 'Upload'}
								</button>
							))}
						</div>

						{/* `key` per sumber wajib: tanpa itu React memakai ulang node input
						    URL (controlled) sebagai input berkas (uncontrolled). */}
						{source === 'url' ? (
							<label key="url" className="flex flex-col gap-1.5">
								<span className="text-xs font-medium text-muted">Image URL</span>
								<input
									ref={(node) => {
										firstFieldRef.current = node
									}}
									type="url"
									value={src}
									onChange={(event) => setSrc(event.target.value)}
									placeholder="https://example.com/image.png"
									className={field}
								/>
							</label>
						) : (
							<label key="upload" className="flex flex-col gap-1.5">
								<span className="text-xs font-medium text-muted">Image file</span>
								<input
									type="file"
									accept="image/*"
									onChange={(event) => {
										const file = event.target.files?.[0]
										if (file) onFile(file)
									}}
									className="text-sm text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-accent/10 file:px-3 file:py-1.5 file:text-accent hover:file:bg-accent/20"
								/>
								{src && (
									// biome-ignore lint/performance/noImgElement: pratinjau data URI lokal
									<img
										src={src}
										alt=""
										className="mt-1 max-h-32 rounded-lg border border-line object-contain"
									/>
								)}
							</label>
						)}
					</>
				)}

				<label className="flex flex-col gap-1.5">
					<span className="text-xs font-medium text-muted">Alt text</span>
					<textarea
						ref={(node) => {
							if (mode === 'alt') firstFieldRef.current = node
						}}
						value={alt}
						onChange={(event) => setAlt(event.target.value)}
						rows={mode === 'alt' ? 3 : 2}
						placeholder="Describe the image for people who can't see it"
						className={cn(field, 'resize-none')}
					/>
				</label>

				{mode === 'insert' && (
					<label className="flex flex-col gap-1.5">
						<span className="text-xs font-medium text-muted">Title (optional)</span>
						<input
							type="text"
							value={title}
							onChange={(event) => setTitle(event.target.value)}
							placeholder="Shown when hovering the image"
							className={field}
						/>
					</label>
				)}

				{error && <p className="text-xs text-red-600">{error}</p>}

				<div className="flex justify-end gap-2">
					<button
						type="button"
						onClick={close}
						className="rounded-xl px-4 py-2 text-sm text-muted transition-colors hover:bg-[var(--overlay-hover)] hover:text-foreground"
					>
						Cancel
					</button>
					<button
						type="submit"
						className="rounded-xl bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent-hover"
					>
						{mode === 'insert' ? 'Insert' : mode === 'replace' ? 'Replace' : 'Save'}
					</button>
				</div>
			</form>
		</div>
	)
}
