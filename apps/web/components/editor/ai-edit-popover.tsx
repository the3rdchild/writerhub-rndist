'use client'

import type { Editor } from '@tiptap/react'
import { ArrowUp, Check, Loader2, X } from 'lucide-react'
import { useRef, useState } from 'react'
import { streamChat } from '@/features/chat/api'
import { replaceTextRange } from '@/features/editor/apply-text'
import { type EditorSelection, selectionTextRange } from '@/features/editor/selection'
import { cn } from '@/lib/utils'

/**
 * Menulis ulang bagian yang disorot menurut instruksi bebas.
 *
 * Memakai jalur percakapan yang sama dengan panel AI Chat, tapi hasilnya tidak
 * masuk ke transkrip: yang diinginkan pengguna di sini bukan jawaban, melainkan
 * teks pengganti. Karena itu tampilannya kartu diff dengan Apply, sama seperti
 * modul lain — tidak ada suntingan yang terjadi tanpa dilihat lebih dulu.
 */

const PRESETS = ['Make it shorter', 'Make it clearer', 'More formal', 'Fix grammar only']

export function AiEditPopover({
	editor,
	selection,
	onClose,
}: {
	editor: Editor
	selection: EditorSelection
	onClose: () => void
}) {
	const [instruction, setInstruction] = useState('')
	const [result, setResult] = useState<string | null>(null)
	const [isRunning, setIsRunning] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [applied, setApplied] = useState(false)
	const abortRef = useRef<AbortController | null>(null)

	const run = async (prompt: string) => {
		const trimmed = prompt.trim()
		if (!trimmed || isRunning) return

		abortRef.current?.abort()
		const controller = new AbortController()
		abortRef.current = controller

		setIsRunning(true)
		setError(null)
		setResult('')
		setApplied(false)

		let answer = ''
		try {
			await streamChat(
				{
					messages: [
						{
							role: 'user',
							content: `Rewrite the selected text. Instruction: ${trimmed}\n\nReturn ONLY the rewritten text, with no explanation and no code fence.`,
						},
					],
					context: { selection: selection.text },
				},
				(delta) => {
					answer += delta
					setResult(answer)
				},
				controller.signal,
			)
		} catch (cause) {
			if (!controller.signal.aborted) {
				setError(cause instanceof Error ? cause.message : 'AI Edit gagal')
				setResult(null)
			}
		} finally {
			setIsRunning(false)
			abortRef.current = null
		}
	}

	const apply = () => {
		if (!result) return
		const range = selectionTextRange(editor, selection)
		const ok = range
			? replaceTextRange(
					editor,
					{ offset: range.offset, length: range.length, expected: selection.text },
					result.trim(),
				)
			: false

		if (ok) {
			setApplied(true)
			onClose()
		} else {
			setError('Teks aslinya sudah berubah — pilih ulang bagiannya')
		}
	}

	return (
		<div className="flex w-[320px] flex-col gap-2 rounded-xl border border-line-strong bg-surface-raised p-3 shadow-[var(--menu-shadow)]">
			<div className="flex items-center justify-between">
				<span className="text-xs font-semibold text-foreground">AI Edit</span>
				<button
					type="button"
					onClick={onClose}
					aria-label="Tutup"
					className="text-subtle transition-colors hover:text-foreground"
				>
					<X className="h-3.5 w-3.5" />
				</button>
			</div>

			<div className="flex items-center gap-1.5 rounded-lg bg-[var(--overlay-hover)] px-2 py-1.5">
				<input
					value={instruction}
					onChange={(event) => setInstruction(event.target.value)}
					onKeyDown={(event) => {
						if (event.key === 'Enter') {
							event.preventDefault()
							void run(instruction)
						}
					}}
					placeholder="How should this change?"
					aria-label="Instruksi"
					className="min-w-0 flex-1 bg-transparent text-xs text-foreground outline-none placeholder:text-faint"
				/>
				<button
					type="button"
					onClick={() => void run(instruction)}
					disabled={!instruction.trim() || isRunning}
					aria-label="Jalankan"
					className={cn(
						'flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition-colors',
						instruction.trim() && !isRunning
							? 'bg-accent text-accent-foreground'
							: 'cursor-not-allowed bg-accent/30 text-white/50',
					)}
				>
					{isRunning ? <Loader2 className="h-3 w-3 animate-spin" /> : <ArrowUp className="h-3 w-3" />}
				</button>
			</div>

			{result === null && !error && (
				<div className="flex flex-wrap gap-1">
					{PRESETS.map((preset) => (
						<button
							key={preset}
							type="button"
							onClick={() => {
								setInstruction(preset)
								void run(preset)
							}}
							className="rounded-full bg-[var(--overlay-hover)] px-2.5 py-1 text-[11px] text-muted transition-colors hover:text-foreground"
						>
							{preset}
						</button>
					))}
				</div>
			)}

			{error && <p className="rounded-lg bg-red-400/10 px-2 py-1.5 text-[11px] text-red-400">{error}</p>}

			{result !== null && (
				<>
					<div className="max-h-48 overflow-y-auto rounded-lg bg-[var(--overlay-hover)] px-2.5 py-2">
						<p className="whitespace-pre-wrap break-words text-xs leading-relaxed text-emerald-300">
							{result}
							{isRunning && <span className="ml-0.5 animate-pulse text-accent">▍</span>}
						</p>
					</div>

					{!isRunning && result.trim() && (
						<button
							type="button"
							onClick={apply}
							disabled={applied}
							className="flex items-center justify-center gap-1 rounded-lg bg-green-500/15 py-1.5 text-xs text-green-400 transition-colors hover:bg-green-500/25"
						>
							<Check className="h-3.5 w-3.5" />
							Replace selection
						</button>
					)}
				</>
			)}
		</div>
	)
}
