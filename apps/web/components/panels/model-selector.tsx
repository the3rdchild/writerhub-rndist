'use client'

import { GRAMMAR_MODELS, type GrammarModel } from '@writer-hub/shared'
import { Brain, ChevronDown, type LucideIcon, Sparkles, Zap } from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/utils'

const MODEL_META: Record<GrammarModel, { label: string; icon: LucideIcon }> = {
	standard: { label: 'Standard', icon: Zap },
	advanced: { label: 'Advanced', icon: Sparkles },
	ai: { label: 'AI', icon: Brain },
}

export function ModelSelector({
	value,
	onChange,
	disabled,
}: {
	value: GrammarModel
	onChange: (model: GrammarModel) => void
	disabled?: boolean
}) {
	const [open, setOpen] = useState(false)
	const Current = MODEL_META[value].icon

	return (
		<div className="relative flex-1">
			<button
				type="button"
				onClick={() => setOpen((current) => !current)}
				disabled={disabled}
				aria-expanded={open}
				className={cn(
					'flex w-full items-center gap-1.5 rounded-full border border-line-strong px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:text-foreground',
					disabled && 'cursor-not-allowed opacity-40',
				)}
			>
				<Current className="h-3 w-3" />
				{MODEL_META[value].label}
				<ChevronDown className="ml-auto h-3 w-3" />
			</button>

			{open && (
				<div className="absolute bottom-full left-0 z-40 mb-1 w-full rounded-xl border border-line-strong bg-surface-raised py-1 shadow-xl">
					{GRAMMAR_MODELS.map((model) => {
						const Icon = MODEL_META[model].icon
						return (
							<button
								key={model}
								type="button"
								onClick={() => {
									onChange(model)
									setOpen(false)
								}}
								className={cn(
									'flex w-full items-center gap-2 px-3 py-2 text-xs transition-colors',
									model === value
										? 'bg-[var(--overlay-hover)] text-foreground'
										: 'text-muted hover:bg-[var(--overlay-hover)] hover:text-foreground',
								)}
							>
								<Icon className="h-3 w-3" />
								{MODEL_META[model].label}
							</button>
						)
					})}
				</div>
			)}
		</div>
	)
}
