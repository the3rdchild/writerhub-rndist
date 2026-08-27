'use client'

import { type Editor, EditorContent, useEditor } from '@tiptap/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useAnalysisDiffHost } from '@/features/analysis/use-analysis-diff-host'
import { useDocument } from '@/features/document/document-context'
import { suggestionHighlightKey } from '@/features/document/suggestion-highlight'
import { buildTextIndex, textRangeToPM } from '@/features/document/tiptap-offsets'
import { replaceTextRange } from '@/features/editor/apply-text'
import { migrateLegacyColumns } from '@/features/editor/columns'
import { buildEditorExtensions } from '@/features/editor/extensions'
import {
	type PageGeometry,
	type PageSetup,
	pageGeometry,
	type SheetGeometry,
} from '@/features/editor/page-geometry'
import { paginationKey } from '@/features/editor/pagination'
import { type SlashCommandState } from '@/features/editor/slash-command'
import { editorPlainText, textToParagraphs } from '@/features/editor/text-content'
import { useSessions } from '@/features/sessions/session-context'
import { type FontSize, useSettings } from '@/features/settings/settings-context'
import { cn } from '@/lib/utils'
import { ImageToolbar } from './image-toolbar'
import { MathPopover } from './math-popover'
import { SelectionMenu } from './selection-menu'
import { SlashCommandMenu } from './slash-command-menu'
import { type PopoverPosition, SuggestionPopover } from './suggestion-popover'
import { TableColorToolbar } from './table-color-toolbar'

const FONT_SIZE_CLASS: Record<FontSize, string> = {
	small: 'text-[15px] leading-[1.75]',
	medium: 'text-[17px] leading-[1.8]',
	large: 'text-[19px] leading-[1.85]',
}

const POPOVER_HIDE_DELAY_MS = 180

export function TiptapEditor({
	containerRef,
	onReady,
	geometry = pageGeometry(),
	setup,
	pageless = false,
	onPageCountChange,
	onSheetsChange,
	onSectionsChange,
}: {
	containerRef: React.RefObject<HTMLDivElement | null>
	onReady?: (editor: Editor | null) => void
	geometry?: PageGeometry
	setup?: PageSetup
	pageless?: boolean
	onPageCountChange?: (pageCount: number) => void
	onSheetsChange?: (sheets: SheetGeometry[]) => void
	onSectionsChange?: (setups: PageSetup[]) => void
}) {
	const { state, dispatch } = useDocument()
	const { settings } = useSettings()
	const { doc, activeId } = useSessions()
	const [popover, setPopover] = useState<PopoverPosition | null>(null)
	const [slashState, setSlashState] = useState<SlashCommandState | null>(null)
	const slashStateRef = useRef(setSlashState)
	slashStateRef.current = setSlashState
	const pageCountRef = useRef(onPageCountChange)
	pageCountRef.current = onPageCountChange
	const sheetsRef = useRef(onSheetsChange)
	sheetsRef.current = onSheetsChange
	const sectionsRef = useRef(onSectionsChange)
	sectionsRef.current = onSectionsChange
	const selfEditRef = useRef(false)
	const editor = useEditor(
		{
			immediatelyRender: false, // dokumen dirender di klien; hindari mismatch hidrasi
			extensions: buildEditorExtensions({
				geometry,
				setup,
				onPageCountChange: (pageCount) => pageCountRef.current?.(pageCount),
				onSheetsChange: (sheets) => sheetsRef.current?.(sheets),
				onSectionsChange: (setups) => sectionsRef.current?.(setups),
				collaboration: activeId ? { document: doc, field: activeId } : null,
				slashCommand: {
					onOpen: (s) => slashStateRef.current(s),
					onUpdate: (s) => slashStateRef.current(s),
					onClose: () => slashStateRef.current(null),
				},
			}),
			editorProps: {
				attributes: {
					class: cn('document-body focus:outline-none', FONT_SIZE_CLASS[settings.editorFontSize]),
					spellcheck: 'false',
				},
			},
			onUpdate: ({ editor: instance }) => {
				selfEditRef.current = true
				dispatch({ type: 'editText', text: editorPlainText(instance) })
			},
		},
		[activeId],
	)
	useEffect(() => {
		onReady?.(editor)
		return () => onReady?.(null)
	}, [editor, onReady])
	useEffect(() => {
		if (!editor) return
		const migrate = () => {
			const tr = migrateLegacyColumns(editor.state)
			if (tr) editor.view.dispatch(tr)
		}
		migrate()
		editor.on('update', migrate)
		return () => {
			editor.off('update', migrate)
		}
	}, [editor])
	useEffect(() => {
		if (!editor) return
		const transaction = editor.state.tr.setMeta(paginationKey, { geometry, setup, pageless })
		transaction.setMeta('addToHistory', false)
		editor.view.dispatch(transaction)
	}, [editor, geometry, setup, pageless])
	const syncedEditorRef = useRef<Editor | null>(null)
	useEffect(() => {
		if (!editor) return
		if (syncedEditorRef.current !== editor) {
			syncedEditorRef.current = editor
			return
		}
		if (selfEditRef.current) {
			selfEditRef.current = false
			return
		}
		if (editorPlainText(editor) === state.text) return

		editor.commands.setContent(textToParagraphs(state.text), { emitUpdate: false })
	}, [editor, state.text])
	useEffect(() => {
		if (!editor) return
		editor.view.dispatch(editor.state.tr.setMeta(suggestionHighlightKey, state.suggestions))
	}, [editor, state.suggestions])
	useAnalysisDiffHost()

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
		replaceTextRange(
			editor,
			{
				offset: suggestion.offset ?? 0,
				length: suggestion.length ?? suggestion.original.length,
				expected: suggestion.original,
			},
			suggestion.replacement,
		)
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
			<SelectionMenu editor={editor} containerRef={containerRef} />
			<MathPopover editor={editor} containerRef={containerRef} />
			{editor && slashState?.open && (
				<SlashCommandMenu editor={editor} state={slashState} onClose={() => setSlashState(null)} />
			)}
			<ImageToolbar editor={editor} />
			<TableColorToolbar editor={editor} />
		</>
	)
}
