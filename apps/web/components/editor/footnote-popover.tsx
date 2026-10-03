'use client'

import { type Editor, type JSONContent, Node } from '@tiptap/core'
import { Subscript } from '@tiptap/extension-subscript'
import { Superscript } from '@tiptap/extension-superscript'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Trash2, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { FOOTNOTE_REF, footnoteEntries, onFootnoteEditorRequest } from '@/features/editor/footnote'

const POPOVER_WIDTH = 360
const SAVE_DELAY_MS = 250

/** Isi catatan = satu paragraf berformat, sama seperti `footnoteRef.attrs.content`. */
const NoteDocument = Node.create({ name: 'doc', topNode: true, content: 'paragraph' })

const NOTE_EXTENSIONS = [
	NoteDocument,
	StarterKit.configure({
		document: false,
		heading: false,
		blockquote: false,
		bulletList: false,
		orderedList: false,
		listItem: false,
		listKeymap: false,
		codeBlock: false,
		code: false,
		horizontalRule: false,
		dropcursor: false,
		gapcursor: false,
		trailingNode: false,
		link: { openOnClick: false, autolink: true },
	}),
	Subscript,
	Superscript,
]

interface Target {
	/** Identitas rujukan; posisinya dicari ulang setiap kali, karena naskah bisa bergeser. */
	id: string | null
	pos: number
	number: number
	content: JSONContent[]
	top: number
	left: number
}

function findRef(editor: Editor, target: Pick<Target, 'id' | 'pos'>): { pos: number; number: number } | null {
	const entries = footnoteEntries(editor.state.doc)
	const match = target.id
		? entries.find((entry) => entry.id === target.id)
		: entries.find((entry) => entry.pos === target.pos)
	return match ? { pos: match.pos, number: match.number } : null
}

/**
 * Editor isi catatan kaki (TKS-1): dibuka saat catatan disisipkan, saat
 * rujukan diklik, atau saat catatannya diklik di kaki halaman. Perubahan
 * langsung tersimpan ke rujukannya.
 */
export function FootnotePopover({
	editor,
	containerRef,
}: {
	editor: Editor | null
	containerRef: React.RefObject<HTMLDivElement | null>
}) {
	const [target, setTarget] = useState<Target | null>(null)

	const open = useCallback(
		(pos: number, anchor?: DOMRect) => {
			const container = containerRef.current
			if (!editor || !container) return
			const node = editor.state.doc.nodeAt(pos)
			if (!node || node.type.name !== FOOTNOTE_REF) return
			const entry = footnoteEntries(editor.state.doc).find((candidate) => candidate.pos === pos)
			if (!entry) return
			const bounds = container.getBoundingClientRect()
			const rect =
				anchor ??
				(() => {
					const coords = editor.view.coordsAtPos(pos)
					return new DOMRect(coords.left, coords.top, 0, coords.bottom - coords.top)
				})()
			setTarget({
				id: entry.id,
				pos,
				number: entry.number,
				content: entry.content,
				top: rect.bottom - bounds.top + 8,
				left: Math.max(8, Math.min(rect.left - bounds.left, bounds.width - POPOVER_WIDTH - 8)),
			})
		},
		[editor, containerRef],
	)

	useEffect(
		function openOnRequest() {
			return onFootnoteEditorRequest((pos) => open(pos))
		},
		[open],
	)

	useEffect(
		function openOnClick() {
			const root = editor?.view.dom
			if (!root || !editor) return
			const onClick = (event: MouseEvent) => {
				const element = event.target as HTMLElement
				const ref = element.closest<HTMLElement>('sup[data-type="footnote-ref"]')
				if (ref && root.contains(ref)) {
					open(editor.view.posAtDOM(ref, 0))
					return
				}
				const item = element.closest<HTMLElement>('.footnote-item')
				if (item && root.contains(item)) {
					const id = item.getAttribute('data-footnote-id')
					const entries = footnoteEntries(editor.state.doc)
					const entry = id
						? entries.find((candidate) => candidate.id === id)
						: entries.find((candidate) => String(candidate.pos) === item.getAttribute('data-footnote-pos'))
					if (entry) open(entry.pos, item.getBoundingClientRect())
				}
			}
			root.addEventListener('click', onClick)
			return () => root.removeEventListener('click', onClick)
		},
		[editor, open],
	)

	if (!editor || !target || !containerRef.current) return null

	return createPortal(
		<FootnoteEditorCard
			key={`${target.id ?? target.pos}`}
			editor={editor}
			target={target}
			onClose={() => setTarget(null)}
		/>,
		containerRef.current,
	)
}

