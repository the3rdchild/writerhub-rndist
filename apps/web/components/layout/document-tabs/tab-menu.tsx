'use client'

import {
	CloudUpload,
	Copy,
	ListTree,
	Loader2,
	MoreVertical,
	MoveDown,
	MoveUp,
	Pencil,
	Trash2,
} from 'lucide-react'
import { Dropdown, DropdownItem, DropdownLabel, DropdownSeparator } from '@/components/ui/dropdown'
import { type Session, sessionLabel } from '@/features/sessions/session-context'
import { cn } from '@/lib/utils'
import { TAB_ICONS } from './tab-icons'
import { useTabInteractions } from './tab-interactions'

export function TabMenu({ tab, index }: { tab: Session; index: number }) {
	const {
		sessions,
		activeId,
		syncStatus,
		startRename,
		duplicate,
		saveToCloud,
		toggleOutline,
		move,
		setIcon,
		requestDelete,
	} = useTabInteractions()

	const label = sessionLabel(tab)
	const active = tab.id === activeId
	const syncState = syncStatus(tab.id)
	const canMoveUp = index > 0
	const canMoveDown = index < sessions.length - 1
	const canRemove = sessions.length > 1

	return (
		<Dropdown
			align="end"
			trigger={({ open, toggle, id }) => (
				<button
					type="button"
					onClick={toggle}
					aria-label={`Opsi ${label}`}
					aria-expanded={open}
					aria-controls={id}
					className={cn(
						'flex h-6 w-6 items-center justify-center rounded-md transition-colors hover:bg-[var(--overlay-active)]',
						open || active ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
					)}
				>
					<MoreVertical className="h-4 w-4" />
				</button>
			)}
		>
			{({ close }) => {
				// Setiap aksi menutup menu lebih dulu supaya menu tidak menggantung
				// di atas tab yang barusan berpindah, berganti nama, atau hilang.
				const run = (action: () => void) => () => {
					close()
					action()
				}

				return (
					<>
						<DropdownItem icon={<Pencil className="h-4 w-4" />} onSelect={run(() => startRename(tab.id))}>
							Ganti nama
						</DropdownItem>
						<DropdownItem icon={<Copy className="h-4 w-4" />} onSelect={run(() => duplicate(tab.id))}>
							Duplikat
						</DropdownItem>
						<DropdownItem
							icon={
								syncState === 'saving' ? (
									<Loader2 className="h-4 w-4 animate-spin" />
								) : (
									<CloudUpload className="h-4 w-4" />
								)
							}
							disabled={syncState === 'saving'}
							onSelect={run(() => saveToCloud(tab.id))}
						>
							{syncState === 'local' ? 'Simpan ke cloud' : 'Simpan ke cloud sekarang'}
						</DropdownItem>
						<DropdownItem icon={<ListTree className="h-4 w-4" />} onSelect={run(() => toggleOutline(tab))}>
							{tab.outlineExpanded ? 'Sembunyikan daftar isi' : 'Tampilkan daftar isi'}
						</DropdownItem>

						{(canMoveUp || canMoveDown) && <DropdownSeparator />}
						{canMoveUp && (
							<DropdownItem
								icon={<MoveUp className="h-4 w-4" />}
								onSelect={run(() => move(tab.id, sessions[index - 1].id))}
							>
								Naikkan
							</DropdownItem>
						)}
						{canMoveDown && (
							<DropdownItem
								icon={<MoveDown className="h-4 w-4" />}
								onSelect={run(() => move(tab.id, sessions[index + 1].id))}
							>
								Turunkan
							</DropdownItem>
						)}

						<DropdownLabel>Ikon</DropdownLabel>
						<div className="flex flex-wrap gap-0.5 px-2 pb-1.5">
							{TAB_ICONS.map((icon) => (
								<button
									key={icon}
									type="button"
									aria-label={`Ikon ${icon}`}
									onClick={run(() => setIcon(tab.id, icon))}
									className={cn(
										'flex h-7 w-7 items-center justify-center rounded-md text-sm transition-colors hover:bg-[var(--overlay-hover)]',
										tab.emoji === icon && 'bg-[var(--overlay-active)]',
									)}
								>
									{icon}
								</button>
							))}
							<button
								type="button"
								aria-label="Tanpa ikon"
								title="Tanpa ikon"
								onClick={run(() => setIcon(tab.id, null))}
								className="flex h-7 w-7 items-center justify-center rounded-md text-xs text-subtle transition-colors hover:bg-[var(--overlay-hover)]"
							>
								✕
							</button>
						</div>

						<DropdownSeparator />
						<DropdownItem
							icon={<Trash2 className="h-4 w-4" />}
							disabled={!canRemove}
							onSelect={run(() => requestDelete(tab))}
						>
							Hapus
						</DropdownItem>
					</>
				)
			}}
		</Dropdown>
	)
}
