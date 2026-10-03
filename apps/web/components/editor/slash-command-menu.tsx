'use client'

import type { Editor } from '@tiptap/react'
import {
	CheckSquare,
	Code2,
	Columns2,
	Footprints,
	Heading1,
	Heading2,
	Heading3,
	Image as ImageIcon,
	List,
	ListOrdered,
	Minus,
	Quote,
	Sigma,
	Table as TableIcon,
	Text,
} from 'lucide-react'
import { type JSX, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CALLOUT_TYPES } from '@/features/editor/callout'
import { CODE_LANGUAGES } from '@/features/editor/code-block'
import { insertFootnoteAndEdit } from '@/features/editor/footnote'
import { promptForImage } from '@/features/editor/image-insert'
import { insertOrConvertMath } from '@/features/editor/math'
import type { SlashCommandState } from '@/features/editor/slash-command'
import { rankSlashItems } from '@/features/editor/slash-rank'
import { cn } from '@/lib/utils'

interface SlashItem {
	id: string
	label: string
	icon: JSX.Element
	keywords: string[]
	run: (editor: Editor) => void
}

function buildItems(editor: Editor): SlashItem[] {
	return [
		{
			id: 'text',
			label: 'Text',
			icon: <Text className="h-4 w-4" />,
			keywords: ['paragraf', 'paragraph', 'p'],
			run: (e) => e.chain().focus().setParagraph().run(),
		},
		{
			id: 'h1',
			label: 'Heading 1',
			icon: <Heading1 className="h-4 w-4" />,
			keywords: ['heading', 'judul'],
			run: (e) => e.chain().focus().toggleHeading({ level: 1 }).run(),
		},
		{
			id: 'h2',
			label: 'Heading 2',
			icon: <Heading2 className="h-4 w-4" />,
			keywords: ['heading', 'judul'],
			run: (e) => e.chain().focus().toggleHeading({ level: 2 }).run(),
		},
		{
			id: 'h3',
			label: 'Heading 3',
			icon: <Heading3 className="h-4 w-4" />,
			keywords: ['heading', 'judul'],
			run: (e) => e.chain().focus().toggleHeading({ level: 3 }).run(),
		},
		{
			id: 'bullet',
			label: 'Bulleted list',
			icon: <List className="h-4 w-4" />,
			keywords: ['list', 'bullet', 'ul'],
			run: (e) => e.chain().focus().toggleBulletList().run(),
		},
		{
			id: 'ordered',
			label: 'Numbered list',
			icon: <ListOrdered className="h-4 w-4" />,
			keywords: ['list', 'ordered', 'ol', 'nomor'],
			run: (e) => e.chain().focus().toggleOrderedList().run(),
		},
		{
			id: 'task',
			label: 'Checklist',
			icon: <CheckSquare className="h-4 w-4" />,
			keywords: ['task', 'todo', 'centang'],
			run: (e) => e.chain().focus().toggleTaskList().run(),
		},
		{
			id: 'quote',
			label: 'Quote',
			icon: <Quote className="h-4 w-4" />,
			keywords: ['blockquote', 'quote', 'kutip'],
			run: (e) => e.chain().focus().toggleBlockquote().run(),
		},
		{
			id: 'divider',
			label: 'Divider',
			icon: <Minus className="h-4 w-4" />,
			keywords: ['hr', 'divider', 'horizontal', 'pembatas'],
			run: (e) => e.chain().focus().setHorizontalRule().run(),
		},
		{
			id: 'code',
			label: 'Code block',
			icon: <Code2 className="h-4 w-4" />,
			keywords: ['code', 'kode', CODE_LANGUAGES.map((l) => l.label).join(' ')],
			run: (e) => e.chain().focus().toggleCodeBlock().run(),
		},
		{
			id: 'formula',
			label: 'Formula',
			icon: <Sigma className="h-4 w-4" />,
			keywords: ['formula', 'rumus', 'math', 'equation', 'persamaan', 'latex'],
			run: (e) => insertOrConvertMath(e, false),
		},
		{
			id: 'formula-block',
			label: 'Block formula',
			icon: <Sigma className="h-4 w-4" />,
			keywords: ['block formula', 'rumus blok', 'display', 'equation', 'persamaan', 'latex'],
			run: (e) => insertOrConvertMath(e, true),
		},
		{
			id: 'toc',
			label: 'Table of contents',
			icon: <List className="h-4 w-4" />,
			keywords: ['toc', 'daftar isi', 'table of contents', 'isi'],
			run: (e) => e.chain().focus().insertToc({ listKind: 'isi' }).run(),
		},
		{
			id: 'toc-gambar',
			label: 'List of figures',
			icon: <List className="h-4 w-4" />,
			keywords: ['daftar gambar', 'lof', 'gambar', 'figures'],
			run: (e) => e.chain().focus().insertToc({ listKind: 'gambar' }).run(),
		},
		{
			id: 'toc-tabel',
			label: 'List of tables',
			icon: <List className="h-4 w-4" />,
			keywords: ['daftar tabel', 'lot', 'tabel', 'tables'],
			run: (e) => e.chain().focus().insertToc({ listKind: 'tabel' }).run(),
		},
		{
			id: 'footnote',
			label: 'Footnote',
			icon: <Footprints className="h-4 w-4" />,
			keywords: ['footnote', 'catatan kaki'],
			run: (e) => insertFootnoteAndEdit(e),
		},
		{
			id: 'columns',
			label: 'Two columns',
			icon: <Columns2 className="h-4 w-4" />,
			keywords: ['columns', 'kolom', 'multi', 'layout'],
			run: (e) => e.chain().focus().setColumns(2).run(),
		},
		{
			id: 'table',
			label: 'Table',
			icon: <TableIcon className="h-4 w-4" />,
			keywords: ['table', 'tabel', 'grid'],
			run: (e) => e.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
		},
		{
			id: 'image',
			label: 'Image',
			icon: <ImageIcon className="h-4 w-4" />,
			keywords: ['image', 'gambar', 'upload', 'media'],
			run: (e) => promptForImage(e),
		},
		...CALLOUT_TYPES.map((c) => ({
			id: `callout-${c.id}`,
			label: `Callout (${c.label})`,
			icon: <span className="text-sm">{c.emoji}</span>,
			keywords: ['callout', c.id, c.label],
			run: (e: Editor) =>
				e
					.chain()
					.focus()
					.setCallout(c.id as 'info')
					.run(),
		})),
	]
}

