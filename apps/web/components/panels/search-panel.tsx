'use client'

import { ChevronDown, ChevronUp } from 'lucide-react'
import { useEffect, useMemo, useRef } from 'react'
import { useDocument } from '@/features/document/document-context'
import { useEditorInstance } from '@/features/editor/editor-context'
import { paginationKey } from '@/features/editor/pagination'
import { useSearch } from '@/features/editor/search-context'
import type { SearchModifiers } from '@/features/editor/search-replace'
import { useSessions } from '@/features/sessions/session-context'
import { cn } from '@/lib/utils'
import { PanelScroll } from './panel-parts'

const FIELD_CLASS =
	'w-full rounded-lg border border-line bg-surface-raised px-2.5 py-1.5 text-foreground text-sm outline-none transition-colors focus:border-accent'

const OPTIONS: ReadonlyArray<{ key: keyof SearchModifiers; label: string }> = [
	{ key: 'caseSensitive', label: 'Cocokkan huruf besar/kecil' },
	{ key: 'regex', label: 'Gunakan ekspresi reguler' },
	{ key: 'wholeWord', label: 'Kata utuh saja' },
	{ key: 'ignoreDiacritics', label: 'Abaikan diakritik (ä = a)' },
]

/*
 * Naskah panjang bisa punya ribuan kemunculan; yang dirender dibatasi karena
 * daftar sepanjang itu tidak pernah dibaca sampai habis, sementara memotong
 * konteks untuk tiap barisnya tetap dibayar penuh.
 */
const MAX_ROWS = 200
const CONTEXT_CHARS = 32

interface ResultRow {
	index: number
	before: string
	match: string
	after: string
	clippedStart: boolean
	/** `null` di mode tanpa halaman atau sebelum paginasi selesai. */
	page: number | null
}

/**
 * Wajah lengkap cari & ganti, tinggal di rail kanan.
 *
 * Alasannya dia panel dan bukan dialog: panel menyempitkan kertas alih-alih
 * menimpanya, jadi naskah tetap terbaca sambil hasilnya ditelusuri - dan ruang
 * yang didapat dipakai untuk hal yang tidak muat di bilah ringkas, yaitu daftar
 * seluruh kemunculan beserta halamannya.
 */