function FootnoteEditorCard({
	editor,
	target,
	onClose,
}: {
	editor: Editor
	target: Target
	onClose: () => void
}) {
	const pending = useRef<JSONContent[] | null>(null)
	const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

	const flush = useCallback(() => {
		if (timer.current) {
			clearTimeout(timer.current)
			timer.current = null
		}
		const content = pending.current
		pending.current = null
		if (!content || editor.isDestroyed) return
		const ref = findRef(editor, target)
		if (ref) editor.commands.setFootnoteContent(ref.pos, content)
	}, [editor, target])

	const close = useCallback(
		(focusAfter = true) => {
			flush()
			onClose()
			if (!focusAfter || editor.isDestroyed) return
			const ref = findRef(editor, target)
			if (ref)
				editor
					.chain()
					.focus()
					.setTextSelection(ref.pos + 1)
					.run()
			else editor.commands.focus()
		},
		[editor, flush, onClose, target],
	)

	const note = useEditor({
		extensions: NOTE_EXTENSIONS,
		content: { type: 'doc', content: [{ type: 'paragraph', content: target.content }] },
		immediatelyRender: false,
		autofocus: 'end',
		editorProps: {
			attributes: {
				class: 'footnote-editor-content',
				'aria-label': `Footnote ${target.number} text`,
			},
			handleKeyDown: (_view, event) => {
				if ((event.key === 'Enter' && !event.shiftKey) || event.key === 'Escape') {
					event.preventDefault()
					close()
					return true
				}
				return false
			},
		},
		onUpdate: ({ editor: instance }) => {
			pending.current = (instance.getJSON().content?.[0]?.content as JSONContent[] | undefined) ?? []
			if (timer.current) clearTimeout(timer.current)
			timer.current = setTimeout(flush, SAVE_DELAY_MS)
		},
	})

	useEffect(
		function saveOnUnmount() {
			return () => flush()
		},
		[flush],
	)

	const remove = () => {
		pending.current = null
		onClose()
		const ref = findRef(editor, target)
		if (!ref) return
		editor
			.chain()
			.focus()
			.deleteRange({ from: ref.pos, to: ref.pos + 1 })
			.run()
	}

	return (
		<div
			role="dialog"
			aria-label={`Footnote ${target.number}`}
			className="footnote-popover absolute z-40 flex flex-col gap-2 rounded-xl border border-line-strong bg-surface-raised p-3 shadow-[var(--menu-shadow)]"
			style={{ top: target.top, left: target.left, width: POPOVER_WIDTH }}
		>
			<div className="flex items-center justify-between">
				<span className="text-xs font-semibold text-foreground">Footnote {target.number}</span>
				<button
					type="button"
					onClick={() => close()}
					aria-label="Close"
					className="text-subtle transition-colors hover:text-foreground"
				>
					<X className="h-3.5 w-3.5" />
				</button>
			</div>
			<EditorContent
				editor={note}
				className="max-h-48 overflow-y-auto rounded-lg bg-[var(--overlay-hover)] px-2.5 py-2 text-sm text-foreground"
			/>
			<div className="flex items-center gap-1.5">
				<p className="flex-1 text-[11px] text-subtle">Enter to finish · Shift+Enter for a new line</p>
				<button
					type="button"
					onClick={remove}
					className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-muted transition-colors hover:bg-red-500/10 hover:text-red-600"
				>
					<Trash2 className="h-3.5 w-3.5" />
					Delete footnote
				</button>
				<button
					type="button"
					onClick={() => close()}
					className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground transition-colors hover:bg-accent-hover"
				>
					Done
				</button>
			</div>
		</div>
	)
}
