'use client'

import type { ChatCommand } from '@/features/chat/commands'
import { cn } from '@/lib/utils'

/**
 * Daftar perintah garis miring di atas kotak chat.
 *
 * Dua tingkat dipisah garis: intent dulu (apa yang ingin dikerjakan), alat
 * mentah menyusul setelah pengguna mengetik cukup banyak huruf.
 */
export function ChatCommandMenu({
	commands,
	active,
	onPick,
	onHover,
}: {
	commands: ChatCommand[]
	active: number
	onPick: (command: ChatCommand) => void
	onHover: (index: number) => void
}) {
	if (commands.length === 0) return null

	const firstToolIndex = commands.findIndex((command) => command.tier === 'tool')

	return (
		<div className="mb-1 max-h-64 overflow-y-auto rounded-xl border border-line bg-surface-raised p-1 shadow-lg">
			{commands.map((command, index) => (
				<div key={command.id}>
					{index === firstToolIndex && firstToolIndex > 0 && (
						<p className="px-2 pb-0.5 pt-1.5 text-[10px] uppercase tracking-wide text-faint">Alat langsung</p>
					)}
					<button
						type="button"
						onMouseDown={(event) => {
							event.preventDefault()
							onPick(command)
						}}
						onMouseEnter={() => onHover(index)}
						className={cn(
							'flex w-full items-baseline gap-2 rounded-md px-2 py-1 text-left transition-colors',
							index === active ? 'bg-accent/15' : 'hover:bg-[var(--overlay-hover)]',
						)}
					>
						<span
							className={cn(
								'shrink-0 text-xs',
								command.tier === 'intent' ? 'font-medium text-foreground' : 'font-mono text-muted',
							)}
						>
							/{command.trigger}
						</span>
						<span className="min-w-0 flex-1 truncate text-[11px] text-subtle">{command.hint}</span>
					</button>
				</div>
			))}
		</div>
	)
}
