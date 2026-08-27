'use client'

import type { Editor } from '@tiptap/react'
import { Check, Trash2, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { MATH_BLOCK, MATH_INLINE, renderMath } from '@/features/editor/math'
import { cn } from '@/lib/utils'

export function MathPopover({
	editor,
	containerRef,
}: {
	editor: Editor | null
	containerRef: React.RefObject<HTMLDivElement | null>
}) {
	const [target, setTarget] = useState<{
		pos: number
		display: boolean
		top: number
		left: number
	} | null>(null)
	const [latex, setLatex] = useState('')
	const inputRef = useRef<HTMLTextAreaElement>(null)
	useEffect(
		function openPopoverOnFormulaClick() {
			const root = editor?.view.dom
			const container = containerRef.current
			if (!root || !container || !editor) return

			const onClick = (event: MouseEvent) => {
				const element = (event.target as HTMLElement).closest<HTMLElement>('[data-latex]')
				if (!element) {
					setTarget(null)
					return
				}

				const pos = editor.view.posAtDOM(element, 0)
				const node = editor.state.doc.nodeAt(pos)
				if (!node || (node.type.name !== MATH_INLINE && node.type.name !== MATH_BLOCK)) return

				const rect = element.getBoundingClientRect()
				const bounds = container.getBoundingClientRect()

				setLatex(node.attrs.latex ?? '')
				setTarget({
					pos,
					display: node.type.name === MATH_BLOCK,
					top: rect.bottom - bounds.top + 8,
					left: Math.max(8, Math.min(rect.left - bounds.left, bounds.width - 320)),
				})
			}

			root.addEventListener('click', onClick)
			return () => root.removeEventListener('click', onClick)
		},
		[editor, containerRef],
	)

	useEffect(
		function focusInputOnTarget() {
			if (target) inputRef.current?.focus()
		},
		[target],
	)

	if (!editor || !target || !containerRef.current) return null

	const close = () => setTarget(null)

	const save = () => {
		const trimmed = latex.trim()
		if (!trimmed) return

		const transaction = editor.state.tr.setNodeAttribute(target.pos, 'latex', trimmed)
		editor.view.dispatch(transaction)
		close()
	}
	const toText = () => {
		const node = editor.state.doc.nodeAt(target.pos)
		if (!node) return

		const source = target.display ? `$$${latex}$$` : `$${latex}$`
		editor
			.chain()
			.focus()
			.insertContentAt({ from: target.pos, to: target.pos + node.nodeSize }, source)
			.run()
		close()
	}
	return createPortal(
		<div
			className="absolute z-40 flex w-[320px] flex-col gap-2 rounded-xl border border-line-strong bg-surface-raised p-3 shadow-[var(--menu-shadow)]"
			style={{ top: target.top, left: target.left }}
			onMouseDown={(event) => event.preventDefault()}
		>
			<div className="flex items-center justify-between">
				<span className="text-xs font-semibold text-foreground">
					{target.display ? 'Rumus blok' : 'Rumus inline'}
				</span>
				<button
					type="button"
					onClick={close}
					aria-label="Tutup"
					className="text-subtle transition-colors hover:text-foreground"
				>
					<X className="h-3.5 w-3.5" />
				</button>
			</div>

			<textarea
				ref={inputRef}
				value={latex}
				onChange={(event) => setLatex(event.target.value)}
				onKeyDown={(event) => {
					if (event.key === 'Enter' && !event.shiftKey) {
						event.preventDefault()
						save()
					} else if (event.key === 'Escape') {
						close()
					}
				}}
				rows={2}
				spellCheck={false}
				aria-label="Sumber LaTeX"
				className="resize-none rounded-lg bg-[var(--overlay-hover)] px-2.5 py-2 font-mono text-xs text-foreground outline-none"
			/>

			{/* Pratinjau dari sumber yang sedang diketik, bukan dari yang tersimpan. */}
			<div
				className="min-h-[2.2rem] overflow-x-auto rounded-lg bg-[var(--overlay-hover)] px-2.5 py-2 text-center"
				dangerouslySetInnerHTML={{ __html: renderMath(latex, target.display) }}
			/>

			<div className="flex gap-1.5">
				<button
					type="button"
					onClick={save}
					disabled={!latex.trim()}
					className={cn(
						'flex flex-1 items-center justify-center gap-1 rounded-lg py-1.5 text-xs transition-colors',
						latex.trim()
							? 'bg-green-500/15 text-green-400 hover:bg-green-500/25'
							: 'cursor-not-allowed bg-green-500/5 text-green-400/30',
					)}
				>
					<Check className="h-3.5 w-3.5" />
					Simpan
				</button>
				<button
					type="button"
					onClick={toText}
					title="Kembalikan jadi teks LaTeX"
					className="flex items-center justify-center gap-1 rounded-lg bg-[var(--overlay-hover)] px-2.5 py-1.5 text-xs text-muted transition-colors hover:text-foreground"
				>
					<Trash2 className="h-3.5 w-3.5" />
					Jadikan teks
				</button>
			</div>
		</div>,
		containerRef.current,
	)
}
