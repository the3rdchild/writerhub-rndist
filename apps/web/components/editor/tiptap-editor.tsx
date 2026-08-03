'use client'

import Highlight from '@tiptap/extension-highlight'
import Link from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import { TableKit } from '@tiptap/extension-table'
import TextAlign from '@tiptap/extension-text-align'
import Typography from '@tiptap/extension-typography'
import { EditorContent, useEditor, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useDocument } from '@/features/document/document-context'
import { suggestionHighlightKey, SuggestionHighlight } from '@/features/document/suggestion-highlight'
import { buildTextIndex, textRangeToPM } from '@/features/document/tiptap-offsets'
import type { FontSize } from '@/features/settings/settings-context'
import { cn } from '@/lib/utils'
import { type PopoverPosition, SuggestionPopover } from './suggestion-popover'

const FONT_SIZE_CLASS: Record<FontSize, string> = {
	small: 'text-[15px] leading-[1.75]',
	medium: 'text-[17px] leading-[1.8]',
	large: 'text-[19px] leading-[1.85]',
}

const POPOVER_HIDE_DELAY_MS = 180

/** Teks polos yang dikirim ke API — pemisah blok harus cocok dengan buildTextIndex. */
export function editorPlainText(editor: Editor): string {
	return editor.getText({ blockSeparator: '\n' })
}

