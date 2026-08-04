'use client'

import { Clock, FileText, FolderOpen, Home, Menu, Pin, Plus, Settings, Trash2 } from 'lucide-react'
import Image from 'next/image'
import { Dropdown, DropdownItem, DropdownLabel, DropdownSeparator } from '@/components/ui/dropdown'
import { sessionLabel, useSessions } from '@/features/sessions/session-context'
import { useSettings } from '@/features/settings/settings-context'
import { cn } from '@/lib/utils'

const RECENT_SESSION_LIMIT = 6

/**
 * Navigasi utama, dipadatkan ke satu tombol di kiri menu bar.
 *
 * Sebelumnya semua ini menempati sidebar tetap; dipindahkan ke popup agar
 * kanvas dokumen mendapat lebar penuh - dokumen yang jadi bintangnya, bukan
 * navigasinya.
 */
export function NavMenu() {
	const { sessions, activeId, hydrated, newSession, selectSession, deleteSession } = useSessions()
	const { setSettingsOpen } = useSettings()

	const recent = [...sessions].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, RECENT_SESSION_LIMIT)

	return (
		<Dropdown
			menuClassName="min-w-[280px]"
			trigger={({ open, toggle, id }) => (
				<button
					type="button"
					onClick={toggle}
					aria-label="Menu utama"
					aria-haspopup="menu"
					aria-expanded={open}
					aria-controls={id}
					className={cn(
						'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors',
						open ? 'bg-[var(--overlay-active)]' : 'hover:bg-[var(--overlay-hover)]',
					)}
				>
					<Menu className="h-5 w-5 text-muted" />
				</button>
			)}
		>
			{({ close }) => (
				<>
					<div className="flex items-center gap-2 px-3 pb-2 pt-1">
						<Image
							src="/Logo/Logo-small.png"
							alt="WritingHub"
							width={28}
							height={28}
							className="h-7 w-7 object-contain"
						/>
						<span className="text-sm font-semibold text-foreground">WritingHub</span>
					</div>

					<DropdownSeparator />

					<DropdownItem
						icon={<Plus className="h-4 w-4" />}
						onSelect={() => {
							newSession()
							close()
						}}
					>
						Sesi baru
					</DropdownItem>
					<DropdownItem icon={<Home className="h-4 w-4" />}>Beranda</DropdownItem>
					<DropdownItem icon={<FolderOpen className="h-4 w-4" />}>Projects</DropdownItem>
					<DropdownItem icon={<Pin className="h-4 w-4" />}>Disematkan</DropdownItem>

					<DropdownSeparator />

					<DropdownLabel>
						<span className="inline-flex items-center gap-1.5">
							<Clock className="h-3 w-3" />
							Riwayat
						</span>
					</DropdownLabel>

					{hydrated && recent.length === 0 && (
						<p className="px-3 py-2 text-sm text-faint">Belum ada riwayat</p>
					)}

					{recent.map((session) => (
						<div key={session.id} className="group/row flex items-center">
							<button
								type="button"
								onClick={() => {
									selectSession(session.id)
									close()
								}}
								className={cn(
									'flex min-w-0 flex-1 items-center gap-3 px-3 py-1.5 text-left text-sm transition-colors',
									session.id === activeId
										? 'text-accent'
										: 'text-foreground hover:bg-[var(--overlay-hover)]',
								)}
							>
								<FileText className="h-4 w-4 shrink-0 text-subtle" />
								<span className="truncate">{sessionLabel(session)}</span>
							</button>
							<button
								type="button"
								aria-label={`Hapus ${sessionLabel(session)}`}
								onClick={() => deleteSession(session.id)}
								className="mr-2 rounded p-1 text-subtle opacity-0 transition-opacity hover:text-red-400 group-hover/row:opacity-100"
							>
								<Trash2 className="h-3.5 w-3.5" />
							</button>
						</div>
					))}

					<DropdownSeparator />

					<DropdownItem
						icon={<Settings className="h-4 w-4" />}
						onSelect={() => {
							setSettingsOpen(true)
							close()
						}}
					>
						Pengaturan
					</DropdownItem>
				</>
			)}
		</Dropdown>
	)
}
