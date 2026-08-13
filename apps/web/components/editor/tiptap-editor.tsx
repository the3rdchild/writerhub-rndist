'use client'

import { EditorContent, useEditor, type Editor } from '@tiptap/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useDocument } from '@/features/document/document-context'
import { suggestionHighlightKey } from '@/features/document/suggestion-highlight'
import { buildTextIndex, textRangeToPM } from '@/features/document/tiptap-offsets'
import { replaceTextRange } from '@/features/editor/apply-text'
import { buildEditorExtensions } from '@/features/editor/extensions'
import { type PageGeometry, pageGeometry } from '@/features/editor/page-geometry'
import { paginationKey } from '@/features/editor/pagination'
import { type SlashCommandState } from '@/features/editor/slash-command'
import { editorPlainText, textToParagraphs } from '@/features/editor/text-content'
import { useSessions } from '@/features/sessions/session-context'
import { useSettings, type FontSize } from '@/features/settings/settings-context'
import { cn } from '@/lib/utils'
import { MathPopover } from './math-popover'
import { SelectionMenu } from './selection-menu'
import { SlashCommandMenu } from './slash-command-menu'
import { type PopoverPosition, SuggestionPopover } from './suggestion-popover'
import { ImageToolbar } from './image-toolbar'
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
	pageless = false,
	onPageCountChange,
}: {
	containerRef: React.RefObject<HTMLDivElement | null>
	onReady?: (editor: Editor | null) => void
	geometry?: PageGeometry
	/** Mode pageless: pemenggalan halaman dimatikan. */
	pageless?: boolean
	onPageCountChange?: (pageCount: number) => void
}) {
	const { state, dispatch } = useDocument()
	const { settings } = useSettings()
	const { doc, activeId } = useSessions()
	const [popover, setPopover] = useState<PopoverPosition | null>(null)

	// State menu slash - dipasang ke ekstensi lewat callback stabil (refs).
	const [slashState, setSlashState] = useState<SlashCommandState | null>(null)
	const slashStateRef = useRef(setSlashState)
	slashStateRef.current = setSlashState

	// Ekstensi hanya dibuat sekali, jadi callback dilewatkan lewat ref agar
	// pemanggil tetap boleh mengirim fungsi baru tiap render.
	const pageCountRef = useRef(onPageCountChange)
	pageCountRef.current = onPageCountChange

	/**
	 * Perubahan yang berasal dari editor sendiri tidak boleh dipantulkan balik
	 * ke editor sebagai `setContent` - itu akan memindahkan kursor ke awal.
	 */
	const selfEditRef = useRef(false)

	/*
	 * Editor dibuat ulang tiap kali tab berganti - `activeId` jadi dependensinya.
	 *
	 * ferdocs menempuh jalan lain: menyusun ulang daftar ekstensi di tempat
	 * supaya instance editornya bertahan, dan itu memang lebih cepat beberapa
	 * puluh milidetik. Yang dibayar untuk itu adalah editor yang menyimpan sisa
	 * keadaan tab sebelumnya - riwayat undo, dekorasi, plugin yang masih
	 * memegang posisi lama. Membuat ulang memberi tiap tab editor yang bersih,
	 * dan pada dokumen sepanjang naskah biasa selisih waktunya tidak terasa.
	 */
	const editor = useEditor(
		{
			immediatelyRender: false, // dokumen dirender di klien; hindari mismatch hidrasi
			extensions: buildEditorExtensions({
				geometry,
				onPageCountChange: (pageCount) => pageCountRef.current?.(pageCount),
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

	// Instance yang ditinggalkan dicabut dari context, bukan dibiarkan menganggur
	// di sana sampai penggantinya siap: yang membacanya di antara dua saat itu
	// akan menemukan editor yang sudah dibubarkan.
	useEffect(() => {
		onReady?.(editor)
		return () => onReady?.(null)
	}, [editor, onReady])

	// Daftar ekstensi hanya dibuat sekali, sedangkan margin bisa diseret kapan
	// saja lewat penggaris - geometri barunya dikirim sebagai meta transaksi.
	useEffect(() => {
		if (!editor) return
		const transaction = editor.state.tr.setMeta(paginationKey, { geometry, pageless })
		transaction.setMeta('addToHistory', false)
		editor.view.dispatch(transaction)
	}, [editor, geometry, pageless])

	/**
	 * Editor yang isinya sudah pernah disamakan dengan state.
	 *
	 * Editor yang baru lahir - halaman baru dibuka, atau tab baru dipilih -
	 * isinya datang dari Y.Doc, dan pada render itu state dokumen masih memuat
	 * naskah tab sebelumnya. Tanpa penanda ini, penyamaan di bawah akan menimpa
	 * naskah tab yang baru dibuka dengan teks tab yang baru ditinggalkan.
	 */
	const syncedEditorRef = useRef<Editor | null>(null)

	// Isi editor dari state saat teks datang dari luar: tempel, unggah, atau
	// teks hasil ekstraksi dokumen dari worker.
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

	const  applySuggestion = (id: string) => {
		const suggestion = state.suggestions.find((item) => item.id === id)
		if (!editor || !suggestion) return

		// replaceTextRange memakai resolveSpan, jadi menyasar kemunculan yang
		// benar walau kata itu muncul berkali-kali, dan tidak menggulir layar
		// (§P3.1). Dulu memakai indexOf murni + .focus() yang selalu lompat ke
		// kemunculan pertama dan menggulung ke sana.
		replaceTextRange(
			editor,
			{ offset: suggestion.offset ?? 0, length: suggestion.length ?? suggestion.original.length, expected: suggestion.original },
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
				<SlashCommandMenu
					editor={editor}
					state={slashState}
					onClose={() => setSlashState(null)}
				/>
			)}
			<ImageToolbar editor={editor} />
			<TableColorToolbar editor={editor} />
		</>
	)
}
