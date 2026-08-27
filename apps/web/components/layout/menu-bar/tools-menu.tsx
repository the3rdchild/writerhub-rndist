'use client'
import { Settings as SettingsIcon, Wrench } from 'lucide-react'
import { PANELS } from '@/components/panels/panel-rail'
import { DropdownSeparator } from '@/components/ui/dropdown'
import { usePanels } from '@/features/analysis/panel-context'
import { useDocument } from '@/features/document/document-context'
import { useSettings } from '@/features/settings/settings-context'
import { countWords } from '@/lib/utils'
import { Item, Menu, run } from './menu-shell'

export function ToolsMenu() {
	const { state } = useDocument()
	const { setSettingsOpen } = useSettings()
	const { activePanel, setActivePanel } = usePanels()

	return (
		<Menu label="Tools" icon={<Wrench className="h-4 w-4" />}>
			{({ close }) => (
				<>
					{/* Dibangun dari daftar tool rail, bukan diketik ulang: dulu menu ini
			    hanya memuat lima dari sembilan panel dengan ikon yang tidak
			    berhubungan sama sekali dengan ikon di rail. */}
					{PANELS.map((panel) => (
						<Item
							key={panel.id}
							icon={<panel.icon className="h-4 w-4" />}
							active={activePanel === panel.id}
							onSelect={() => run(close, () => setActivePanel(panel.id))}
						>
							{panel.label}
						</Item>
					))}
					<DropdownSeparator />
					<Item disabled>
						{countWords(state.text)} words · {state.text.length} characters
					</Item>
					<DropdownSeparator />
					<Item
						icon={<SettingsIcon className="h-4 w-4" />}
						onSelect={() => run(close, () => setSettingsOpen(true))}
					>
						Settings…
					</Item>
				</>
			)}
		</Menu>
	)
}
