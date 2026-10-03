'use client'

import type { Editor } from '@tiptap/react'
import { Check, Code, Trash2, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { MATH_BLOCK, MATH_INLINE, onMathEditorRequest, renderMath } from '@/features/editor/math'
import { cn } from '@/lib/utils'

const POPOVER_WIDTH = 320

interface MathTarget {
	pos: number
	display: boolean
	/** Rumus baru: belum ada node-nya, disisip di `pos` saat disimpan. */
	isNew: boolean
	top: number
	left: number
}

export function MathPopover({
	editor,
	containerRef,
}: {
	editor: Editor | null
	containerRef: React.RefObject<HTMLDivElement | null>
}) {
	const [target, setTarget] = useState<MathTarget | null>(null)
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
					display: node.type.name === MATH_BLOCK || node.attrs.display === true,
					isNew: false,
					top: rect.bottom - bounds.top + 8,
					left: Math.max(8, Math.min(rect.left - bounds.left, bounds.width - POPOVER_WIDTH)),
				})
			}

			root.addEventListener('click', onClick)
			return () => root.removeEventListener('click', onClick)
		},
		[editor, containerRef],
	)

	useEffect(
		function openPopoverForNewFormula() {
			return onMathEditorRequest((request) => {
				const container = containerRef.current
				if (!container || request.editor !== editor || !editor) return
				const pos = editor.state.selection.from
				const caret = editor.view.coordsAtPos(pos)
				const bounds = container.getBoundingClientRect()
				setLatex('')
				setTarget({
					pos,
					display: request.display,
					isNew: true,
					top: caret.bottom - bounds.top + 8,
					left: Math.max(8, Math.min(caret.left - bounds.left, bounds.width - POPOVER_WIDTH)),
				})
			})
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

	/*
	 * Menutup mengembalikan fokus ke naskah dengan rumusnya terpilih, jadi
	 * Delete/Backspace langsung menghapusnya - dulu fokus tertinggal di popover
	 * dan rumus blok tidak bisa dihapus dengan papan tik (OBJ-22).
	 */
	const close = () => {
		setTarget(null)
		const node = target.isNew ? null : editor.state.doc.nodeAt(target.pos)
		if (node && (node.type.name === MATH_INLINE || node.type.name === MATH_BLOCK)) {
			editor.chain().focus().setNodeSelection(target.pos).run()
		} else {
			editor.commands.focus()
		}
	}

	const save = () => {
		const trimmed = latex.trim()
		if (!trimmed) return

		if (target.isNew) {
			editor.chain().focus().setTextSelection(target.pos).setMath(trimmed, target.display).run()
		} else {
			editor.view.dispatch(editor.state.tr.setNodeAttribute(target.pos, 'latex', trimmed))
			editor.chain().focus().setNodeSelection(target.pos).run()
		}
		setTarget(null)
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
		setTarget(null)
	}
	const remove = () => {
		const node = editor.state.doc.nodeAt(target.pos)
		if (!node) return
		editor
			.chain()
			.focus()
			.deleteRange({ from: target.pos, to: target.pos + node.nodeSize })
			.run()
		setTarget(null)
	}

	const kind = target.display ? 'Block formula' : 'Inline formula'

	return createPortal(
		<div
			role="dialog"
			aria-label={kind}
			className="absolute z-40 flex w-[320px] flex-col gap-2 rounded-xl border border-line-strong bg-surface-raised p-3 shadow-[var(--menu-shadow)]"
			style={{ top: target.top, left: target.left }}
			onMouseDown={(event) => {
				if (event.target !== inputRef.current) event.preventDefault()
			}}
		>
			<div className="flex items-center justify-between">
				<span className="text-xs font-semibold text-foreground">
					{target.isNew ? `New ${kind.toLowerCase()}` : kind}
				</span>
				<button
					type="button"
					onClick={close}
					aria-label="Close"
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
						event.preventDefault()
						close()
					}
				}}
				rows={2}
				spellCheck={false}
				aria-label="LaTeX source"
				placeholder={target.isNew ? 'e.g. E = mc^2' : undefined}
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
					{target.isNew ? 'Insert' : 'Save'}
				</button>
				{!target.isNew && (
					<>
						<button
							type="button"
							onClick={toText}
							title="Turn back into LaTeX text"
							className="flex items-center justify-center gap-1 rounded-lg bg-[var(--overlay-hover)] px-2.5 py-1.5 text-xs text-muted transition-colors hover:text-foreground"
						>
							<Code className="h-3.5 w-3.5" />
							To text
						</button>
						<button
							type="button"
							onClick={remove}
							aria-label="Delete formula"
							title="Delete formula"
							className="flex items-center justify-center rounded-lg bg-[var(--overlay-hover)] px-2.5 py-1.5 text-xs text-muted transition-colors hover:bg-red-500/10 hover:text-red-600"
						>
							<Trash2 className="h-3.5 w-3.5" />
						</button>
					</>
				)}
			</div>
		</div>,
		containerRef.current,
	)
}
