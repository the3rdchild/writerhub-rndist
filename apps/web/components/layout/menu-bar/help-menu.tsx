'use client'

import { CircleQuestionMark, Info, Keyboard } from 'lucide-react'
import { DropdownSeparator } from '@/components/ui/dropdown'
import { useSettings } from '@/features/settings/settings-context'
import { useShortcutLabel } from '@/features/shortcuts/use-shortcuts'
import { Item, Menu, run } from './menu-shell'

export function HelpMenu() {
	const { setSettingsOpen, setShortcutsOpen } = useSettings()
	const keys = useShortcutLabel()

	return (
		<Menu label="Bantuan" icon={<CircleQuestionMark className="h-4 w-4" />}>
			{({ close }) => (
				<>
					<Item
						icon={<Keyboard className="h-4 w-4" />}
						shortcut={keys('view.shortcuts')}
						onSelect={() => run(close, () => setShortcutsOpen(true))}
					>
						Pintasan papan tik…
					</Item>
					<DropdownSeparator />
					<Item icon={<Info className="h-4 w-4" />} onSelect={() => run(close, () => setSettingsOpen(true))}>
						Tentang WritingHub
					</Item>
				</>
			)}
		</Menu>
	)
}
