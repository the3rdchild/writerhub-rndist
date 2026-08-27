'use client'

import type { AnalysisFeature } from '@writer-hub/shared'
import type { Editor } from '@tiptap/react'
import {
	Bot,
	ChevronRight,
	MessageSquare,
	MessagesSquare,
	Quote,
	RefreshCw,
	Search,
	Sparkles,
	SpellCheck,
	UserCheck,
} from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { type PanelId, usePanels } from '@/features/analysis/panel-context'
import { useChat } from '@/features/chat/chat-context'
import { useDocumentLanguage } from '@/features/document/use-language'
import { COMMENT_MARK } from '@/features/comments/comment-mark'
import { useComments } from '@/features/comments/comments-context'
import {
	type EditorSelection,
	selectionTextRange,
	surroundingText,
	useEditorSelection,
} from '@/features/editor/selection'
import { cn } from '@/lib/utils'
import { AiEditPopover } from './ai-edit-popover'
import { CitationPopover } from './citation-popover'

const REVIEW_MODULES: Array<{ id: 'proofreader' | AnalysisFeature; label: string; icon: typeof Bot }> = [
	{ id: 'proofreader', label: 'Proofreader', icon: SpellCheck },
	{ id: 'ai_detector', label: 'AI Detector', icon: Bot },
	{ id: 'ai_rewriter', label: 'AI Rewriter', icon: RefreshCw },
	{ id: 'humanizer', label: 'Humanizer', icon: UserCheck },
	{ id: 'plagiarism', label: 'Plagiarism', icon: Search },
]

type OpenSection = 'review' | 'edit' | 'citations' | null

export function SelectionMenu({
	editor,
	containerRef,
}: {
	editor: Editor | null
	containerRef: React.RefObject<HTMLDivElement | null>
}) {
	const selection = useEditorSelection(editor)
	const [section, setSection] = useState<OpenSection>(null)
	const menuRef = useRef<HTMLDivElement>(null)
	useEffect(() => {
		setSection(null)
	}, [selection?.from, selection?.to])

	const anchor = useSelectionAnchor(editor, selection, containerRef)
	const top = useFlippedTop(anchor, menuRef, containerRef, section)

	if (!editor || !selection || !anchor || !containerRef.current) return null
	return createPortal(
		<div
			ref={menuRef}
			className="selection-menu absolute z-40"
			style={{ top, left: anchor.left }}
			onMouseDown={(event) => event.preventDefault()}
		>
			{section === 'edit' ? (
				<AiEditPopover editor={editor} selection={selection} onClose={() => setSection(null)} />
			) : section === 'citations' ? (
				<CitationPopover editor={editor} selection={selection} onClose={() => setSection(null)} />
			) : (
				<MenuBody editor={editor} selection={selection} section={section} onSection={setSection} />
			)}
		</div>,
		containerRef.current,
	)
}

