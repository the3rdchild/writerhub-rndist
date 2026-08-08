'use client'

import { ChevronRight } from 'lucide-react'
import { DocumentEditor } from '@/components/editor/document-editor'
import { PanelContainer } from '@/components/panels/panel-container'
import { PanelRail } from '@/components/panels/panel-rail'
import { VersionHistoryView } from '@/components/versions/version-history-view'
import { usePanels } from '@/features/analysis/panel-context'
import { useSettings } from '@/features/settings/settings-context'
import { useVersionMode } from '@/features/versions/version-context'
import { DocumentTabsSidebar } from './document-tabs'

/**
 * Editor Shell: satu draf jadi pusatnya, modul AI bergantian di panel kanan.
 *
 * Panel adalah permukaan tersendiri di sebelah dokumen, bukan lapisan yang
 * menimpanya - kartu saran dan kalimat yang disorotnya harus terlihat
 * bersamaan. Saat panel tertutup, lembar kembali ke tengah kanvas.
 *
 * Antar bagian tidak ada garis pemisah: yang membedakan area hanya nada
 * permukaan dan jarak, supaya tiga kolom sekaligus tidak terbaca seperti tiga
 * jendela yang ditempel jadi satu.
 */
export function WorkspacePage() {
	const { activePanel } = usePanels()
	const { settings, update } = useSettings()
	const { versionMode } = useVersionMode()

	// Mode riwayat versi menggantikan seluruh workspace (bukan overlay): editor
	// utama ikut lepas, tapi state sesi tetap di memori sehingga kembali instan.
	if (versionMode) return <VersionHistoryView />

	return (
		// pr menyisakan ruang untuk rail yang melayang di kanan.
		<div className="relative flex min-h-0 flex-1 gap-3 py-3 pl-2 pr-20">
			{settings.showDocumentTabs ? (
				<DocumentTabsSidebar />
			) : (
				// Saat daftar tab disembunyikan, tombolnya tidak ikut hilang: ia tetap
				// duduk di titik yang sama dengan tombol sembunyikan (pl-1 aside +
				// px-1 barisnya), hanya arah panahnya yang berbalik - memunculkan
				// kembali tab jadi satu klik, bukan perjalanan ke menu Tampilan.
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
