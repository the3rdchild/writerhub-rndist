'use client'

import { Activity, Clock, FileText, FolderOpen, Home, LibraryBig, Menu, Pin, Plus, Settings } from 'lucide-react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { Dropdown, DropdownItem, DropdownLabel, DropdownSeparator } from '@/components/ui/dropdown'
import { useSessions } from '@/features/sessions/session-context'
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
	const { documents, activeDocId, hydrated, newDocument, selectDocument } = useSessions()
	const { setSettingsOpen } = useSettings()
	const router = useRouter()

	// Riwayat menampilkan DOKUMEN terakhir (urut waktu suntingnya); tab miliknya
	// dipilih lewat sidebar tab atau saat dokumennya dibuka.
	const recent = [...documents].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, RECENT_SESSION_LIMIT)

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
							newDocument()
							close()
						}}
					>
						Dokumen baru
					</DropdownItem>
					<DropdownItem
						icon={<Home className="h-4 w-4" />}
						onSelect={() => {
							router.push('/')
							close()
						}}
					>
						Beranda
					</DropdownItem>
					<DropdownItem
						icon={<LibraryBig className="h-4 w-4" />}
						onSelect={() => {
							router.push('/library')
							close()
						}}
					>
						Library
					</DropdownItem>
					{/* Aktivitas AI (fitur F): catatan pemakaian modul AI. Sengaja bukan
					    "Riwayat" - nama itu sudah dipakai dua fitur lain. */}
					<DropdownItem
						icon={<Activity className="h-4 w-4" />}
						onSelect={() => {
							router.push('/activity')
							close()
						}}
					>
						Aktivitas AI
					</DropdownItem>
					{/* Projects = File Library dengan sidebar proyek; filter tinggal di
					    query string supaya bisa di-bookmark. */}
					<DropdownItem
						icon={<FolderOpen className="h-4 w-4" />}
						onSelect={() => {
							router.push('/library?project=all')
							close()
						}}
					>
						Projects
					</DropdownItem>
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

					{recent.map((dok) => (
						<div key={dok.id} className="group/row flex items-center">
							<button
								type="button"
								onClick={() => {
									selectDocument(dok.id)
									close()
								}}
								className={cn(
									'flex min-w-0 flex-1 items-center gap-3 px-3 py-1.5 text-left text-sm transition-colors',
									dok.id === activeDocId
										? 'text-accent'
										: 'text-foreground hover:bg-[var(--overlay-hover)]',
								)}
							>
								<FileText className="h-4 w-4 shrink-0 text-subtle" />
								<span className="truncate">{dok.title}</span>
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