export function SearchPanelBody() {
	const { controls, focusTick, closeSearch } = useSearch()
	const { editor } = useEditorInstance()
	const { sessions, activeId } = useSessions()
	const { state } = useDocument()
	const inputRef = useRef<HTMLInputElement>(null)

	// biome-ignore lint/correctness/useExhaustiveDependencies: focusTick memang cuma pemicu - naiknya angka itulah sinyal "fokuskan lagi"
	useEffect(
		function focusOnOpen() {
			inputRef.current?.focus()
			inputRef.current?.select()
		},
		[focusTick],
	)

	const {
		search,
		setSearch,
		replace,
		setReplace,
		modifiers,
		toggleModifier,
		results,
		activeIndex,
		invalidRegex,
		goNext,
		goPrevious,
		goToResult,
		runReplace,
		runReplaceAll,
	} = controls

	const total = results.length
	const scopeLabel =
		sessions.find((tab) => tab.id === activeId)?.title || state.title || 'Dokumen tanpa judul'

	const rows = useMemo<ResultRow[]>(
		function buildRows() {
			if (!editor || editor.isDestroyed || total === 0) return []
			const { doc } = editor.state
			const pagination = paginationKey.getState(editor.state)
			const blockPages = pagination?.pageless ? [] : (pagination?.blockPages ?? [])

			/* Hasil dan daftar blok sama-sama urut menaik, jadi halamannya dicari
			 * sambil berjalan - bukan menyapu ulang seluruh daftar blok per hasil. */
			let block = 0
			let sheet: number | null = null

			return results.slice(0, MAX_ROWS).map((result, index) => {
				while (block < blockPages.length && blockPages[block].pos <= result.from) {
					sheet = blockPages[block].page
					block += 1
				}
				const start = Math.max(0, result.from - CONTEXT_CHARS)
				return {
					index,
					before: doc.textBetween(start, result.from, ' ', ' '),
					match: result.text,
					after: doc.textBetween(result.to, Math.min(doc.content.size, result.to + CONTEXT_CHARS), ' ', ' '),
					clippedStart: start > 0,
					page: sheet === null ? null : sheet + 1,
				}
			})
		},
		[editor, results, total],
	)

	const onFieldKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
		if (event.key === 'Escape') {
			event.preventDefault()
			closeSearch()
			return
		}
		if (event.key !== 'Enter') return
		event.preventDefault()
		if (event.shiftKey) goPrevious()
		else goNext()
	}

	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<div className="flex shrink-0 flex-col gap-2 border-line border-b px-4 pb-3">
				<input
					ref={inputRef}
					type="text"
					value={search}
					onChange={(event) => setSearch(event.target.value)}
					onKeyDown={onFieldKeyDown}
					placeholder="Cari"
					aria-label="Cari"
					aria-invalid={invalidRegex}
					className={cn(FIELD_CLASS, invalidRegex && 'border-red-500 focus:border-red-500')}
				/>
				<input
					type="text"
					value={replace}
					onChange={(event) => setReplace(event.target.value)}
					onKeyDown={onFieldKeyDown}
					placeholder="Ganti dengan"
					aria-label="Ganti dengan"
					className={FIELD_CLASS}
				/>

				<div className="flex items-center gap-1">
					<button
						type="button"
						onClick={runReplace}
						disabled={total === 0}
						className="rounded-lg border border-line px-2.5 py-1 text-muted text-xs transition-colors hover:bg-[var(--overlay-hover)] hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
					>
						Ganti
					</button>
					<button
						type="button"
						onClick={runReplaceAll}
						disabled={total === 0}
						className="rounded-lg border border-line px-2.5 py-1 text-muted text-xs transition-colors hover:bg-[var(--overlay-hover)] hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
					>
						Ganti semua
					</button>
					<span className="ml-auto flex items-center gap-0.5">
						<button
							type="button"
							title="Sebelumnya (Shift+Enter)"
							aria-label="Hasil sebelumnya"
							disabled={total === 0}
							onClick={goPrevious}
							className="flex h-7 w-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-[var(--overlay-hover)] hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
						>
							<ChevronUp className="h-4 w-4" />
						</button>
						<button
							type="button"
							title="Berikutnya (Enter)"
							aria-label="Hasil berikutnya"
							disabled={total === 0}
							onClick={goNext}
							className="flex h-7 w-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-[var(--overlay-hover)] hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
						>
							<ChevronDown className="h-4 w-4" />
						</button>
					</span>
				</div>

				<div className="flex flex-col gap-1 pt-1">
					{OPTIONS.map((option) => (
						<label key={option.key} className="flex items-center gap-2">
							<input
								type="checkbox"
								checked={modifiers[option.key]}
								onChange={() => toggleModifier(option.key)}
								className="h-3.5 w-3.5 shrink-0 accent-[var(--accent)]"
							/>
							<span className="text-foreground text-xs">{option.label}</span>
						</label>
					))}
				</div>

				{/* Cakupannya selalu tab yang sedang dibuka - tab lain punya naskahnya
				    sendiri dan tidak ikut tersentuh, jadi judulnya disebut apa adanya. */}
				<p className="truncate text-[11px] text-subtle" title={scopeLabel}>
					Tab ini: {scopeLabel}
				</p>
			</div>

			<PanelScroll className="gap-1 p-2">
				<p className={cn('px-1 pb-1 text-[11px]', invalidRegex ? 'text-red-400' : 'text-subtle')}>
					{invalidRegex
						? 'Pola regex tidak sah - periksa tanda kurung dan pelolosnya.'
						: !search
							? 'Ketik kata kunci untuk melihat daftar kemunculannya.'
							: total === 0
								? 'Tidak ada hasil.'
								: `${total} hasil`}
				</p>

				{rows.map((row) => (
					<button
						key={`${row.index}-${row.match}`}
						type="button"
						onClick={() => goToResult(row.index)}
						className={cn(
							'flex w-full items-start gap-2 rounded-lg border px-2.5 py-1.5 text-left transition-colors',
							row.index === activeIndex
								? 'border-accent bg-accent/10'
								: 'border-line bg-surface-raised hover:bg-[var(--overlay-hover)]',
						)}
					>
						<span className="min-w-0 flex-1 text-xs leading-relaxed">
							<span className="text-subtle">
								{row.clippedStart && '…'}
								{row.before}
							</span>
							<mark className="rounded bg-amber-500/30 px-0.5 text-foreground">{row.match}</mark>
							<span className="text-subtle">{row.after}</span>
						</span>
						{row.page !== null && (
							<span className="shrink-0 pt-0.5 text-[10px] text-faint tabular-nums">Hal. {row.page}</span>
						)}
					</button>
				))}

				{total > MAX_ROWS && (
					<p className="px-1 pt-1 text-[11px] text-subtle">
						{total - MAX_ROWS} hasil lain tidak ditampilkan - persempit kata kuncinya, atau pakai Ganti semua
						kalau memang semuanya hendak diganti.
					</p>
				)}
			</PanelScroll>
		</div>
	)
}
