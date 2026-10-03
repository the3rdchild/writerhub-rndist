'use client'

import type { Editor } from '@tiptap/react'
import { useEditorState } from '@tiptap/react'
import {
	AlignCenter,
	AlignLeft,
	AlignRight,
	Captions,
	ChevronDown,
	ImageUp,
	type LucideIcon,
	Scaling,
	Trash2,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Dropdown, DropdownItem } from '@/components/ui/dropdown'
import { addOrEditImageCaption, promptForImage, resizeSelectedImage } from '@/features/editor/image-insert'
import { cn } from '@/lib/utils'

const TOOLBAR_HEIGHT = 36
const TOOLBAR_WIDTH = 310
const GAP = 8
/** Jarak dari tepi bawah gambar - menjauhi gagang sisi bawah. */
const INSIDE_GAP = 14

const SIZES: { label: string; value: number | 'original' }[] = [
	{ label: '25% of the column', value: 0.25 },
	{ label: '50% of the column', value: 0.5 },
	{ label: '75% of the column', value: 0.75 },
	{ label: 'Full column width', value: 1 },
	{ label: 'Original size', value: 'original' },
]

function ToolbarButton({
	icon: Icon,
	label,
	active,
	danger,
	onClick,
}: {
	icon: LucideIcon
	label: string
	active?: boolean
	danger?: boolean
	onClick: () => void
}) {
	return (
		<button
			type="button"
			title={label}
			aria-label={label}
			aria-pressed={active}
			onClick={onClick}
			className={cn(
				'flex h-7 w-7 items-center justify-center rounded-full transition-colors',
				active
					? 'bg-accent/15 text-accent'
					: danger
						? 'text-muted hover:bg-red-500/10 hover:text-red-600'
						: 'text-muted hover:bg-[var(--overlay-hover)] hover:text-foreground',
			)}
		>
			<Icon className="h-4 w-4" />
		</button>
	)
}

/**
 * Toolbar gambar terpilih: perataan, ukuran cepat, teks alt, keterangan, ganti,
 * hapus (OBJ-10). Dulu ia melayang di atas gambar dan menutupi baris teks
 * tepat di atasnya.
 */
