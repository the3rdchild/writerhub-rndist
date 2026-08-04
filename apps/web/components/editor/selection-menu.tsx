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
import { useEffect, useRef, useState } from 'react'
import { type PanelId, usePanels } from '@/features/analysis/panel-context'
import { useChat } from '@/features/chat/chat-context'
import { useSessions } from '@/features/sessions/session-context'
import { COMMENT_MARK } from '@/features/comments/comment-mark'
import {
	type EditorSelection,
	selectionTextRange,
	surroundingText,
	useEditorSelection,
} from '@/features/editor/selection'
import { cn } from '@/lib/utils'
import { AiEditPopover } from './ai-edit-popover'
import { CitationPopover } from './citation-popover'

/**
 * Menu yang muncul di atas teks yang disorot.
 *
 * Modul di panel kanan bekerja atas seluruh naskah; menu ini menjalankan hal
 * yang sama pada satu bagian saja. Bedanya bukan sekadar kenyamanan — pada
 * dokumen puluhan halaman, memeriksa satu paragraf jauh lebih cepat dan jauh
 * lebih murah daripada memeriksa semuanya.
 */

/**
 * Modul yang bisa dijalankan hanya pada bagian yang disorot.
 *
 * Proofreader ikut di sini walau jalurnya berbeda: ia memakai pipeline grammar,
 * bukan endpoint analisis, jadi ia hanya dibuka — bukan diberi potongan teks.
 */
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

	// Seleksi berganti berarti keputusan sebelumnya sudah tidak relevan.
	useEffect(() => {
		setSection(null)
	}, [selection?.from, selection?.to])

	const position = useMenuPosition(editor, selection, containerRef)
	if (!editor || !selection || !position) return null

	return (
		<div
			ref={menuRef}
			className="selection-menu absolute z-40"
			style={{ top: position.top, left: position.left }}
			// Menahan mousedown supaya seleksi di editor tidak hilang saat menu diklik.
			onMouseDown={(event) => event.preventDefault()}
		>
			{section === 'edit' ? (
				<AiEditPopover editor={editor} selection={selection} onClose={() => setSection(null)} />
			) : section === 'citations' ? (
				<CitationPopover editor={editor} selection={selection} onClose={() => setSection(null)} />
			) : (
				<MenuBody
					editor={editor}
					selection={selection}
					section={section}
					onSection={setSection}
				/>
			)}
		</div>
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
	const { addComment } = useSessions()

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
		// Proofreader memakai jalur grammar, bukan endpoint analisis; ia dibuka
		// saja, sedangkan modul analisis diberi potongan teksnya langsung.
		if (id !== 'proofreader') {
			const range = selectionTextRange(editor, selection)
			markRun(id, {
				text: selection.text,
				offset: range?.offset ?? 0,
				scoped: true,
			})
		}
		setActivePanel(id)
	}

	const comment = () => {
		const id = `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
		editor.chain().focus().setComment(id).run()
		addComment({
			id,
			quote: selection.text.slice(0, 300),
			replies: [],
			resolved: false,
			createdAt: Date.now(),
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

function MenuItem({
	icon: Icon,
	label,
	onClick,
}: {
	icon: typeof Bot
	label: string
	onClick: () => void
}) {
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

/**
 * Letak menu, dalam koordinat container dokumen.
 *
 * `coordsAtPos` mengembalikan koordinat layar yang sudah memperhitungkan zoom
 * dan gulungan, jadi tidak perlu mengoreksi transform kanvas sendiri.
 */
function useMenuPosition(
	editor: Editor | null,
	selection: EditorSelection | null,
	containerRef: React.RefObject<HTMLDivElement | null>,
) {
	const [position, setPosition] = useState<{ top: number; left: number } | null>(null)

	useEffect(() => {
		const container = containerRef.current
		if (!editor || !selection || !container) {
			setPosition(null)
			return
		}

		const update = () => {
			const start = editor.view.coordsAtPos(selection.from)
			const rect = container.getBoundingClientRect()
			setPosition({
				top: start.bottom - rect.top + container.scrollTop + 8,
				left: Math.max(8, Math.min(start.left - rect.left, rect.width - 230)),
			})
		}

		update()
		// Menu ikut berpindah saat kanvas digulung, bukan menggantung di tempat lama.
		const canvas = container.querySelector('.document-canvas')
		canvas?.addEventListener('scroll', update)
		return () => canvas?.removeEventListener('scroll', update)
	}, [editor, selection, containerRef])

	return position
}
