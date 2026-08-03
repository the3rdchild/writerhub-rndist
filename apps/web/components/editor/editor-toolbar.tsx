'use client'

import {
	AlignCenter,
	AlignLeft,
	AlignRight,
	Bold,
	Heading1,
	Heading2,
	Heading3,
	Italic,
	Link,
	List,
	ListOrdered,
	type LucideIcon,
	Quote,
	Strikethrough,
	Underline,
} from 'lucide-react'
import { useCallback, useState } from 'react'
import { cn } from '@/lib/utils'

/**
 * Toolbar format berbasis `document.execCommand`.
 *
 * API itu memang sudah deprecated, tapi masih satu-satunya cara memformat
 * contenteditable polos tanpa engine editor. PRD menjadwalkan penggantian ke
 * Tiptap 3 (ProseMirror); saat itu berkas ini diganti perintah Tiptap.
 */

type Command =
	| 'bold'
	| 'italic'
	| 'underline'
	| 'strikeThrough'
	| 'insertUnorderedList'
	| 'insertOrderedList'
	| 'justifyLeft'
	| 'justifyCenter'
	| 'justifyRight'
	| 'formatBlock'
	| 'createLink'

interface ToolbarItem {
	command: Command
	icon: LucideIcon
	label: string
	value?: string
}

const TOOLBAR_GROUPS: ToolbarItem[][] = [
	[
		{ command: 'bold', icon: Bold, label: 'Bold' },
		{ command: 'italic', icon: Italic, label: 'Italic' },
		{ command: 'underline', icon: Underline, label: 'Underline' },
		{ command: 'strikeThrough', icon: Strikethrough, label: 'Strikethrough' },
	],
	[
		{ command: 'formatBlock', value: 'H1', icon: Heading1, label: 'Heading 1' },
		{ command: 'formatBlock', value: 'H2', icon: Heading2, label: 'Heading 2' },
		{ command: 'formatBlock', value: 'H3', icon: Heading3, label: 'Heading 3' },
	],
	[
		{ command: 'insertUnorderedList', icon: List, label: 'Bullet List' },
		{ command: 'insertOrderedList', icon: ListOrdered, label: 'Numbered List' },
		{ command: 'formatBlock', value: 'BLOCKQUOTE', icon: Quote, label: 'Quote' },
	],
	[
		{ command: 'justifyLeft', icon: AlignLeft, label: 'Align Left' },
		{ command: 'justifyCenter', icon: AlignCenter, label: 'Align Center' },
		{ command: 'justifyRight', icon: AlignRight, label: 'Align Right' },
	],
	[{ command: 'createLink', icon: Link, label: 'Link' }],
]

/** Perintah yang punya status aktif/tidak dan bisa ditanyakan ke browser. */
const STATEFUL_COMMANDS: Command[] = [
	'bold',
	'italic',
	'underline',
	'strikeThrough',
	'insertUnorderedList',
	'insertOrderedList',
	'justifyLeft',
	'justifyCenter',
	'justifyRight',
]

export function EditorToolbar({
	disabled,
	editorRef,
}: {
	disabled?: boolean
	editorRef: React.RefObject<HTMLDivElement | null>
}) {
	const [active, setActive] = useState<Set<Command>>(new Set())

	const refreshActive = useCallback(() => {
		const next = new Set<Command>()
		for (const command of STATEFUL_COMMANDS) {
			try {
				if (document.queryCommandState(command)) next.add(command)
			} catch {
				// browser menolak query untuk perintah ini — anggap tidak aktif
			}
		}
		setActive(next)
	}, [])

	const run = useCallback(
		(item: ToolbarItem) => {
			if (disabled) return

			// execCommand bekerja pada seleksi aktif, jadi fokus harus kembali dulu.
			editorRef.current?.focus()

			if (item.command === 'createLink') {
				const url = window.prompt('Masukkan URL:')
				if (url) document.execCommand('createLink', false, url)
			} else {
				document.execCommand(item.command, false, item.value)
			}

			refreshActive()
		},
		[disabled, editorRef, refreshActive],
	)

	return (
		<div
			className="flex items-center gap-0.5 rounded-lg border border-line bg-surface px-1.5 py-1"
			onMouseUp={refreshActive}
			onClick={refreshActive}
		>
			{TOOLBAR_GROUPS.map((group, groupIndex) => (
				<div key={group.map((item) => item.label).join()} className="flex items-center">
					{groupIndex > 0 && <div className="mx-1 h-4 w-px bg-line-strong" />}
					{group.map((item) => {
						const Icon = item.icon
						const isActive = !item.value && active.has(item.command)
						return (
							<button
								key={item.label}
								type="button"
								title={item.label}
								aria-label={item.label}
								disabled={disabled}
								onClick={() => run(item)}
								className={cn(
									'rounded-md p-1.5 transition-colors',
									isActive
										? 'bg-accent/20 text-accent'
										: 'text-muted hover:bg-[var(--overlay-hover)] hover:text-foreground',
									disabled && 'cursor-not-allowed opacity-40',
								)}
							>
								<Icon className="h-3.5 w-3.5" />
							</button>
						)
					})}
				</div>
			))}
		</div>
	)
}