export function ImageToolbar({ editor }: { editor: Editor | null }) {
	const state = useEditorState({
		editor,
		selector: ({ editor: instance }) => {
			if (!instance || instance.isDestroyed) return null
			if (!instance.isActive('image')) return null
			const attrs = instance.getAttributes('image') as { align?: string | null; alt?: string | null }
			return {
				align: (attrs.align ?? null) as 'left' | 'center' | 'right' | null,
				hasAlt: Boolean(attrs.alt?.trim()),
			}
		},
	})

	const [rect, setRect] = useState<DOMRect | null>(null)
	useEffect(
		function trackToolbarPosition() {
			if (!editor || !state) {
				setRect(null)
				return
			}
			const update = () => {
				const view = editor.view
				if (!view) return
				const { from } = view.state.selection
				const node = view.state.doc.nodeAt(from)
				if (!node || node.type.name !== 'image') {
					setRect(null)
					return
				}
				const dom = view.nodeDOM(from) as HTMLElement | null
				const figure = dom?.querySelector?.('.resizable-image-figure') ?? dom
				if (!figure) {
					setRect(null)
					return
				}
				const box = figure.getBoundingClientRect()
				if (box.bottom < 0 || box.top > window.innerHeight) {
					setRect(null)
					return
				}
				setRect(box)
			}
			update()
			editor.on('transaction', update)
			window.addEventListener('scroll', update, true)
			window.addEventListener('resize', update)
			return () => {
				editor.off('transaction', update)
				window.removeEventListener('scroll', update, true)
				window.removeEventListener('resize', update)
			}
		},
		[editor, state],
	)

	if (!editor || !state || !rect) return null
	const setAlign = (align: 'left' | 'center' | 'right') =>
		state.align === align
			? editor.chain().focus().unsetImageAlign().run()
			: editor.chain().focus().setImageAlign(align).run()

	/* Gambar yang cukup besar memuat toolbar di dalam tepi bawahnya (di atas
	 * gagang sisi bawah), jadi tidak ada teks yang tertutup; gambar kecil
	 * mendapatnya di bawah, atau di atas bila ruang bawah habis. */
	const fitsInside = rect.height >= TOOLBAR_HEIGHT * 3 && rect.width >= TOOLBAR_WIDTH + GAP * 2
	const fitsBelow = rect.bottom + GAP + TOOLBAR_HEIGHT <= window.innerHeight
	const top = fitsInside
		? Math.min(rect.bottom, window.innerHeight) - INSIDE_GAP - TOOLBAR_HEIGHT
		: fitsBelow
			? rect.bottom + GAP
			: Math.max(GAP, rect.top - GAP - TOOLBAR_HEIGHT)

	return createPortal(
		<div
			className="image-toolbar fixed z-40 flex items-center gap-0.5 rounded-full border border-line-strong bg-surface-raised px-1.5 py-1 shadow-[var(--menu-shadow)]"
			style={{ top, left: rect.left + rect.width / 2 }}
			onMouseDown={(event) => event.preventDefault()}
		>
			<ToolbarButton
				icon={AlignLeft}
				label="Align left"
				active={state.align === 'left' || !state.align}
				onClick={() => setAlign('left')}
			/>
			<ToolbarButton
				icon={AlignCenter}
				label="Align center"
				active={state.align === 'center'}
				onClick={() => setAlign('center')}
			/>
			<ToolbarButton
				icon={AlignRight}
				label="Align right"
				active={state.align === 'right'}
				onClick={() => setAlign('right')}
			/>
			<div className="mx-1 h-5 w-px bg-line-strong" />
			<Dropdown
				menuClassName="min-w-[180px]"
				trigger={({ open, toggle, id }) => (
					<button
						type="button"
						onClick={toggle}
						title="Size"
						aria-label="Size"
						aria-haspopup="menu"
						aria-expanded={open}
						aria-controls={id}
						className={cn(
							'flex h-7 items-center gap-0.5 rounded-full px-1.5 text-muted transition-colors',
							open ? 'bg-[var(--overlay-active)]' : 'hover:bg-[var(--overlay-hover)] hover:text-foreground',
						)}
					>
						<Scaling className="h-4 w-4" />
						<ChevronDown className="h-3 w-3" />
					</button>
				)}
			>
				{({ close }) => (
					<>
						{SIZES.map((size) => (
							<DropdownItem
								key={size.label}
								onSelect={() => {
									close()
									void resizeSelectedImage(editor, size.value)
								}}
							>
								{size.label}
							</DropdownItem>
						))}
					</>
				)}
			</Dropdown>
			<button
				type="button"
				title={state.hasAlt ? 'Edit alt text' : 'Add alt text'}
				aria-label={state.hasAlt ? 'Edit alt text' : 'Add alt text'}
				onClick={() => promptForImage(editor, 'alt')}
				className={cn(
					'flex h-7 items-center rounded-full px-2 text-xs font-semibold transition-colors',
					state.hasAlt
						? 'text-accent hover:bg-accent/10'
						: 'text-muted hover:bg-[var(--overlay-hover)] hover:text-foreground',
				)}
			>
				ALT
			</button>
			<ToolbarButton icon={Captions} label="Caption" onClick={() => addOrEditImageCaption(editor)} />
			<ToolbarButton icon={ImageUp} label="Replace image" onClick={() => promptForImage(editor, 'replace')} />
			<div className="mx-1 h-5 w-px bg-line-strong" />
			<ToolbarButton
				icon={Trash2}
				label="Delete image"
				danger
				onClick={() => editor.chain().focus().deleteSelection().run()}
			/>
		</div>,
		document.body,
	)
}
