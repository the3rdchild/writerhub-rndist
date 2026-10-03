'use client'

import type { Editor } from '@tiptap/react'
import { useEditorState } from '@tiptap/react'
import { ExternalLink, Pencil, Unlink } from 'lucide-react'
import { createPortal } from 'react-dom'
import { openHref, promptForLink, removeLink } from '@/features/editor/link'

/**
 * Gelembung tautan: muncul saat kursor (tanpa seleksi) berada di tautan, dengan
 * alamatnya dan tombol buka, sunting, lepas - seperti Docs. Dulu tautan di
 * editor tidak bisa dibuka sama sekali, bahkan dengan Ctrl+klik (TKS-11).
 */
export function LinkBubble({ editor }: { editor: Editor | null }) {
	const state = useEditorState({
		editor,
		selector: ({ editor: instance }) => {
			if (!instance || instance.isDestroyed || !instance.isEditable) return null
			const { selection } = instance.state
			if (!selection.empty || !instance.isActive('link')) return null
			const href = (instance.getAttributes('link').href as string | undefined) ?? ''
			try {
				const coords = instance.view.coordsAtPos(selection.from)
				return { href, top: coords.bottom + 6, left: coords.left }
			} catch {
				return null
			}
		},
	})
	if (!editor || !state || typeof document === 'undefined') return null

	return createPortal(
		<div
			role="toolbar"
			aria-label="Link"
			className="link-bubble fixed z-50 flex max-w-[360px] items-center gap-1 rounded-xl border border-line-strong bg-surface-raised px-2 py-1 text-xs shadow-[var(--menu-shadow)]"
			style={{ top: state.top, left: state.left }}
			onMouseDown={(event) => event.preventDefault()}
		>
			<button
				type="button"
				onClick={() => openHref(state.href)}
				title="Open link in a new tab"
				className="flex min-w-0 items-center gap-1 truncate rounded-md px-1.5 py-1 text-accent hover:bg-[var(--overlay-hover)]"
			>
				<ExternalLink className="h-3.5 w-3.5 shrink-0" />
				<span className="truncate">{state.href}</span>
			</button>
			<button
				type="button"
				onClick={() => promptForLink(editor)}
				aria-label="Edit link"
				title="Edit link"
				className="rounded-md p-1 text-subtle hover:bg-[var(--overlay-hover)] hover:text-foreground"
			>
				<Pencil className="h-3.5 w-3.5" />
			</button>
			<button
				type="button"
				onClick={() => removeLink(editor)}
				aria-label="Remove link"
				title="Remove link"
				className="rounded-md p-1 text-subtle hover:bg-[var(--overlay-hover)] hover:text-foreground"
			>
				<Unlink className="h-3.5 w-3.5" />
			</button>
		</div>,
		document.body,
	)
}
