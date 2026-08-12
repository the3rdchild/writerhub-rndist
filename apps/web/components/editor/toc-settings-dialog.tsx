'use client'

import { useEffect, useRef, useState } from 'react'
import { INCH } from '@/features/editor/page-geometry'
import {
	DEFAULT_TOC_ATTRS,
	type TocBlockAttrs,
	type TocStyle,
	type TocTabLeader,
} from '@/features/editor/toc-block'
import { TOC_SETTINGS_EVENT, type TocSettingsRequest } from '@/components/editor/toc-block-view'
import { useEditorInstance } from '@/features/editor/editor-context'
import { usePageSetup } from '@/features/editor/use-page-setup'

/**
 * Dialog setelan blok daftar isi (§A5.2).
 *
 * Dibuka dari menu tiga-titik blok TOC lewat event DOM yang membawa atribut
 * blok + callback `apply` milik NodeView pemanggil - jadi dialog menulis ke
 * node yang benar tanpa menebak lewat seleksi. Draf lokal diterapkan saat OK.
 * Nomor halaman otomatis dimatikan pada pageless (§A5.3).
 */
function fromPx(px: number): number {
	return (px / INCH) * 2.54
}
function toPx(cm: number): number {
	return Math.round((cm / 2.54) * INCH)
}

export function TocSettingsDialog() {
	const { editor } = useEditorInstance()
	const { setup } = usePageSetup()
	const [open, setOpen] = useState(false)
	const [draft, setDraft] = useState<TocBlockAttrs>(DEFAULT_TOC_ATTRS)
	const applyRef = useRef<((patch: Partial<TocBlockAttrs>) => void) | null>(null)
	const overlayRef = useRef<HTMLDivElement>(null)

	// Buka saat event dari NodeView; detail membawa atribut + apply blok itu.
	useEffect(() => {
		if (!editor) return
		const handler = (e: Event) => {
			const detail = (e as CustomEvent<TocSettingsRequest>).detail
			if (!detail) return
			applyRef.current = detail.apply
			setDraft({ ...DEFAULT_TOC_ATTRS, ...detail.attrs })
			setOpen(true)
		}
		editor.view.dom.addEventListener(TOC_SETTINGS_EVENT, handler)
		return () => editor.view.dom.removeEventListener(TOC_SETTINGS_EVENT, handler)
	}, [editor])

	useEffect(() => {
		if (!open) return
		document.body.style.overflow = 'hidden'
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') setOpen(false)
		}
		window.addEventListener('keydown', onKey)
		return () => {
			document.body.style.overflow = ''
			window.removeEventListener('keydown', onKey)
		}
	}, [open])

	const ok = () => {
		applyRef.current?.(draft)
		setOpen(false)
	}

	if (!open) return null

	const pageless = setup.pageless

	return (
		<div
			ref={overlayRef}
			role="dialog"
			aria-modal="true"
			aria-label="Setelan daftar isi"
			className="fixed inset-0 z-[70] flex animate-in items-center justify-center bg-black/60 backdrop-blur-sm fade-in duration-200"
			onClick={(e) => {
				if (e.target === overlayRef.current) setOpen(false)
			}}
		>
			<div className="flex w-full max-w-md animate-in flex-col gap-4 rounded-2xl border border-line-strong bg-surface-raised p-5 shadow-2xl zoom-in-95 duration-200">
				<h2 className="text-base font-semibold text-foreground">Setelan daftar isi</h2>

				{/* Format */}
				<label className="flex flex-col gap-1">
					<span className="text-xs font-medium text-muted">Format</span>
					<select
						value={draft.style}
						onChange={(e) => setDraft((c) => ({ ...c, style: e.target.value as TocStyle }))}
						className="rounded-lg border border-line bg-surface px-2 py-1.5 text-sm text-foreground outline-none focus:border-accent"
					>
						<option value="plain">Teks polos</option>
						<option value="dotted">Bertitik</option>
						<option value="link">Tautan</option>
					</select>
				</label>

				{/* Nomor halaman - dimatikan pada pageless */}
				<label className="flex items-center gap-2">
					<input
						type="checkbox"
						checked={draft.showPageNumbers && !pageless}
						disabled={pageless}
						onChange={(e) => setDraft((c) => ({ ...c, showPageNumbers: e.target.checked }))}
						className="h-4 w-4 accent-[var(--accent)]"
					/>
					<span className="text-sm text-foreground">
						Tampilkan nomor halaman
						{pageless && <span className="ml-1 text-xs text-subtle">(mati pada pageless)</span>}
					</span>
				</label>

				{/* Pengisi tab */}
				<label className="flex flex-col gap-1">
					<span className="text-xs font-medium text-muted">Pengisi tab</span>
					<select
						value={draft.tabLeader}
						onChange={(e) => setDraft((c) => ({ ...c, tabLeader: e.target.value as TocTabLeader }))}
						className="rounded-lg border border-line bg-surface px-2 py-1.5 text-sm text-foreground outline-none focus:border-accent"
					>
						<option value="none">Tidak ada</option>
						<option value="dots">Titik-titik (…)</option>
						<option value="dashes">Tanda pisah (- - -)</option>
						<option value="line">Garis (———)</option>
					</select>
				</label>

				{/* Rentang tingkat */}
				<div className="grid grid-cols-2 gap-3">
					<label className="flex flex-col gap-1">
						<span className="text-xs font-medium text-muted">Tingkat terendah</span>
						<input
							type="number"
							min={1}
							max={9}
							value={draft.minLevel}
							onChange={(e) => setDraft((c) => ({ ...c, minLevel: Number(e.target.value) || 1 }))}
							className="rounded-lg border border-line bg-surface px-2 py-1.5 text-sm text-foreground outline-none focus:border-accent"
						/>
					</label>
					<label className="flex flex-col gap-1">
						<span className="text-xs font-medium text-muted">Tingkat tertinggi</span>
						<input
							type="number"
							min={1}
							max={9}
							value={draft.maxLevel}
							onChange={(e) => setDraft((c) => ({ ...c, maxLevel: Number(e.target.value) || 1 }))}
							className="rounded-lg border border-line bg-surface px-2 py-1.5 text-sm text-foreground outline-none focus:border-accent"
						/>
					</label>
				</div>

				{/* Lekukan per tingkat */}
				<label className="flex flex-col gap-1">
					<span className="text-xs font-medium text-muted">Lekukan per tingkat (cm)</span>
					<input
						type="number"
						min={0}
						step={0.1}
						value={Math.round(fromPx(draft.indentPerLevel) * 100) / 100}
						onChange={(e) => setDraft((c) => ({ ...c, indentPerLevel: toPx(Number(e.target.value) || 0) }))}
						className="rounded-lg border border-line bg-surface px-2 py-1.5 text-sm text-foreground outline-none focus:border-accent"
					/>
				</label>

				<div className="flex justify-end gap-2">
					<button
						type="button"
						onClick={() => setOpen(false)}
						className="rounded-lg px-3 py-1.5 text-sm text-muted transition-colors hover:bg-[var(--overlay-hover)] hover:text-foreground"
					>
						Batal
					</button>
					<button
						type="button"
						onClick={ok}
						className="rounded-lg bg-accent px-4 py-1.5 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent-hover"
					>
						OK
					</button>
				</div>
			</div>
		</div>
	)
}
