'use client'

import { Image as ImageIcon, Link as LinkIcon, Upload } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

export function InsertImageDialog({
	open,
	onInsert,
	onCancel,
}: {
	open: boolean
	onInsert: (attrs: { src: string; alt?: string; title?: string }) => void
	onCancel: () => void
}) {
	const [src, setSrc] = useState('')
	const [alt, setAlt] = useState('')
	const [title, setTitle] = useState('')
	const [mode, setMode] = useState<'url' | 'upload'>('url')
	const [error, setError] = useState<string | null>(null)
	const overlayRef = useRef<HTMLDivElement>(null)
	const urlInputRef = useRef<HTMLInputElement>(null)
	useEffect(() => {
		if (!open) return
		setSrc('')
		setAlt('')
		setTitle('')
		setMode('url')
		setError(null)
		const timer = setTimeout(() => urlInputRef.current?.focus(), 50)
		return () => clearTimeout(timer)
	}, [open])
	useEffect(() => {
		if (!open) return
		document.body.style.overflow = 'hidden'
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === 'Escape') onCancel()
		}
		window.addEventListener('keydown', onKeyDown)
		return () => {
			document.body.style.overflow = ''
			window.removeEventListener('keydown', onKeyDown)
		}
	}, [open, onCancel])

	if (!open) return null

	const onFile = (file: File) => {
		setError(null)
		if (file.size > 5 * 1024 * 1024) {
			setError('Berkas terlalu besar (maks 5 MB).')
			return
		}
		const reader = new FileReader()
		reader.onload = () => {
			setSrc(reader.result as string)
			setAlt((current) => current || file.name.replace(/\.[^.]+$/, ''))
		}
		reader.onerror = () => setError('Gagal membaca berkas.')
		reader.readAsDataURL(file)
	}
	const switchMode = (next: 'url' | 'upload') => {
		if (next === mode) return
		setMode(next)
		setSrc('')
		setError(null)
	}

	const submit = () => {
		if (!src) {
			setError('URL atau berkas gambar diperlukan.')
			return
		}
		onInsert({ src, alt: alt || undefined, title: title || undefined })
	}

	return (
		<div
			ref={overlayRef}
			role="dialog"
			aria-modal="true"
			aria-label="Sisipkan gambar"
			className="fixed inset-0 z-[70] flex animate-in items-center justify-center bg-black/60 backdrop-blur-sm fade-in duration-200"
			onClick={(event) => {
				if (event.target === overlayRef.current) onCancel()
			}}
		>
			<div className="flex w-full max-w-md animate-in flex-col gap-4 rounded-2xl border border-line-strong bg-surface-raised p-5 shadow-2xl zoom-in-95 duration-200">
				<div className="flex items-center gap-2">
					<ImageIcon className="h-5 w-5 text-accent" />
					<h2 className="text-base font-semibold text-foreground">Sisipkan gambar</h2>
				</div>

				{/* Beralih antara URL dan unggah berkas. */}
				<div className="flex gap-1 rounded-xl bg-[var(--overlay-hover)] p-1">
					<button
						type="button"
						onClick={() => switchMode('url')}
						className={
							'flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition-colors ' +
							(mode === 'url'
								? 'bg-surface-raised text-foreground shadow-sm'
								: 'text-muted hover:text-foreground')
						}
					>
						<LinkIcon className="h-3.5 w-3.5" /> URL
					</button>
					<button
						type="button"
						onClick={() => switchMode('upload')}
						className={
							'flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition-colors ' +
							(mode === 'upload'
								? 'bg-surface-raised text-foreground shadow-sm'
								: 'text-muted hover:text-foreground')
						}
					>
						<Upload className="h-3.5 w-3.5" /> Unggah
					</button>
				</div>

				{/* `key` berbeda per mode itu wajib, bukan hiasan: tanpa itu React
				    melihat dua <label> → <span> → <input> di posisi yang sama dan
				    memakai ulang node input-nya, sehingga input URL (controlled)
				    berubah jadi input berkas (uncontrolled) di tempat. */}
				{mode === 'url' ? (
					<label key="url" className="flex flex-col gap-1.5">
						<span className="text-xs font-medium text-muted">URL gambar</span>
						<input
							ref={urlInputRef}
							type="url"
							value={src}
							onChange={(e) => setSrc(e.target.value)}
							placeholder="https://contoh.com/gambar.png"
							className="rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
						/>
					</label>
				) : (
					<label key="upload" className="flex flex-col gap-1.5">
						<span className="text-xs font-medium text-muted">Berkas gambar</span>
						<input
							type="file"
							accept="image/*"
							onChange={(e) => {
								const file = e.target.files?.[0]
								if (file) onFile(file)
							}}
							className="text-sm text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-accent/10 file:px-3 file:py-1.5 file:text-accent hover:file:bg-accent/20"
						/>
						{src && (
							<img
								src={src}
								alt={alt}
								className="mt-1 max-h-32 rounded-lg border border-line object-contain"
							/>
						)}
					</label>
				)}

				<label className="flex flex-col gap-1.5">
					<span className="text-xs font-medium text-muted">Teks alternatif</span>
					<input
						type="text"
						value={alt}
						onChange={(e) => setAlt(e.target.value)}
						placeholder="Deskripsi gambar untuk aksesibilitas"
						className="rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
					/>
				</label>

				<label className="flex flex-col gap-1.5">
					<span className="text-xs font-medium text-muted">Judul (opsional)</span>
					<input
						type="text"
						value={title}
						onChange={(e) => setTitle(e.target.value)}
						placeholder="Tooltip gambar"
						className="rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
					/>
				</label>

				{error && <p className="text-xs text-red-600">{error}</p>}

				<div className="flex justify-end gap-2">
					<button
						type="button"
						onClick={onCancel}
						className="rounded-xl px-4 py-2 text-sm text-muted transition-colors hover:bg-[var(--overlay-hover)] hover:text-foreground"
					>
						Batal
					</button>
					<button
						type="button"
						onClick={submit}
						className="flex items-center gap-2 rounded-xl bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent-hover"
					>
						Sisipkan
					</button>
				</div>
			</div>
		</div>
	)
}
