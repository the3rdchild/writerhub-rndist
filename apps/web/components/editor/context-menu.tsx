'use client'

import type { Editor } from '@tiptap/react'
import { ClipboardPaste, ClipboardType, Copy, Eraser, Scissors, Trash2 } from 'lucide-react'
import { type JSX, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
	clearFormatting,
	copySelection,
	cutSelection,
	pasteFromClipboard,
	pastePlainTextFromClipboard,
} from '@/features/editor/clipboard'
import { useShortcutLabel } from '@/features/shortcuts/use-shortcuts'
import { cn } from '@/lib/utils'

/*
 * Menu konteks editor: klik kanan di badan dokumen membuka daftar operasi
 * suntingan standar (potong/salin/tempel/hapus/bersihkan format), lengkap
 * dengan petunjuk pintasannya. Sel tabel dikesampingkan - menu tabel punya
 * konteksnya sendiri (lihat TableControls).
 */

interface MenuState {
	x: number
	y: number
	/** Terseleksi saat menu dibuka; tanpa ini tidak ada yang bisa dipotong/disalin. */
	hasSelection: boolean
}

interface MenuRow {
	label: string
	shortcut?: string
	icon: JSX.Element
	disabled?: boolean
	separatorBefore?: boolean
	onClick: () => void
}

const EDGE = 8

export function EditorContextMenu({ editor }: { editor: Editor | null }) {
	const [menu, setMenu] = useState<MenuState | null>(null)
	const keys = useShortcutLabel()

	useEffect(
		function openMenuOnContextMenu() {
			if (!editor || editor.isDestroyed) return
			const dom = editor.view.dom
			const onContext = (e: MouseEvent) => {
				const target = e.target as HTMLElement | null
				// Sel tabel punya menu konteksnya sendiri.
				if (target?.closest('td, th')) return
				if (!target || !dom.contains(target)) return
				e.preventDefault()
				setMenu({
					x: e.clientX,
					y: e.clientY,
					hasSelection: !editor.state.selection.empty,
				})
			}
			dom.addEventListener('contextmenu', onContext)
			return () => dom.removeEventListener('contextmenu', onContext)
		},
		[editor],
	)

	const closeMenu = useCallback(() => setMenu(null), [])

	if (!editor || !menu) return null

	return <ContextMenuPanel editor={editor} menu={menu} keys={keys} onClose={closeMenu} />
}

