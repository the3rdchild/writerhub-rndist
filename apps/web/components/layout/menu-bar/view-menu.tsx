'use client'
import { Eye, Search } from 'lucide-react'
import { DropdownSeparator, Submenu } from '@/components/ui/dropdown'
import { ZOOM_LEVELS } from '@/features/editor/page-geometry'
import { usePageSetup } from '@/features/editor/use-page-setup'
import { useSettings } from '@/features/settings/settings-context'
import { Item, Menu, run } from './menu-shell'

export function ViewMenu() {
	const { settings, update, toggleFocusMode } = useSettings()
	const { setup: activeSetup, setPageSetup } = usePageSetup()

	return (
		<Menu label="Tampilan" icon={<Eye className="h-4 w-4" />}>
			{({ close }) => (
				<>
					<Item active={settings.focusMode} onSelect={() => run(close, toggleFocusMode)}>
						Mode fokus
					</Item>
					<Item
						active={settings.showRuler}
						onSelect={() => run(close, () => update({ showRuler: !settings.showRuler }))}
					>
						Penggaris
					</Item>
					<Item
						active={settings.showDocumentTabs}
						onSelect={() => run(close, () => update({ showDocumentTabs: !settings.showDocumentTabs }))}
					>
						Tab dokumen
					</Item>
					<Item
						active={settings.showPageNumbers}
						onSelect={() => run(close, () => update({ showPageNumbers: !settings.showPageNumbers }))}
					>
						Nomor halaman
					</Item>
					<Item
						active={settings.showWordCount}
						onSelect={() => run(close, () => update({ showWordCount: !settings.showWordCount }))}
					>
						Jumlah kata
					</Item>
					<Item
						active={activeSetup.pageless}
						onSelect={() =>
							run(close, () => setPageSetup({ ...activeSetup, pageless: !activeSetup.pageless }, 'document'))
						}
					>
						Pageless
					</Item>
					<DropdownSeparator />
					{/* Perbesaran jadi submenu supaya daftar tingkat zoom tidak
			    memanjangkan menu utama. */}
					<Submenu label="Perbesaran" icon={<Search className="h-4 w-4" />}>
						{() => (
							<>
								{ZOOM_LEVELS.map((level) => (
									<Item
										key={level}
										active={settings.zoom === level}
										onSelect={() => run(close, () => update({ zoom: level }))}
									>
										{Math.round(level * 100)}%
									</Item>
								))}
							</>
						)}
					</Submenu>
				</>
			)}
		</Menu>
	)
}
