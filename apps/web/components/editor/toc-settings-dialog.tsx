'use client'

import { useEffect, useRef, useState } from 'react'
import { INCH } from '@/features/editor/page-geometry'
import {
	DEFAULT_TOC_ATTRS,
	type TocBlockAttrs,
	type TocTabLeader,
} from '@/features/editor/toc-block'
import { TOC_SETTINGS_EVENT, type TocSettingsRequest } from '@/components/editor/toc-block-view'
import { useEditorInstance } from '@/features/editor/editor-context'
import { usePageSetup } from '@/features/editor/use-page-setup'
import { useSettings } from '@/features/settings/settings-context'
import { cn } from '@/lib/utils'

/**
 * Dialog setelan blok daftar isi (§A5.2).
 *
 * Dibuka dari menu tiga-titik blok TOC lewat event DOM yang membawa atribut
 * blok + callback `apply` milik NodeView pemanggil - jadi dialog menulis ke
 * node yang benar tanpa menebak lewat seleksi. Draf lokal diterapkan saat OK:
 * mengganti setelan memicu penyegaran isi + repaginasi blok, dan menjalankannya
 * pada tiap ketukan angka lekukan terbaca kacau.
 *
 * Nomor halaman otomatis dimatikan pada pageless (§A5.3).
 */

/** Satuan panjang mengikuti Setelan (sama seperti Penyiapan halaman & penggaris). */
function fromPx(px: number, unit: 'cm' | 'in'): number {
	return unit === 'cm' ? (px / INCH) * 2.54 : px / INCH
}
function toPx(value: number, unit: 'cm' | 'in'): number {
	return unit === 'cm' ? (value / 2.54) * INCH : value * INCH
}
function roundUnit(value: number): number {
	return Math.round(value * 100) / 100
}

const LEVELS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const

const TAB_LEADERS: ReadonlyArray<{ value: TocTabLeader; label: string; char: string }> = [
	{ value: 'none', label: 'Tidak ada', char: ' ' },
	{ value: 'dots', label: 'Titik-titik', char: '·' },
	{ value: 'dashes', label: 'Tanda pisah', char: '-' },
	{ value: 'line', label: 'Garis bawah', char: '_' },
]

const FIELD_CLASS =
	'w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm text-foreground outline-none transition-colors focus:border-accent disabled:cursor-not-allowed disabled:opacity-50'

/** Satu baris setelan: label kiri, kendali kanan - sejajar di seluruh dialog. */
function Row({
	label,
	hint,
	children,
}: {
	label: string
	hint?: string
	children: React.ReactNode
}) {
	return (
		<div className="grid grid-cols-[9.5rem_1fr] items-start gap-x-4 gap-y-1">
			<span className="pt-1.5 text-xs font-medium text-muted">{label}</span>
			<div className="flex flex-col gap-1">
				{children}
				{hint && <span className="text-[11px] leading-snug text-subtle">{hint}</span>}
			</div>
		</div>
	)
}

