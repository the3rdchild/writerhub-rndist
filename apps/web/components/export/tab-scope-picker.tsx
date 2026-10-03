'use client'

import { cn } from '@/lib/utils'

export type TabScope = 'current' | 'all' | 'pick'

interface TabOption {
	id: string
	title: string
	emoji?: string | null
}

export function chosenTabs<T extends TabOption>(
	tabs: readonly T[],
	activeId: string | null,
	scope: TabScope,
	picked: ReadonlySet<string>,
): T[] {
	if (scope === 'all') return [...tabs]
	if (scope === 'pick') return tabs.filter((tab) => picked.has(tab.id))
	return tabs.filter((tab) => tab.id === activeId)
}

/** Pilihan cakupan ekspor untuk dokumen bertab banyak: tab ini, semua tab, atau tab terpilih. */
export function TabScopePicker({
	tabs,
	activeId,
	scope,
	picked,
	onScopeChange,
	onToggle,
}: {
	tabs: readonly TabOption[]
	activeId: string | null
	scope: TabScope
	picked: ReadonlySet<string>
	onScopeChange: (scope: TabScope) => void
	onToggle: (id: string) => void
}) {
	const options: { value: TabScope; label: string }[] = [
		{ value: 'current', label: 'This tab' },
		{ value: 'all', label: `All tabs (${tabs.length})` },
		{ value: 'pick', label: 'Selected tabs' },
	]
	return (
		<fieldset className="flex flex-col gap-2">
			<legend className="mb-1 text-xs font-medium text-muted">Tabs to export</legend>
			<div className="flex gap-1 rounded-xl bg-[var(--overlay-hover)] p-1">
				{options.map((option) => (
					<label
						key={option.value}
						className={cn(
							'flex flex-1 cursor-pointer items-center justify-center rounded-lg px-2 py-1.5 text-center text-sm transition-colors',
							scope === option.value
								? 'bg-surface-raised text-foreground shadow-sm'
								: 'text-muted hover:text-foreground',
						)}
					>
						<input
							type="radio"
							name="tab-scope"
							value={option.value}
							checked={scope === option.value}
							onChange={() => onScopeChange(option.value)}
							className="sr-only"
						/>
						{option.label}
					</label>
				))}
			</div>
			{scope === 'pick' && (
				<div className="flex max-h-40 flex-col gap-1 overflow-y-auto rounded-xl border border-line p-2">
					{tabs.map((tab) => (
						<label
							key={tab.id}
							className={cn(
								'flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-[var(--overlay-hover)]',
								tab.id === activeId ? 'text-foreground' : 'text-muted',
							)}
						>
							<input type="checkbox" checked={picked.has(tab.id)} onChange={() => onToggle(tab.id)} />
							<span className="truncate">
								{tab.emoji ? `${tab.emoji} ` : ''}
								{tab.title}
							</span>
						</label>
					))}
				</div>
			)}
			<p className="text-xs text-subtle">Tabs are joined in order, each starting on a new page.</p>
		</fieldset>
	)
}