function MenuBody({
	editor,
	selection,
	section,
	onSection,
}: {
	editor: Editor
	selection: EditorSelection
	section: OpenSection
	onSection: (section: OpenSection) => void
}) {
	const { setActivePanel, markRun } = usePanels()
	const { attach } = useChat()
	const { startPending } = useComments()
	const language = useDocumentLanguage()

	const sendToChat = () => {
		const range = selectionTextRange(editor, selection)
		attach({
			text: selection.text,
			surrounding: surroundingText(editor, selection),
			offset: range?.offset ?? 0,
			length: range?.length ?? selection.text.length,
		})
		setActivePanel('ai_chat')
	}

	const runModule = (id: 'proofreader' | AnalysisFeature) => {
		if (id !== 'proofreader') {
			const range = selectionTextRange(editor, selection)
			markRun(id, {
				text: selection.text,
				offset: range?.offset ?? 0,
				scoped: true,
				language: language.code,
			})
		}
		setActivePanel(id)
	}
	const comment = () => {
		startPending({
			from: selection.from,
			to: selection.to,
			quote: selection.text.slice(0, 300),
		})
		setActivePanel('comments')
	}

	const alreadyCommented = editor.isActive(COMMENT_MARK)

	return (
		<div className="flex min-w-[210px] flex-col overflow-hidden rounded-xl border border-line-strong bg-surface-raised py-1 shadow-[var(--menu-shadow)]">
			<MenuItem icon={Quote} label="Find citations" onClick={() => onSection('citations')} />
			<MenuItem icon={MessagesSquare} label="AI Chat" onClick={sendToChat} />
			<MenuItem icon={Sparkles} label="AI Edit" onClick={() => onSection('edit')} />
			<MenuItem
				icon={MessageSquare}
				label={alreadyCommented ? 'Comment again' : 'Comment'}
				onClick={comment}
			/>

			<button
				type="button"
				onClick={() => onSection(section === 'review' ? null : 'review')}
				aria-expanded={section === 'review'}
				className="flex items-center gap-3 px-3 py-1.5 text-left text-sm text-foreground transition-colors hover:bg-[var(--overlay-hover)]"
			>
				<SpellCheck className="h-4 w-4 shrink-0 text-subtle" />
				<span className="flex-1">Review</span>
				<ChevronRight
					className={cn('h-3.5 w-3.5 text-faint transition-transform', section === 'review' && 'rotate-90')}
				/>
			</button>

			{section === 'review' && (
				<div className="border-t border-line bg-[var(--overlay-hover)] py-1">
					{REVIEW_MODULES.map(({ id, label, icon: Icon }) => (
						<button
							key={id}
							type="button"
							onClick={() => runModule(id)}
							className="flex w-full items-center gap-3 px-3 py-1.5 pl-6 text-left text-[13px] text-muted transition-colors hover:text-foreground"
						>
							<Icon className="h-3.5 w-3.5 shrink-0" />
							{label}
						</button>
					))}
				</div>
			)}

			<div className="mt-1 border-t border-line px-3 pb-0.5 pt-1.5 text-[11px] text-faint">
				{selection.words} {selection.words === 1 ? 'word' : 'words'}
			</div>
		</div>
	)
}

function MenuItem({ icon: Icon, label, onClick }: { icon: typeof Bot; label: string; onClick: () => void }) {
	return (
		<button
			type="button"
			onClick={onClick}
			className="flex items-center gap-3 px-3 py-1.5 text-left text-sm text-foreground transition-colors hover:bg-[var(--overlay-hover)]"
		>
			<Icon className="h-4 w-4 shrink-0 text-subtle" />
			<span className="flex-1">{label}</span>
		</button>
	)
}

const MENU_GAP = 8
const MENU_MAX_WIDTH = 340

interface Anchor {
	top: number
	bottom: number
	left: number
}

function useSelectionAnchor(
	editor: Editor | null,
	selection: EditorSelection | null,
	containerRef: React.RefObject<HTMLDivElement | null>,
): Anchor | null {
	const [anchor, setAnchor] = useState<Anchor | null>(null)

	useEffect(() => {
		const container = containerRef.current
		if (!editor || !selection || !container) {
			setAnchor(null)
			return
		}

		const update = () => {
			const from = editor.view.coordsAtPos(selection.from)
			const to = editor.view.coordsAtPos(selection.to)
			const rect = container.getBoundingClientRect()
			setAnchor({
				top: Math.min(from.top, to.top) - rect.top,
				bottom: Math.max(from.bottom, to.bottom) - rect.top,
				left: Math.max(8, Math.min(from.left - rect.left, rect.width - MENU_MAX_WIDTH - 8)),
			})
		}

		update()
		const canvas = container.querySelector('.document-canvas')
		canvas?.addEventListener('scroll', update, { passive: true })
		window.addEventListener('resize', update)
		return () => {
			canvas?.removeEventListener('scroll', update)
			window.removeEventListener('resize', update)
		}
	}, [editor, selection, containerRef])

	return anchor
}

function useFlippedTop(
	anchor: Anchor | null,
	menuRef: React.RefObject<HTMLDivElement | null>,
	containerRef: React.RefObject<HTMLDivElement | null>,
	section: OpenSection,
): number {
	const [top, setTop] = useState(0)

	useLayoutEffect(() => {
		const menu = menuRef.current
		const container = containerRef.current
		if (!anchor || !menu || !container) return

		const height = menu.offsetHeight
		const below = anchor.bottom + MENU_GAP
		const fitsBelow = below + height <= container.clientHeight - MENU_GAP

		setTop(fitsBelow ? below : Math.max(MENU_GAP, anchor.top - height - MENU_GAP))
	}, [anchor, menuRef, containerRef, section])

	return top
}
