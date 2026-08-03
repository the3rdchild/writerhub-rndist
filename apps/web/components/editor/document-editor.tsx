'use client'

import { Check, Clipboard, Copy, FileText, Trash2, Upload, X } from 'lucide-react'
import { useRef, useState } from 'react'
import { useDocument } from '@/features/document/document-context'
import { useGrammarCheck } from '@/features/grammar/use-grammar-check'
import { useSettings } from '@/features/settings/settings-context'
import { cn, countWords } from '@/lib/utils'
import { EditableSurface } from './editable-surface'
import { EditorToolbar } from './editor-toolbar'

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
	const editableRef = useRef<HTMLDivElement>(null)
	const fileInputRef = useRef<HTMLInputElement>(null)
	const [copied, setCopied] = useState(false)

	const isEmpty = state.text.trim() === ''

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
			className="relative flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-line bg-surface-raised"
		>
			<div className="shrink-0 px-6 pb-2 pt-5">
				<input
					value={state.title}
					onChange={(event) => dispatch({ type: 'setTitle', title: event.target.value })}
					placeholder="Untitled document"
					aria-label="Judul dokumen"
					className="w-full border-none bg-transparent text-xl font-bold text-foreground outline-none placeholder:text-faint"
				/>
			</div>

			<div className="mx-6 shrink-0 border-t border-line" />

			<div className="relative mx-3 mb-1 min-h-0 flex-1 overflow-hidden rounded-xl bg-surface-sunken">
				{state.file ? (
					<div className="absolute inset-0 flex items-center justify-center px-6">
						<div className="flex max-w-full items-center gap-3 rounded-2xl border border-line-strong bg-surface px-5 py-4">
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
					<>
						{isEmpty && (
							<div className="pointer-events-none absolute left-8 top-10 z-10">
								<p className="mb-5 text-sm text-subtle">Tempel teks atau unggah dokumen Anda</p>
								<div className="pointer-events-auto flex gap-3">
									<button
										type="button"
										onClick={() => fileInputRef.current?.click()}
										className="flex items-center gap-2 rounded-full bg-accent px-4 py-2 text-sm text-accent-foreground transition-colors hover:bg-accent-hover"
									>
										<Upload className="h-4 w-4" />
										Upload File
									</button>
									<button
										type="button"
										onClick={pasteFromClipboard}
										className="flex items-center gap-2 rounded-full bg-accent px-4 py-2 text-sm text-accent-foreground transition-colors hover:bg-accent-hover"
									>
										<Clipboard className="h-4 w-4" />
										Paste Text
									</button>
								</div>
							</div>
						)}
						<EditableSurface
							fontSize={settings.editorFontSize}
							containerRef={containerRef}
							editableRef={editableRef}
						/>
					</>
				)}
			</div>

			{error && (
				<div className="mx-5 mb-1 shrink-0 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2">
					<p className="text-xs text-red-400">{error.message}</p>
				</div>
			)}

			<div className="flex shrink-0 flex-col gap-2.5 border-t border-line px-4 py-2.5">
				<div className="flex items-center justify-center">
					<EditorToolbar disabled={isRunning || state.file !== null} editorRef={editableRef} />
				</div>

				<div className="flex items-center gap-3">
					{state.file ? (
						<span className="text-xs text-subtle">Dokumen terlampir</span>
					) : (
						settings.showWordCount && (
							<div className="flex items-center gap-2 text-xs text-subtle">
								<span>{countWords(state.text)} kata</span>
								<span className="text-faint">·</span>
								<span>{state.text.length} karakter</span>
							</div>
						)
					)}

					<button
						type="button"
						aria-label="Bersihkan"
						title="Bersihkan"
						onClick={() => dispatch({ type: 'clear' })}
						className="text-subtle transition-colors hover:text-foreground"
					>
						<Trash2 className="h-4 w-4" />
					</button>

					{!isEmpty && (
						<button
							type="button"
							aria-label="Salin teks"
							onClick={copyText}
							className={cn(
								'flex items-center gap-1 rounded-lg border px-2 py-1 text-xs transition-colors',
								copied
									? 'border-green-400/30 bg-green-400/10 text-green-400'
									: 'border-line-strong text-muted hover:text-foreground',
							)}
						>
							{copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
							{copied ? 'Tersalin!' : 'Salin'}
						</button>
					)}
				</div>
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
