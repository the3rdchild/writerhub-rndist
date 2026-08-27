'use client'

import { ChevronRight } from 'lucide-react'
import { DocumentEditor } from '@/components/editor/document-editor'
import { PanelContainer } from '@/components/panels/panel-container'
import { PanelRail } from '@/components/panels/panel-rail'
import { VersionHistoryView } from '@/components/versions/version-history-view'
import { usePanels } from '@/features/analysis/panel-context'
import { useSettings } from '@/features/settings/settings-context'
import { useSaveShortcut } from '@/features/versions/use-save-shortcut'
import { useVersionMode } from '@/features/versions/version-context'
import { DocumentTabsSidebar } from './document-tabs'

export function WorkspacePage() {
	const { activePanel } = usePanels()
	const { settings, update } = useSettings()
	const { versionMode } = useVersionMode()
	useSaveShortcut()
	if (versionMode) return <VersionHistoryView />

	return (
		<div className="relative flex min-h-0 flex-1 gap-3 py-3 pl-2 pr-20">
			{settings.showDocumentTabs ? (
				<DocumentTabsSidebar />
			) : (
				<div className="flex shrink-0 flex-col pl-2 pt-1">
					<button
						type="button"
						aria-label="Tampilkan tab dokumen"
						title="Tampilkan tab dokumen"
						onClick={() => update({ showDocumentTabs: true })}
						className="flex h-8 w-8 items-center justify-center rounded-lg text-subtle transition-colors hover:bg-[var(--overlay-hover)] hover:text-foreground"
					>
						<ChevronRight className="h-[18px] w-[18px]" />
					</button>
				</div>
			)}
			<DocumentEditor />
			{activePanel !== null && <PanelContainer panel={activePanel} />}
			<PanelRail />
		</div>
	)
}
