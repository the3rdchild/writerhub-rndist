'use client'

import { X } from 'lucide-react'
import { useEffect } from 'react'
import { type PanelId, usePanels } from '@/features/analysis/panel-context'
import { useDocument } from '@/features/document/document-context'
import { AiChatPanel } from './ai-chat-panel'
import { AiDetectorPanel } from './ai-detector-panel'
import { CommentsPanel } from './comments-panel'
import { AiRewriterPanel } from './ai-rewriter-panel'
import { GlossaryPanel } from './glossary-panel'
import { HumanizerPanel } from './humanizer-panel'
import { PlagiarismPanel } from './plagiarism-panel'
import { ProofreaderPanel } from './proofreader-panel'
import { TranslatorPanel } from './translator-panel'

const PANEL_TITLES: Record<PanelId, string> = {
	ai_chat: 'AI Chat',
	comments: 'Comments',
	proofreader: 'Proofreader',
	ai_detector: 'AI Detector',
	ai_rewriter: 'AI Rewriter',
	humanizer: 'Humanizer',
	plagiarism: 'Plagiarism Checker',
	translator: 'Translator',
	glossary: 'Glosarium',
}

function PanelBody({ panel }: { panel: PanelId }) {
	switch (panel) {
		case 'ai_chat':
			return <AiChatPanel />
		case 'comments':
			return <CommentsPanel />
		case 'proofreader':
			return <ProofreaderPanel />
		case 'ai_detector':
			return <AiDetectorPanel />
		case 'ai_rewriter':
			return <AiRewriterPanel />
		case 'humanizer':
			return <HumanizerPanel />
		case 'plagiarism':
			return <PlagiarismPanel />
		case 'translator':
			return <TranslatorPanel />
		case 'glossary':
			return <GlossaryPanel />
	}
}

export function PanelContainer({ panel }: { panel: PanelId }) {
	const { setActivePanel } = usePanels()
	const { dispatch } = useDocument()
	useEffect(() => {
		dispatch({ type: 'setHoveredRange', range: null })
		dispatch({ type: 'setFocusedRange', range: null })
	}, [panel, dispatch])

	return (
		<div className="flex w-[340px] shrink-0 flex-col overflow-hidden rounded-2xl bg-surface">
			<div className="flex shrink-0 items-center justify-between px-4 py-2.5">
				<h2 className="text-sm font-semibold text-foreground">{PANEL_TITLES[panel]}</h2>
				<button
					type="button"
					onClick={() => setActivePanel(null)}
					aria-label="Close panel"
					title="Close panel"
					className="rounded-md p-1 text-subtle transition-colors hover:bg-[var(--overlay-hover)] hover:text-foreground"
				>
					<X className="h-4 w-4" />
				</button>
			</div>
			<div className="flex min-h-0 flex-1 flex-col overflow-hidden">
				<PanelBody panel={panel} />
			</div>
		</div>
	)
}
