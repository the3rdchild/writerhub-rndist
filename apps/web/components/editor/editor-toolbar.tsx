'use client'

import type { Editor } from '@tiptap/react'
import { useEditorState } from '@tiptap/react'
import {
	AlignCenter,
	AlignJustify,
	AlignLeft,
	AlignRight,
	Bold,
	Heading1,
	Heading2,
	Heading3,
	Italic,
	Link as LinkIcon,
	List,
	ListOrdered,
	type LucideIcon,
	Quote,
	Redo2,
	Strikethrough,
	Table as TableIcon,
	Underline as UnderlineIcon,
	Undo2,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface ToolbarItem {
	icon: LucideIcon
	label: string
	run: (editor: Editor) => void
	/** Kunci status aktif; dibaca dari useEditorState di bawah. */
	activeKey?: keyof ActiveState
	disabledWhenEmpty?: boolean
}

interface ActiveState {
	bold: boolean
	italic: boolean
	strike: boolean
	h1: boolean
	h2: boolean
	h3: boolean
	bulletList: boolean
	orderedList: boolean
	blockquote: boolean
	alignLeft: boolean
	alignCenter: boolean
	alignRight: boolean
	alignJustify: boolean
	link: boolean
	canUndo: boolean
	canRedo: boolean
}

const GROUPS: ToolbarItem[][] = [
	[
		{ icon: Undo2, label: 'Undo', run: (e) => e.chain().focus().undo().run() },
		{ icon: Redo2, label: 'Redo', run: (e) => e.chain().focus().redo().run() },
	],
	[
		{ icon: Bold, label: 'Tebal', activeKey: 'bold', run: (e) => e.chain().focus().toggleBold().run() },
		{ icon: Italic, label: 'Miring', activeKey: 'italic', run: (e) => e.chain().focus().toggleItalic().run() },
		{
			icon: UnderlineIcon,
			label: 'Garis bawah',
			run: (e) => e.chain().focus().toggleUnderline().run(),
		},
		{
			icon: Strikethrough,
			label: 'Coret',
			activeKey: 'strike',
			run: (e) => e.chain().focus().toggleStrike().run(),
		},
	],
	[
		{ icon: Heading1, label: 'Judul 1', activeKey: 'h1', run: (e) => e.chain().focus().toggleHeading({ level: 1 }).run() },
		{ icon: Heading2, label: 'Judul 2', activeKey: 'h2', run: (e) => e.chain().focus().toggleHeading({ level: 2 }).run() },
		{ icon: Heading3, label: 'Judul 3', activeKey: 'h3', run: (e) => e.chain().focus().toggleHeading({ level: 3 }).run() },
	],
	[
		{ icon: List, label: 'Daftar butir', activeKey: 'bulletList', run: (e) => e.chain().focus().toggleBulletList().run() },
		{ icon: ListOrdered, label: 'Daftar nomor', activeKey: 'orderedList', run: (e) => e.chain().focus().toggleOrderedList().run() },
		{ icon: Quote, label: 'Kutipan', activeKey: 'blockquote', run: (e) => e.chain().focus().toggleBlockquote().run() },
	],
	[
		{ icon: AlignLeft, label: 'Rata kiri', activeKey: 'alignLeft', run: (e) => e.chain().focus().setTextAlign('left').run() },
		{ icon: AlignCenter, label: 'Rata tengah', activeKey: 'alignCenter', run: (e) => e.chain().focus().setTextAlign('center').run() },
		{ icon: AlignRight, label: 'Rata kanan', activeKey: 'alignRight', run: (e) => e.chain().focus().setTextAlign('right').run() },
		{ icon: AlignJustify, label: 'Rata kanan-kiri', activeKey: 'alignJustify', run: (e) => e.chain().focus().setTextAlign('justify').run() },
	],
	[
		{ icon: LinkIcon, label: 'Tautan', activeKey: 'link', run: setLink },
		{
			icon: TableIcon,
			label: 'Tabel',
			run: (e) => e.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
		},
	],
]

function setLink(editor: Editor) {
	const previous = editor.getAttributes('link').href as string | undefined
	const url = window.prompt('Masukkan URL:', previous ?? '')
	if (url === null) return

	if (url === '') {
		editor.chain().focus().extendMarkRange('link').unsetLink().run()
		return
	}
	editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
}

export function EditorToolbar({ editor, disabled }: { editor: Editor | null; disabled?: boolean }) {
	// useEditorState hanya me-render ulang saat nilai yang dipilih berubah —
	// tanpa ini toolbar ikut render pada setiap ketukan tombol.
	const active = useEditorState({
		editor,
		selector: ({ editor: instance }): ActiveState => ({
			bold: !!instance?.isActive('bold'),
			italic: !!instance?.isActive('italic'),
			strike: !!instance?.isActive('strike'),
			h1: !!instance?.isActive('heading', { level: 1 }),
			h2: !!instance?.isActive('heading', { level: 2 }),
			h3: !!instance?.isActive('heading', { level: 3 }),
			bulletList: !!instance?.isActive('bulletList'),
			orderedList: !!instance?.isActive('orderedList'),
			blockquote: !!instance?.isActive('blockquote'),
			alignLeft: !!instance?.isActive({ textAlign: 'left' }),
			alignCenter: !!instance?.isActive({ textAlign: 'center' }),
			alignRight: !!instance?.isActive({ textAlign: 'right' }),
			alignJustify: !!instance?.isActive({ textAlign: 'justify' }),
			link: !!instance?.isActive('link'),
			canUndo: !!instance?.can().undo(),
			canRedo: !!instance?.can().redo(),
		}),
	})

	return (
		<div className="flex flex-wrap items-center justify-center gap-0.5 rounded-xl border border-line bg-surface px-2 py-1.5">
			{GROUPS.map((group, groupIndex) => (
				<div key={group.map((item) => item.label).join()} className="flex items-center">
					{groupIndex > 0 && <div className="mx-1.5 h-5 w-px bg-line-strong" />}
					{group.map((item) => {
						const Icon = item.icon
						const isActive = item.activeKey ? Boolean(active?.[item.activeKey]) : false
						return (
							<button
								key={item.label}
								type="button"
								title={item.label}
								aria-label={item.label}
								aria-pressed={isActive}
								disabled={disabled || !editor}
								onClick={() => editor && item.run(editor)}
								className={cn(
									'rounded-md p-1.5 transition-colors',
									isActive
										? 'bg-accent/15 text-accent'
										: 'text-muted hover:bg-[var(--overlay-hover)] hover:text-foreground',
									(disabled || !editor) && 'cursor-not-allowed opacity-40',
								)}
							>
								<Icon className="h-4 w-4" />
							</button>
						)
					})}
				</div>
			))}
		</div>
	)
}
