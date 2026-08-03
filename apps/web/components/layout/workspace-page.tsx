'use client'

import { DocumentEditor } from '@/components/editor/document-editor'
import { PanelContainer } from '@/components/panels/panel-container'
import { PanelRail } from '@/components/panels/panel-rail'
import { usePanels } from '@/features/analysis/panel-context'
import { useSettings } from '@/features/settings/settings-context'
import { DocumentTabsSidebar } from './document-tabs'

/**
 * Editor Shell: satu draf jadi pusatnya, modul AI bergantian di panel kanan.
 *
 * Panel adalah permukaan tersendiri di sebelah dokumen, bukan lapisan yang
 * menimpanya — kartu saran dan kalimat yang disorotnya harus terlihat
 * bersamaan. Saat panel tertutup, lembar kembali ke tengah kanvas.
 *
 * Antar bagian tidak ada garis pemisah: yang membedakan area hanya nada
 * permukaan dan jarak, supaya tiga kolom sekaligus tidak terbaca seperti tiga
 * jendela yang ditempel jadi satu.
 */
export function WorkspacePage() {
	const { activePanel } = usePanels()
	const { settings } = useSettings()

	return (
		// pr menyisakan ruang untuk rail yang melayang di kanan.
		<div className="relative flex min-h-0 flex-1 gap-3 py-3 pl-2 pr-20">
			{settings.showDocumentTabs && <DocumentTabsSidebar />}
			<DocumentEditor />
			{activePanel !== null && <PanelContainer panel={activePanel} />}
			<PanelRail />
		</div>
	)
}