export function TiptapEditor({
	fontSize,
	containerRef,
	onReady,
}: {
	fontSize: FontSize
	containerRef: React.RefObject<HTMLDivElement | null>
	onReady?: (editor: Editor | null) => void
}) {
	const { state, dispatch } = useDocument()
	const [popover, setPopover] = useState<PopoverPosition | null>(null)

	/**
	 * Perubahan yang berasal dari editor sendiri tidak boleh dipantulkan balik
	 * ke editor sebagai `setContent` — itu akan memindahkan kursor ke awal.
	 */
	const selfEditRef = useRef(false)

	const editor = useEditor({
		immediatelyRender: false, // dokumen dirender di klien; hindari mismatch hidrasi
		extensions: [
			StarterKit.configure({ link: false }),
			Link.configure({ openOnClick: false, autolink: true }),
			TextAlign.configure({ types: ['heading', 'paragraph'] }),
			Highlight,
			Typography,
			TableKit.configure({ table: { resizable: true } }),
			Placeholder.configure({ placeholder: 'Mulai menulis, atau tempel draf Anda di sini…' }),
			SuggestionHighlight,
		],
		editorProps: {
			attributes: {
				class: cn('document-body focus:outline-none', FONT_SIZE_CLASS[fontSize]),
				spellcheck: 'false',
			},
		},
		onUpdate: ({ editor: instance }) => {
			selfEditRef.current = true
			dispatch({ type: 'editText', text: editorPlainText(instance) })
		},
	})

	useEffect(() => {
		onReady?.(editor)
	}, [editor, onReady])

	// Isi editor dari state saat teks datang dari luar: muat sesi, tempel, unggah,
	// atau teks hasil ekstraksi dokumen dari worker.
	useEffect(() => {
		if (!editor) return
		if (selfEditRef.current) {
			selfEditRef.current = false
			return
		}
		if (editorPlainText(editor) === state.text) return

		editor.commands.setContent(
			state.text
				.split('\n')
				.map((line) => `<p>${line ? escapeHtml(line) : '<br>'}</p>`)
				.join(''),
			{ emitUpdate: false },
		)
	}, [editor, state.text])

	// Kirim daftar suggestion ke plugin dekorasi.
	useEffect(() => {
		if (!editor) return
		editor.view.dispatch(editor.state.tr.setMeta(suggestionHighlightKey, state.suggestions))
	}, [editor, state.suggestions])

	// ── popover pada penanda suggestion ──────────────────────────────────────

	const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

	const cancelHide = useCallback(() => {
		if (hideTimer.current) {
			clearTimeout(hideTimer.current)
			hideTimer.current = null
		}
	}, [])

	const scheduleHide = useCallback(() => {
		cancelHide()
		hideTimer.current = setTimeout(() => setPopover(null), POPOVER_HIDE_DELAY_MS)
	}, [cancelHide])

	useEffect(() => () => cancelHide(), [cancelHide])

	// Dekorasi dirender ulang oleh ProseMirror, jadi listener dipasang di root
	// editor lewat event delegation alih-alih ke tiap span.
	useEffect(() => {
		const root = editor?.view.dom
		const container = containerRef.current
		if (!root || !container) return

		const onOver = (event: Event) => {
			const mark = (event.target as HTMLElement).closest<HTMLElement>('[data-suggestion-id]')
			if (!mark) return

			cancelHide()
			const markRect = mark.getBoundingClientRect()
			const containerRect = container.getBoundingClientRect()
			setPopover({
				id: mark.dataset.suggestionId as string,
				top: markRect.bottom - containerRect.top + 6,
				left: Math.min(markRect.left - containerRect.left, containerRect.width - 240),
			})
		}

		const onOut = (event: Event) => {
			if ((event.target as HTMLElement).closest('[data-suggestion-id]')) scheduleHide()
		}

		root.addEventListener('mouseover', onOver)
		root.addEventListener('mouseout', onOut)
		return () => {
			root.removeEventListener('mouseover', onOver)
			root.removeEventListener('mouseout', onOut)
		}
	}, [editor, containerRef, cancelHide, scheduleHide])

	// ── gulir & sorot rentang yang diklik dari panel ─────────────────────────

	useEffect(() => {
		if (!editor || !state.focusedRange) return

		const index = buildTextIndex(editor.state.doc)
		const range = textRangeToPM(index, state.focusedRange.offset, state.focusedRange.length)
		dispatch({ type: 'setFocusedRange', range: null })
		if (!range) return

		const node = editor.view.domAtPos(range.from).node
		const element = node instanceof HTMLElement ? node : node.parentElement
		element?.scrollIntoView({ behavior: 'smooth', block: 'center' })
	}, [editor, state.focusedRange, dispatch])

	// Sorotan sementara saat kartu panel di-hover.
	useEffect(() => {
		if (!editor) return
		const root = editor.view.dom

		const previous = root.querySelectorAll('.range-preview')
		for (const element of previous) element.classList.remove('range-preview')

		if (!state.hoveredRange) return

		const index = buildTextIndex(editor.state.doc)
		const range = textRangeToPM(index, state.hoveredRange.offset, state.hoveredRange.length)
		if (!range) return

		const node = editor.view.domAtPos(range.from).node
		const element = node instanceof HTMLElement ? node : node.parentElement
		element?.classList.add('range-preview')
	}, [editor, state.hoveredRange])

	const popoverSuggestion = popover
		? state.suggestions.find((suggestion) => suggestion.id === popover.id)
		: undefined

	const applySuggestion = (id: string) => {
		const suggestion = state.suggestions.find((item) => item.id === id)
		if (!editor || !suggestion) return

		const index = buildTextIndex(editor.state.doc)
		const span = index.text.indexOf(suggestion.original)
		if (span !== -1) {
			const range = textRangeToPM(index, span, suggestion.original.length)
			if (range) {
				editor.chain().focus().insertContentAt(range, suggestion.replacement).run()
			}
		}
		dispatch({ type: 'dismissSuggestion', id })
		setPopover(null)
	}

	return (
		<>
			{popover && popoverSuggestion && (
				<SuggestionPopover
					suggestion={popoverSuggestion}
					position={popover}
					onMouseEnter={cancelHide}
					onMouseLeave={scheduleHide}
					onAccept={() => {
						cancelHide()
						applySuggestion(popoverSuggestion.id)
					}}
					onDismiss={() => {
						cancelHide()
						dispatch({ type: 'dismissSuggestion', id: popoverSuggestion.id })
						setPopover(null)
					}}
				/>
			)}
			<EditorContent editor={editor} />
		</>
	)
}

function escapeHtml(value: string): string {
	return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
