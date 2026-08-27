import type { OutlineItem } from '@/features/editor/use-outline'
import { cn } from '@/lib/utils'

const INDENT_BASE_PX = 10
const INDENT_PER_LEVEL_PX = 12
const UNTITLED = 'Tanpa judul'

export function OutlineTree({
	items,
	activePos,
	onSelect,
}: {
	items: OutlineItem[]
	activePos: number | null
	onSelect: (pos: number) => void
}) {
	if (items.length === 0) {
		return (
			<p className="mb-1 ml-4 mt-0.5 border-l border-line py-1 pl-2.5 pr-2 text-[13px] text-subtle">
				Belum ada heading
			</p>
		)
	}

	return (
		<ul className="mb-1 ml-4 mt-0.5 border-l border-line">
			{items.map((item) => {
				const active = item.pos === activePos
				const label = item.text || UNTITLED

				return (
					<li key={item.pos}>
						<button
							type="button"
							onClick={() => onSelect(item.pos)}
							title={label}
							style={{ paddingLeft: INDENT_BASE_PX + (item.level - 1) * INDENT_PER_LEVEL_PX }}
							className={cn(
								'-ml-px block w-full truncate border-l-2 py-1 pr-2 text-left text-[13px] transition-colors',
								active
									? 'border-accent text-accent'
									: 'border-transparent text-muted hover:border-line-strong hover:text-foreground',
							)}
						>
							{label}
						</button>
					</li>
				)
			})}
		</ul>
	)
}