function ContextMenuPanel({
	editor,
	menu,
	keys,
	onClose,
}: {
	editor: Editor
	menu: MenuState
	keys: (id: Parameters<ReturnType<typeof useShortcutLabel>>[0]) => string
	onClose: () => void
}) {
	const ref = useRef<HTMLDivElement>(null)
	const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
	const [active, setActive] = useState(0)

	const items: MenuRow[] = useMemo(
		() => [
			{
				label: 'Cut',
				shortcut: keys('doc.cut'),
				icon: <Scissors className="h-4 w-4" />,
				disabled: !menu.hasSelection,
				onClick: () => void cutSelection(editor),
			},
			{
				label: 'Copy',
				shortcut: keys('doc.copy'),
				icon: <Copy className="h-4 w-4" />,
				disabled: !menu.hasSelection,
				onClick: () => void copySelection(editor),
			},
			{
				label: 'Paste',
				shortcut: keys('doc.paste'),
				icon: <ClipboardPaste className="h-4 w-4" />,
				onClick: () => void pasteFromClipboard(editor),
			},
			{
				label: 'Paste without formatting',
				shortcut: keys('doc.pastePlain'),
				icon: <ClipboardType className="h-4 w-4" />,
				onClick: () => void pastePlainTextFromClipboard(editor),
			},
			{
				label: 'Delete',
				icon: <Trash2 className="h-4 w-4" />,
				disabled: !menu.hasSelection,
				separatorBefore: true,
				onClick: () => editor.chain().focus().deleteSelection().run(),
			},
			{
				label: 'Clear formatting',
				shortcut: keys('text.clearFormatting'),
				icon: <Eraser className="h-4 w-4" />,
				disabled: !menu.hasSelection,
				onClick: () => clearFormatting(editor),
			},
		],
		[editor, menu.hasSelection, keys],
	)
	const closeAfter = (fn: () => void) => () => {
		fn()
		onClose()
	}

	const place = useCallback(() => {
		const el = ref.current
		if (!el) return
		const { width, height } = el.getBoundingClientRect()
		const top = menu.y + height > window.innerHeight - EDGE ? Math.max(EDGE, menu.y - height) : menu.y
		const left = menu.x + width > window.innerWidth - EDGE ? Math.max(EDGE, menu.x - width) : menu.x
		setPos({ top, left })
	}, [menu.x, menu.y])

	useLayoutEffect(place, [place])
	useEffect(
		function closeOnOutsideInteraction() {
			const onPointer = (e: PointerEvent) => {
				if (!ref.current?.contains(e.target as Node)) onClose()
			}
			// Menu konteks mengikuti konvensi peramban: menggulir menutupnya.
			const onCloseEvent = () => onClose()
			document.addEventListener('pointerdown', onPointer)
			window.addEventListener('scroll', onCloseEvent, true)
			window.addEventListener('resize', onCloseEvent)
			return () => {
				document.removeEventListener('pointerdown', onPointer)
				window.removeEventListener('scroll', onCloseEvent, true)
				window.removeEventListener('resize', onCloseEvent)
			}
		},
		[onClose],
	)
	useEffect(
		function handleMenuKeyboard() {
			const onKey = (e: KeyboardEvent) => {
				if (e.key === 'Escape') {
					e.preventDefault()
					onClose()
				} else if (e.key === 'ArrowDown') {
					e.preventDefault()
					setActive((i) => Math.min(i + 1, items.length - 1))
				} else if (e.key === 'ArrowUp') {
					e.preventDefault()
					setActive((i) => Math.max(i - 1, 0))
				} else if (e.key === 'Enter') {
					const item = items[active]
					if (item && !item.disabled) {
						e.preventDefault()
						item.onClick()
						onClose()
					}
				}
			}
			window.addEventListener('keydown', onKey)
			return () => window.removeEventListener('keydown', onKey)
		},
		[items, active, onClose],
	)

	return createPortal(
		<div
			ref={ref}
			role="menu"
			className="fixed z-50 max-h-[70vh] min-w-[240px] overflow-y-auto rounded-xl border border-line-strong bg-surface-raised py-1 shadow-[var(--menu-shadow)]"
			style={{ top: pos?.top ?? 0, left: pos?.left ?? 0, visibility: pos ? 'visible' : 'hidden' }}
			onMouseDown={(e) => e.preventDefault()}
			onContextMenu={(e) => e.preventDefault()}
		>
			{items.map((item, i) => (
				<div key={item.label}>
					{item.separatorBefore && <div className="my-1 h-px bg-line" />}
					<button
						type="button"
						role="menuitem"
						onMouseEnter={() => setActive(i)}
						onClick={closeAfter(item.onClick)}
						disabled={item.disabled}
						className={cn(
							'flex w-full items-center gap-3 px-3 py-1.5 text-left text-sm transition-colors',
							i === active && !item.disabled
								? 'bg-accent/10 text-accent'
								: item.disabled
									? 'text-faint'
									: 'text-foreground hover:bg-[var(--overlay-hover)]',
							item.disabled && 'cursor-not-allowed',
						)}
					>
						<span className="flex h-4 w-4 shrink-0 items-center justify-center">{item.icon}</span>
						<span className="flex-1 truncate">{item.label}</span>
						{item.shortcut && <span className="shrink-0 text-xs text-faint">{item.shortcut}</span>}
					</button>
				</div>
			))}
		</div>,
		document.body,
	)
}
