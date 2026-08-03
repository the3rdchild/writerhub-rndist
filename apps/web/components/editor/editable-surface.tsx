'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useDocument } from '@/features/document/document-context'
import {
	buildHighlightedHtml,
	mergeLineRects,
	type OverlayRect,
	rangeFromOffsets,
	textToHtml,
} from '@/features/document/dom-ranges'
import type { FontSize } from '@/features/settings/settings-context'
import { cn } from '@/lib/utils'
import { type PopoverPosition, SuggestionPopover } from './suggestion-popover'

const FONT_SIZE_CLASS: Record<FontSize, string> = {
	small: 'text-[13px] leading-[1.6]',
	medium: 'text-[15px] leading-[1.7]',
	large: 'text-[17px] leading-[1.8]',
}

/** Jeda sebelum popover ditutup, supaya kursor sempat berpindah ke dalamnya. */
const POPOVER_HIDE_DELAY_MS = 180

export function EditableSurface({
	fontSize,
	containerRef,
	editableRef,
}: {
	fontSize: FontSize
	containerRef: React.RefObject<HTMLDivElement | null>
	/** Dimiliki induk supaya toolbar bisa mengembalikan fokus ke elemen ini. */
	editableRef: React.RefObject<HTMLDivElement | null>
}) {
	const { state, dispatch } = useDocument()
	const scrollRef = useRef<HTMLDivElement>(null)

	const [popover, setPopover] = useState<PopoverPosition | null>(null)
	const [hoverRects, setHoverRects] = useState<OverlayRect[]>([])

	const activeSuggestions = state.suggestions.filter((suggestion) => !suggestion.dismissed)
	const hasHighlights = activeSuggestions.length > 0

	/**
	 * Menulis ulang innerHTML saat pengguna sedang mengetik akan memindahkan
	 * kursor ke awal. Flag ini menandai perubahan yang berasal dari editor
	 * sendiri supaya efek sinkronisasi melewatinya satu putaran.
	 */
	const selfEditRef = useRef(false)

	// Sinkronkan DOM ke state: teks polos saat idle, teks bertanda saat ada hasil.
	useEffect(() => {
		const element = editableRef.current
		if (!element) return

		if (selfEditRef.current) {
			selfEditRef.current = false
			return
		}

		const nextHtml = hasHighlights
			? buildHighlightedHtml(state.text, activeSuggestions)
			: textToHtml(state.text)

		if (element.innerHTML !== nextHtml) element.innerHTML = nextHtml
		// activeSuggestions diturunkan dari state.suggestions, jadi tidak perlu jadi dependensi.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [state.text, state.suggestions, hasHighlights])

	const onInput = useCallback(() => {
		const element = editableRef.current
		if (!element) return

		selfEditRef.current = true
		dispatch({ type: 'editText', text: element.innerText })
	}, [dispatch])

	// Tempel sebagai teks polos: markup dari sumber luar akan merusak pemetaan offset.
	const onPaste = useCallback((event: React.ClipboardEvent) => {
		event.preventDefault()
		document.execCommand('insertText', false, event.clipboardData.getData('text/plain'))
	}, [])

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

	useEffect(() => {
		const element = editableRef.current
		const container = containerRef.current
		if (!element || !container || !hasHighlights) return

		const marks = element.querySelectorAll<HTMLElement>('span[data-suggestion-id]')
		const cleanups: Array<() => void> = []

		for (const mark of marks) {
			const id = mark.dataset.suggestionId
			if (!id) continue

			const onEnter = () => {
				cancelHide()
				const markRect = mark.getBoundingClientRect()
				const containerRect = container.getBoundingClientRect()
				setPopover({
					id,
					top: markRect.bottom - containerRect.top + 6,
					left: Math.min(markRect.left - containerRect.left, containerRect.width - 220),
				})
			}

			mark.addEventListener('mouseenter', onEnter)
			mark.addEventListener('mouseleave', scheduleHide)
			cleanups.push(() => {
				mark.removeEventListener('mouseenter', onEnter)
				mark.removeEventListener('mouseleave', scheduleHide)
			})
		}

		return () => {
			for (const cleanup of cleanups) cleanup()
		}
	}, [state.text, state.suggestions, hasHighlights, containerRef, cancelHide, scheduleHide])

	// ── gulir ke rentang yang diklik dari panel ──────────────────────────────

	useEffect(() => {
		const element = editableRef.current
		const scroller = scrollRef.current
		if (!state.focusedRange || !element || !scroller) return

		const range = rangeFromOffsets(element, state.focusedRange)
		dispatch({ type: 'setFocusedRange', range: null })
		if (!range) return

		// Dihitung relatif ke kontainer scroll, bukan viewport.
		const targetRect = range.getBoundingClientRect()
		const scrollerRect = scroller.getBoundingClientRect()
		const targetTop = targetRect.top - scrollerRect.top + scroller.scrollTop

		scroller.scrollTo({
			top: targetTop + targetRect.height / 2 - scroller.clientHeight / 2,
			behavior: 'smooth',
		})
	}, [state.focusedRange, dispatch])

	// ── overlay sorotan saat kartu panel di-hover ────────────────────────────

	useEffect(() => {
		const element = editableRef.current
		const scroller = scrollRef.current
		if (!element || !scroller || !state.hoveredRange) {
			setHoverRects([])
			return
		}

		const range = rangeFromOffsets(element, state.hoveredRange)
		if (!range) {
			setHoverRects([])
			return
		}

		const scrollerRect = scroller.getBoundingClientRect()
		setHoverRects(
			mergeLineRects(Array.from(range.getClientRects())).map((rect) => ({
				// Koordinat relatif ke konten agar overlay ikut tergulir bersama teks.
				top: rect.top - scrollerRect.top + scroller.scrollTop - 2,
				left: rect.left - scrollerRect.left + scroller.scrollLeft - 3,
				width: rect.width + 6,
				height: rect.height + 4,
			})),
		)
	}, [state.hoveredRange])

	const popoverSuggestion = popover
		? state.suggestions.find((suggestion) => suggestion.id === popover.id)
		: undefined

	return (
		<div ref={scrollRef} className="overlay-scroll absolute inset-0">
			{hoverRects.map((rect) => (
				<div
					key={`${rect.top}-${rect.left}-${rect.width}`}
					className="range-highlight"
					style={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height }}
				/>
			))}

			{popover && popoverSuggestion && (
				<SuggestionPopover
					suggestion={popoverSuggestion}
					position={popover}
					onMouseEnter={cancelHide}
					onMouseLeave={scheduleHide}
					onAccept={() => {
						cancelHide()
						dispatch({ type: 'acceptSuggestion', id: popoverSuggestion.id })
						setPopover(null)
					}}
					onDismiss={() => {
						cancelHide()
						dispatch({ type: 'dismissSuggestion', id: popoverSuggestion.id })
						setPopover(null)
					}}
				/>
			)}

			<div
				ref={editableRef}
				contentEditable
				suppressContentEditableWarning
				spellCheck={false}
				onInput={onInput}
				onPaste={onPaste}
				className={cn(
					'document-editor relative min-h-full whitespace-pre-wrap break-words px-8 py-6 text-muted outline-none',
					FONT_SIZE_CLASS[fontSize],
				)}
			/>
		</div>
	)
}
