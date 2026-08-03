'use client'

import { usePanels } from '@/features/analysis/panel-context'
import { DocumentEditor } from '@/components/editor/document-editor'
import { PanelContainer } from '@/components/panels/panel-container'
import { PanelRail } from '@/components/panels/panel-rail'

/** Editor Shell: satu draf di tengah, modul AI bergantian di panel kanan. */
export function WorkspacePage() {
	const { activePanel } = usePanels()

	return (
		<div className="flex h-full min-h-0 gap-2 px-4 py-4">
			<DocumentEditor />
			{activePanel !== null && <PanelContainer panel={activePanel} />}
			<PanelRail />
		</div>
	)
}
