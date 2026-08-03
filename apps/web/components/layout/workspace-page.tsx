'use client'

import { DocumentEditor } from '@/components/editor/document-editor'
import { PanelContainer } from '@/components/panels/panel-container'
import { PanelRail } from '@/components/panels/panel-rail'
import { usePanels } from '@/features/analysis/panel-context'

/**
 * Editor Shell: satu draf jadi pusatnya, modul AI bergantian di panel kanan.
 *
 * Panel adalah permukaan tersendiri di sebelah dokumen, bukan lapisan yang
 * menimpanya — kartu saran dan kalimat yang disorotnya harus terlihat
 * bersamaan. Saat panel tertutup, lembar kembali ke tengah kanvas.
 */
export function WorkspacePage() {
	const { activePanel } = usePanels()

	return (
		// pr menyisakan ruang untuk rail yang melayang di kanan.
		<div className="relative flex min-h-0 flex-1 gap-4 py-4 pl-4 pr-20">
			<DocumentEditor />
			{activePanel !== null && <PanelContainer panel={activePanel} />}
			<PanelRail />
		</div>
	)
}
