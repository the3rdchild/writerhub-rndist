'use client'

import type { Editor } from '@tiptap/react'
import { ChevronDown, ChevronUp, Regex, Replace, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { searchAndReplacePluginKey } from '@/features/editor/search-replace'
import { cn } from '@/lib/utils'

export function SearchBar({ editor, onClose }: { editor: Editor; onClose: () => void }) {
	const [search, setSearch] = useState('')
	const [replace, setReplace] = useState('')
	const [caseSensitive, setCaseSensitive] = useState(false)
	const [count, setCount] = useState({ index: 0, total: 0 })
	useEffect(
		function pushSearchTerm() {
			editor.commands.setSearchTerm(search)
		},
		[editor, search],
	)
	useEffect(
		function pushReplaceTerm() {
			editor.commands.setReplaceTerm(replace)
		},
		[editor, replace],
	)
	useEffect(
		function pushCaseSensitivity() {
			editor.commands.setCaseSensitive(caseSensitive)
		},
		[editor, caseSensitive],
	)
	useEffect(
		function readMatchCount() {
			const readResults = () => {
				const storage = (editor.storage as { searchAndReplace?: { results: unknown[]; resultIndex: number } })
					.searchAndReplace
				if (storage) {
					setCount({ index: storage.resultIndex + 1, total: storage.results.length })
				}
			}
			readResults()
			editor.on('transaction', readResults)
			return () => {
				editor.off('transaction', readResults)
			}
		},
		[editor],
	)
	const close = () => {
		editor.commands.setSearchTerm('')
		onClose()
	}

	return (
		<div className="flex flex-col gap-2 rounded-xl border border-line bg-surface-raised p-2 shadow-sm sm:flex-row sm:items-center">
			<div className="flex items-center gap-1">
				<input
					type="text"
					value={search}
					onChange={(e) => setSearch(e.target.value)}
					placeholder="Cari…"
					className="w-40 rounded-md border border-line bg-surface px-2 py-1 text-sm outline-none focus:border-accent"
				/>
				<button
					type="button"
					title="Bedakan huruf besar/kecil"
					aria-label="Bedakan huruf besar/kecil"
					aria-pressed={caseSensitive}
					onClick={() => setCaseSensitive((v) => !v)}
					className={cn(
						'flex h-7 w-7 items-center justify-center rounded-md transition-colors',
						caseSensitive ? 'bg-accent/15 text-accent' : 'text-muted hover:bg-[var(--overlay-hover)]',
					)}
				>
					<Regex className="h-4 w-4" />
				</button>
			</div>
			<span className="text-xs tabular-nums text-muted">
				{count.total > 0 ? `${count.index}/${count.total}` : '0/0'}
			</span>
			<div className="flex items-center gap-0.5">
				<button
					type="button"
					title="Sebelumnya"
					aria-label="Sebelumnya"
					onClick={() => editor.commands.previousSearchResult()}
					className="flex h-7 w-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-[var(--overlay-hover)] hover:text-foreground"
				>
					<ChevronUp className="h-4 w-4" />
				</button>
				<button
					type="button"
					title="Berikutnya"
					aria-label="Berikutnya"
					onClick={() => editor.commands.nextSearchResult()}
					className="flex h-7 w-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-[var(--overlay-hover)] hover:text-foreground"
				>
					<ChevronDown className="h-4 w-4" />
				</button>
			</div>
			<div className="hidden items-center gap-1 sm:flex">
				<input
					type="text"
					value={replace}
					onChange={(e) => setReplace(e.target.value)}
					placeholder="Ganti…"
					className="w-40 rounded-md border border-line bg-surface px-2 py-1 text-sm outline-none focus:border-accent"
				/>
				<button
					type="button"
					title="Ganti satu"
					onClick={() => editor.commands.replace()}
					className="flex h-7 items-center gap-1 rounded-md px-2 text-xs text-muted transition-colors hover:bg-[var(--overlay-hover)] hover:text-foreground"
				>
					<Replace className="h-3.5 w-3.5" /> Ganti
				</button>
				<button
					type="button"
					title="Ganti semua"
					onClick={() => editor.commands.replaceAll()}
					className="flex h-7 items-center rounded-md px-2 text-xs text-muted transition-colors hover:bg-[var(--overlay-hover)] hover:text-foreground"
				>
					Semua
				</button>
			</div>
			<button
				type="button"
				title="Tutup"
				aria-label="Tutup"
				onClick={close}
				className="ml-auto flex h-7 w-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-[var(--overlay-hover)] hover:text-foreground"
			>
				<X className="h-4 w-4" />
			</button>
		</div>
	)
}

export { searchAndReplacePluginKey }