export function SlashCommandMenu({
	editor,
	state,
	onClose,
}: {
	editor: Editor
	state: SlashCommandState
	onClose: () => void
}) {
	const items = useMemo(() => buildItems(editor), [editor])
	const rect = state.clientRect?.() ?? null
	const [active, setActive] = useState(0)

	const filtered = useMemo(() => rankSlashItems(items, state.query), [items, state.query])
	useEffect(
		function resetActiveOnQueryChange() {
			setActive(0)
		},
		[state.query],
	)
	useEffect(
		function keepActiveWithinRange() {
			if (active >= filtered.length) setActive(0)
		},
		[filtered.length, active],
	)

	const listRef = useRef<HTMLDivElement>(null)

	const apply = (item: SlashItem | undefined) => {
		if (!item || !state.range) return
		editor.chain().focus().deleteRange({ from: state.range.from, to: state.range.to }).run()
		item.run(editor)
		onClose()
	}
	useEffect(
		function handleMenuKeyboard() {
			const onKeyDown = (event: KeyboardEvent) => {
				if (!state.open) return
				if (event.key === 'ArrowDown') {
					event.preventDefault()
					setActive((i) => (i + 1) % Math.max(1, filtered.length))
				} else if (event.key === 'ArrowUp') {
					event.preventDefault()
					setActive((i) => (i - 1 + Math.max(1, filtered.length)) % Math.max(1, filtered.length))
				} else if (event.key === 'Enter') {
					/* Tanpa hasil, Enter milik editor lagi (baris baru) - dulu ia tertelan. */
					if (filtered.length === 0) {
						onClose()
						return
					}
					event.preventDefault()
					apply(filtered[active])
				} else if (event.key === 'Escape') {
					event.preventDefault()
					onClose()
				}
			}
			window.addEventListener('keydown', onKeyDown, true)
			return () => window.removeEventListener('keydown', onKeyDown, true)
		},
		[filtered, active, state.open, state.query],
	)

	if (!rect) return null

	const top = rect.bottom + 6
	const left = rect.left

	return createPortal(
		<div
			ref={listRef}
			className="slash-command-menu fixed z-50 max-h-72 w-64 overflow-y-auto rounded-xl border border-line-strong bg-surface-raised p-1 shadow-[var(--menu-shadow)]"
			style={{ top, left }}
			onMouseDown={(e) => e.preventDefault()}
		>
			{filtered.length === 0 && <div className="px-3 py-2 text-sm text-muted">No matches</div>}
			{filtered.map((item, index) => (
				<button
					key={item.id}
					type="button"
					onMouseEnter={() => setActive(index)}
					onClick={() => apply(item)}
					className={cn(
						'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors',
						index === active ? 'bg-accent/10 text-accent' : 'text-foreground hover:bg-[var(--overlay-hover)]',
					)}
				>
					<span className="flex h-6 w-6 items-center justify-center">{item.icon}</span>
					{item.label}
				</button>
			))}
		</div>,
		document.body,
	)
}
