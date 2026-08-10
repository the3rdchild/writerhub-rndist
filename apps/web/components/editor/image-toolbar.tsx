'use client'

import type { Editor } from '@tiptap/react'
import { useEditorState } from '@tiptap/react'
import { AlignCenter, AlignLeft, AlignRight, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'

/**
 * Bilah melayang yang muncul saat sebuah node gambar terpilih.
 *
 * Menawarkan perataan (kiri/tengah/kanan) dan hapus. Posisi dihitung dari
 * elemen gambar yang terpilih di DOM; bila gambar keluar layar (mis. bergulung)
 * bilah ikut disembunyikan.
 */
export function ImageToolbar({ editor }: { editor: Editor | null }) {
	const state = useEditorState({
		editor,
		selector: ({ editor: instance }) => {
			if (!instance || instance.isDestroyed) return null
			if (!instance.isActive('image')) return null
			const attrs = instance.getAttributes('image') as { align?: string | null }
			return { align: (attrs.align ?? null) as 'left' | 'center' | 'right' | null }
		},
	})

	const [rect, setRect] = useState<DOMRect | null>(null)

	// Posisi bilah mengikuti elemen gambar yang terpilih.
	useEffect(() => {
		if (!editor || !state) {
			setRect(null)
			return
		}
		const update = () => {
			const view = editor.view
			if (!view) return
			// Cari node gambar pada seleksi node saat ini.
			const { from } = view.state.selection
			const node = view.state.doc.nodeAt(from)
			if (!node || node.type.name !== 'image') {
				setRect(null)
				return
			}
			const dom = view.nodeDOM(from) as HTMLElement | null
			if (!dom) {
				setRect(null)
				return
			}
			setRect(dom.getBoundingClientRect())
		}
		update()
		editor.on('transaction', update)
		return () => {
			editor.off('transaction', update)
		}
	}, [editor, state])

	if (!editor || !state || !rect) return null

	const setAlign = (align: 'left' | 'center' | 'right') =>
		editor.chain().focus().setImageAlign(align).run()

	const buttons = [
		{ icon: AlignLeft, label: 'Rata kiri', value: 'left' as const, active: state.align === 'left' || (!state.align) },
		{ icon: AlignCenter, label: 'Rata tengah', value: 'center' as const, active: state.align === 'center' },
		{ icon: AlignRight, label: 'Rata kanan', value: 'right' as const, active: state.align === 'right' },
	]

	return createPortal(
		<div
			className="image-toolbar fixed z-40 flex items-center gap-0.5 rounded-full border border-line-strong bg-surface-raised px-1.5 py-1 shadow-[var(--menu-shadow)]"
			style={{ top: rect.top - 44, left: rect.left + rect.width / 2 }}
			onMouseDown={(e) => e.preventDefault()}
		>
			{buttons.map((btn) => (
				<button
					key={btn.value}
					type="button"
					title={btn.label}
					aria-label={btn.label}
					aria-pressed={btn.active}
					onClick={() => setAlign(btn.value)}
					className={cn(
						'flex h-7 w-7 items-center justify-center rounded-full transition-colors',
						btn.active ? 'bg-accent/15 text-accent' : 'text-muted hover:bg-[var(--overlay-hover)] hover:text-foreground',
					)}
				>
					<btn.icon className="h-4 w-4" />
				</button>
			))}
			<div className="mx-1 h-5 w-px bg-line-strong" />
			<button
				type="button"
				title="Hapus gambar"
				aria-label="Hapus gambar"
				onClick={() => editor.chain().focus().deleteSelection().run()}
				className="flex h-7 w-7 items-center justify-center rounded-full text-muted transition-colors hover:bg-red-500/10 hover:text-red-600"
			>
				<Trash2 className="h-4 w-4" />
			</button>
		</div>,
		document.body,
	)
}
