'use client'

import { CHAT_MODELS, findChatModel } from '@writer-hub/shared'
import { ChevronDown, Cpu } from 'lucide-react'
import { Dropdown, DropdownItem } from '@/components/ui/dropdown'
import { useChat } from '@/features/chat/chat-context'
import { cn } from '@/lib/utils'

export function ModelPicker() {
	const { model, setModel } = useChat()
	const active = findChatModel(model) ?? CHAT_MODELS[0]

	return (
		<Dropdown
			align="start"
			side="top"
			className="min-w-0"
			menuClassName="w-[272px] max-h-[min(60vh,340px)] overflow-y-auto"
			trigger={({ open, toggle }) => (
				<button
					type="button"
					onClick={toggle}
					title={`Model: ${active.label} - ${active.hint}`}
					className={cn(
						'flex min-w-0 items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[11px] transition-colors',
						open
							? 'bg-[var(--overlay-active)] text-foreground'
							: 'text-subtle hover:bg-[var(--overlay-hover)] hover:text-foreground',
					)}
				>
					<Cpu className="h-3.5 w-3.5 shrink-0" />
					{/* Dipatok: baris ini juga menampung empat tombol ikon, dan nama model
					    terpanjang akan mendorongnya melewati lebar panel. */}
					<span className="max-w-[6.5rem] truncate">{active.label}</span>
					<ChevronDown className="h-3 w-3 shrink-0 opacity-60" />
				</button>
			)}
		>
			{({ close }) => (
				<>
					{CHAT_MODELS.map((entry) => (
						<DropdownItem
							key={entry.id || 'default'}
							active={entry.id === active.id}
							onSelect={() => {
								close()
								setModel(entry.id)
							}}
							trailing={
								entry.free ? (
									<span className="rounded bg-green-500/15 px-1.5 py-0.5 text-[10px] text-green-400">
										free
									</span>
								) : undefined
							}
						>
							{/* Dua baris di dalam butir yang aslinya satu baris `truncate`:
							    tiap baris memotong dirinya sendiri, bukan dipotong induknya. */}
							<span className="flex min-w-0 flex-col py-0.5">
								<span className="truncate leading-tight">{entry.label}</span>
								<span className="truncate text-[10px] leading-tight text-subtle">{entry.hint}</span>
							</span>
						</DropdownItem>
					))}
				</>
			)}
		</Dropdown>
	)
}
