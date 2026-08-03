'use client'

import type { Editor } from '@tiptap/react'
import { Check, Clipboard, Copy, FileText, Trash2, Upload, X } from 'lucide-react'
import { useCallback, useRef, useState } from 'react'
import { useDocument } from '@/features/document/document-context'
import { useGrammarCheck } from '@/features/grammar/use-grammar-check'
import { useSettings } from '@/features/settings/settings-context'
import { cn, countWords } from '@/lib/utils'
import { EditorToolbar } from './editor-toolbar'
import { TiptapEditor } from './tiptap-editor'

const ACCEPTED_FILE_TYPES = '.txt,.pdf,.docx'

/** TXT dibaca di browser supaya isinya langsung terlihat; PDF/DOCX diekstrak worker. */
function isPlainTextFile(file: File): boolean {
	return file.type === 'text/plain' || file.name.toLowerCase().endsWith('.txt')
}

export function DocumentEditor() {
	const { state, dispatch } = useDocument()
	const { settings } = useSettings()
	const { isRunning, error } = useGrammarCheck()

	const containerRef = useRef<HTMLDivElement>(null)
	const fileInputRef = useRef<HTMLInputElement>(null)
	const [editor, setEditor] = useState<Editor | null>(null)
	const [copied, setCopied] = useState(false)

	const handleReady = useCallback((instance: Editor | null) => setEditor(instance), [])

	const copyText = async () => {
		try {
			await navigator.clipboard.writeText(state.text)
			setCopied(true)
			setTimeout(() => setCopied(false), 2000)
		} catch {
			// clipboard ditolak browser — abaikan
		}
	}

	const pasteFromClipboard = async () => {
		try {
			const text = await navigator.clipboard.readText()
			if (text) dispatch({ type: 'setText', text })
		} catch {
			// izin clipboard ditolak — pengguna masih bisa menempel manual
		}
	}

	const handleFile = (event: React.ChangeEvent<HTMLInputElement>) => {
		const file = event.target.files?.[0]
		event.target.value = ''
		if (!file) return

		if (!isPlainTextFile(file)) {
			dispatch({ type: 'setFile', file })
			return
		}

		const reader = new FileReader()
		reader.onload = () => {
			const text = reader.result
			if (typeof text === 'string') dispatch({ type: 'setText', text })
		}
		reader.readAsText(file)
	}

	return (
		<div
			ref={containerRef}
			className="relative flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-line bg-surface"
		>
			{/* Kepala dokumen */}
			<div className="flex shrink-0 items-center gap-3 px-6 pb-3 pt-4">
				<input
					value={state.title}
					onChange={(event) => dispatch({ type: 'setTitle', title: event.target.value })}
					placeholder="Untitled document"
					aria-label="Judul dokumen"
					className="min-w-0 flex-1 border-none bg-transparent text-lg font-semibold text-foreground outline-none placeholder:text-faint"
				/>

				{settings.showWordCount && !state.file && (
					<span className="shrink-0 text-xs text-subtle">
						{countWords(state.text)} kata · {state.text.length} karakter
					</span>
				)}

				<div className="flex shrink-0 items-center gap-1">
					<button
						type="button"
						aria-label="Unggah dokumen"
						title="Unggah dokumen"
						onClick={() => fileInputRef.current?.click()}
						className="rounded-md p-1.5 text-subtle transition-colors hover:bg-[var(--overlay-hover)] hover:text-foreground"
					>
						<Upload className="h-4 w-4" />
					</button>
					<button
						type="button"
						aria-label="Tempel teks"
						title="Tempel teks"
						onClick={pasteFromClipboard}
						className="rounded-md p-1.5 text-subtle transition-colors hover:bg-[var(--overlay-hover)] hover:text-foreground"
					>
						<Clipboard className="h-4 w-4" />
					</button>
					<button
						type="button"
						aria-label="Salin teks"
						title="Salin teks"
						onClick={copyText}
						className={cn(
							'rounded-md p-1.5 transition-colors hover:bg-[var(--overlay-hover)]',
							copied ? 'text-green-600' : 'text-subtle hover:text-foreground',
						)}
					>
						{copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
					</button>
					<button
						type="button"
						aria-label="Bersihkan dokumen"
						title="Bersihkan dokumen"
						onClick={() => dispatch({ type: 'clear' })}
						className="rounded-md p-1.5 text-subtle transition-colors hover:bg-[var(--overlay-hover)] hover:text-red-500"
					>
						<Trash2 className="h-4 w-4" />
					</button>
				</div>
			</div>

			{/* Toolbar format */}
			<div className="shrink-0 border-y border-line bg-surface px-4 py-2">
				<EditorToolbar editor={editor} disabled={isRunning || state.file !== null} />
			</div>

			{error && (
				<div className="mx-4 mt-2 shrink-0 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2">
					<p className="text-xs text-red-600">{error.message}</p>
				</div>
			)}

			{/* Kanvas: halaman putih melayang di atas latar abu, seperti Google Docs */}
			<div className="min-h-0 flex-1 overflow-y-auto bg-surface-sunken">
				{state.file ? (
					<div className="flex h-full items-center justify-center px-6">
						<div className="flex max-w-full items-center gap-3 rounded-2xl border border-line bg-surface-raised px-5 py-4 shadow-[var(--page-shadow)]">
							<FileText className="h-6 w-6 shrink-0 text-accent" />
							<div className="min-w-0">
								<p className="truncate text-sm text-foreground">{state.file.name}</p>
								<p className="text-xs text-subtle">
									{(state.file.size / 1024).toFixed(0)} KB · siap dicek
								</p>
							</div>
							<button
								type="button"
								aria-label="Hapus dokumen"
								onClick={() => dispatch({ type: 'setFile', file: null })}
								className="ml-2 shrink-0 text-subtle transition-colors hover:text-foreground"
							>
								<X className="h-4 w-4" />
							</button>
						</div>
					</div>
				) : (
					<div className="flex justify-center px-6 py-8">
						<div className="document-page">
							<TiptapEditor
								fontSize={settings.editorFontSize}
								containerRef={containerRef}
								onReady={handleReady}
							/>
						</div>
					</div>
				)}
			</div>

			<input
				ref={fileInputRef}
				type="file"
				accept={ACCEPTED_FILE_TYPES}
				className="hidden"
				onChange={handleFile}
			/>
		</div>
	)
}
