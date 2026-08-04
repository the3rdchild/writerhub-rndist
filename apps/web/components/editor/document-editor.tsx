'use client'

import { Clipboard, FileText, Upload, X } from 'lucide-react'
import { useRef } from 'react'
import { useDocument } from '@/features/document/document-context'
import { useEditorInstance } from '@/features/editor/editor-context'
import { useGrammarCheck } from '@/features/grammar/use-grammar-check'
import { useSettings } from '@/features/settings/settings-context'
import { countWords } from '@/lib/utils'
import { DocumentCanvas } from './document-canvas'

const ACCEPTED_FILE_TYPES = '.txt,.pdf,.docx'

/** TXT dibaca di browser supaya isinya langsung terlihat; PDF/DOCX diekstrak worker. */
function isPlainTextFile(file: File): boolean {
	return file.type === 'text/plain' || file.name.toLowerCase().endsWith('.txt')
}

/**
 * Area dokumen: kanvas berhalaman, ditambah keadaan khusus saat ada berkas
 * menunggu diproses dan bilah status di bawah.
 *
 * Judul, menu, dan toolbar sudah pindah ke TopBar, jadi komponen ini kini
 * hanya mengurus dokumennya sendiri.
 */
export function DocumentEditor() {
	const { state, dispatch } = useDocument()
	const { settings } = useSettings()
	const { setEditor } = useEditorInstance()
	const { error } = useGrammarCheck()

	const containerRef = useRef<HTMLDivElement>(null)
	const fileInputRef = useRef<HTMLInputElement>(null)

	const pasteFromClipboard = async () => {
		try {
			const text = await navigator.clipboard.readText()
			if (text) dispatch({ type: 'setText', text })
		} catch {
			// izin clipboard ditolak - pengguna masih bisa menempel manual
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
			className="relative flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl bg-surface-sunken"
		>
			{error && (
				<div className="mx-4 mt-3 shrink-0 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2">
					<p className="text-xs text-red-600">{error.message}</p>
				</div>
			)}

			{state.file ? (
				<div className="flex flex-1 items-center justify-center px-6">
					<div className="flex max-w-full items-center gap-3 rounded-2xl bg-surface-raised px-5 py-4 shadow-[var(--page-shadow)]">
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
				<DocumentCanvas containerRef={containerRef} onReady={setEditor} />
			)}

			<div className="flex shrink-0 items-center gap-3 bg-surface px-4 py-1.5">
				{settings.showWordCount && !state.file && (
					<span className="text-xs text-subtle">
						{countWords(state.text)} words · {state.text.length} characters
					</span>
				)}

				<div className="ml-auto flex items-center gap-1">
					<StatusButton icon={Upload} label="Unggah dokumen" onClick={() => fileInputRef.current?.click()} />
					<StatusButton icon={Clipboard} label="Tempel teks" onClick={pasteFromClipboard} />
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

function StatusButton({
	icon: Icon,
	label,
	onClick,
}: {
	icon: React.ComponentType<{ className?: string }>
	label: string
	onClick: () => void
}) {
	return (
		<button
			type="button"
			aria-label={label}
			title={label}
			onClick={onClick}
			className="rounded-md p-1.5 text-subtle transition-colors hover:bg-[var(--overlay-hover)] hover:text-foreground"
		>
			<Icon className="h-4 w-4" />
		</button>
	)
}