export function TocSettingsDialog() {
	const { editor } = useEditorInstance()
	const { setup } = usePageSetup()
	const { settings } = useSettings()
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
	const unit = settings.measurementUnit
	const unitLabel = unit === 'cm' ? 'cm' : 'inci'
	const showPages = draft.showPageNumbers && !pageless
	const leaderChar = TAB_LEADERS.find((entry) => entry.value === draft.tabLeader)?.char ?? ' '

	// Rentang tingkat tidak boleh terbalik: menggeser salah satu ujung mendorong
	// ujung lainnya, bukan menghasilkan rentang kosong yang diam-diam tak berisi.
	const setMinLevel = (value: number) =>
		setDraft((c) => ({ ...c, minLevel: value, maxLevel: Math.max(value, c.maxLevel) }))
	const setMaxLevel = (value: number) =>
		setDraft((c) => ({ ...c, maxLevel: value, minLevel: Math.min(value, c.minLevel) }))

	return (
		<div
			ref={overlayRef}
			role="dialog"
			aria-modal="true"
			aria-label="Setelan daftar isi"
			className="fixed inset-0 z-[70] flex animate-in items-center justify-center bg-black/60 p-4 backdrop-blur-sm fade-in duration-200"
			onClick={(e) => {
				if (e.target === overlayRef.current) setOpen(false)
			}}
		>
			<div className="flex max-h-full w-full max-w-md animate-in flex-col gap-4 overflow-y-auto rounded-2xl border border-line-strong bg-surface-raised p-5 shadow-2xl zoom-in-95 duration-200">
				<h2 className="text-base font-semibold text-foreground">Setelan daftar isi</h2>

				<div className="flex flex-col gap-3">
					{/*
					 * Dua pilihan, bukan tiga: 'plain' dan 'dotted' dirender persis sama
					 * (titik-titik datang dari Pengisi tab, bukan dari sini), jadi
					 * menawarkan keduanya hanya membuat pengguna menebak bedanya. Nilai
					 * lama 'dotted' tetap terbaca sebagai "Teks biasa".
					 */}
					<Row
						label="Gaya butir"
						hint={
							draft.style === 'link'
								? 'Tiap butir jadi tautan yang melompat ke judulnya - ikut berfungsi di PDF hasil cetak.'
								: undefined
						}
					>
						<div className="flex gap-2">
							{(
								[
									{ value: 'plain', label: 'Teks biasa', active: draft.style !== 'link' },
									{ value: 'link', label: 'Tautan ke judul', active: draft.style === 'link' },
								] as const
							).map((option) => (
								<button
									key={option.value}
									type="button"
									onClick={() => setDraft((c) => ({ ...c, style: option.value }))}
									className={cn(
										'flex-1 rounded-lg border px-3 py-1.5 text-sm transition-colors',
										option.active
											? 'border-accent bg-accent/10 text-accent'
											: 'border-line text-muted hover:text-foreground',
									)}
								>
									{option.label}
								</button>
							))}
						</div>
					</Row>

					<Row label="Tingkat judul" hint="Judul di luar rentang ini tidak ikut ke dalam daftar.">
						<div className="flex items-center gap-2">
							<select
								aria-label="Tingkat terendah"
								value={draft.minLevel}
								onChange={(e) => setMinLevel(Number(e.target.value))}
								className={FIELD_CLASS}
							>
								{LEVELS.map((level) => (
									<option key={level} value={level}>
										Judul {level}
									</option>
								))}
							</select>
							<span className="shrink-0 text-xs text-subtle">sampai</span>
							<select
								aria-label="Tingkat tertinggi"
								value={draft.maxLevel}
								onChange={(e) => setMaxLevel(Number(e.target.value))}
								className={FIELD_CLASS}
							>
								{LEVELS.map((level) => (
									<option key={level} value={level}>
										Judul {level}
									</option>
								))}
							</select>
						</div>
					</Row>

					<Row label="Lekukan per tingkat">
						<div className="flex items-center gap-2">
							<input
								type="number"
								min={0}
								step={0.1}
								value={roundUnit(fromPx(draft.indentPerLevel, unit))}
								onChange={(e) =>
									setDraft((c) => ({
										...c,
										indentPerLevel: toPx(Math.max(0, Number(e.target.value) || 0), unit),
									}))
								}
								className={cn(FIELD_CLASS, 'w-24')}
							/>
							<span className="shrink-0 text-xs text-subtle">{unitLabel}</span>
						</div>
					</Row>
				</div>

				<div className="flex flex-col gap-3 border-t border-line pt-4">
					<label className="flex items-start gap-2.5">
						<input
							type="checkbox"
							checked={showPages}
							disabled={pageless}
							onChange={(e) => setDraft((c) => ({ ...c, showPageNumbers: e.target.checked }))}
							className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--accent)] disabled:opacity-50"
						/>
						<span className="flex flex-col gap-0.5">
							<span className="text-sm text-foreground">Tampilkan nomor halaman</span>
							{pageless && (
								<span className="text-[11px] text-subtle">
									Tidak tersedia pada mode tanpa halaman (pageless).
								</span>
							)}
						</span>
					</label>

					{/* Pengisi tab hanya merentang menuju kolom nomor - tanpa nomor
					    halaman ia tidak punya tujuan, jadi ikut dimatikan. */}
					<Row label="Pengisi tab">
						<select
							value={draft.tabLeader}
							disabled={!showPages}
							onChange={(e) => setDraft((c) => ({ ...c, tabLeader: e.target.value as TocTabLeader }))}
							className={FIELD_CLASS}
						>
							{TAB_LEADERS.map((entry) => (
								<option key={entry.value} value={entry.value}>
									{entry.label}
								</option>
							))}
						</select>
					</Row>
				</div>

				{/* Pratinjau: satu baris contoh dengan lekukan, pengisi, dan nomor yang
				    sedang dipilih - lebih cepat dipahami daripada nama setelannya. */}
				<div className="rounded-xl border border-line bg-surface-inset px-3 py-2.5">
					<p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-subtle">
						Pratinjau
					</p>
					<div className="flex flex-col gap-0.5 overflow-hidden text-sm">
						{[
							{ text: 'Pendahuluan', level: 0, page: 1 },
							{ text: 'Latar belakang', level: 1, page: 2 },
						].map((entry) => (
							<div
								key={entry.text}
								className="flex items-baseline gap-2"
								style={{ paddingLeft: `${entry.level * draft.indentPerLevel}px` }}
							>
								<span
									className={cn(
										'shrink-0 truncate',
										draft.style === 'link' ? 'text-accent underline underline-offset-2' : 'text-foreground',
									)}
								>
									{entry.text}
								</span>
								{showPages && draft.tabLeader !== 'none' && (
									<span
										aria-hidden
										className="min-w-4 flex-1 select-none overflow-hidden whitespace-nowrap tracking-[2px] text-faint"
									>
										{leaderChar.repeat(200)}
									</span>
								)}
								{showPages && (
									<span
										className={cn(
											'shrink-0 tabular-nums text-subtle',
											draft.tabLeader === 'none' && 'ml-auto',
										)}
									>
										{entry.page}
									</span>
								)}
							</div>
						))}
					</div>
				</div>

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
