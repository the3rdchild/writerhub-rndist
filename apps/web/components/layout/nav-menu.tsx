'use client'

import {
	Activity,
	Check,
	ChevronRight,
	Clock,
	Cloud,
	CloudOff,
	FileText,
	Folder,
	FolderOpen,
	Home,
	LibraryBig,
	Loader2,
	Menu,
	Pin,
	Plus,
	Settings,
} from 'lucide-react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Dropdown, DropdownItem, DropdownLabel, DropdownSeparator } from '@/components/ui/dropdown'
import { updateDocument } from '@/features/documents/api'
import { useDocuments, useInvalidateDocuments } from '@/features/documents/use-documents'
import { useMergedDocuments, useOpenDocument } from '@/features/documents/use-merged-documents'
import { useInvalidateProjects, useProjects } from '@/features/projects/use-projects'
import { useSessions } from '@/features/sessions/session-context'
import { useSettings } from '@/features/settings/settings-context'
import { useSync } from '@/features/sync/sync-context'
import { cn } from '@/lib/utils'

const RECENT_DOCUMENT_LIMIT = 10

/**
 * Navigasi utama, dipadatkan ke satu tombol di kiri menu bar.
 *
 * Sebelumnya semua ini menempati sidebar tetap; dipindahkan ke popup agar
 * kanvas dokumen mendapat lebar penuh - dokumen yang jadi bintangnya, bukan
 * navigasinya.
 */
export function NavMenu() {
	const { activeDocId, hydrated, newDocument } = useSessions()
	const { setSettingsOpen } = useSettings()
	const router = useRouter()
	const [projectsOpen, setProjectsOpen] = useState(false)

	/*
	 * Riwayat menampilkan DOKUMEN terakhir dari lokal DAN server, sudah
	 * digabungkan dan diurut waktu. Sebelumnya ia hanya membaca yang lokal
	 * sementara Library hanya membaca yang server, jadi dua daftar yang tampak
	 * setara sebenarnya berisi himpunan berbeda.
	 *
	 * Tab milik dokumen dipilih lewat sidebar tab, bukan dari sini.
	 */
	const { documents } = useMergedDocuments()
	const { open, openingKey, openError } = useOpenDocument()
	const recent = documents.slice(0, RECENT_DOCUMENT_LIMIT)

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
					{/*
					 * Projects sengaja tidak langsung melompat ke Library: dari editor,
					 * yang paling sering dibutuhkan adalah "dokumen ini masuk proyek
					 * mana", bukan "buka halaman proyek". Jadi entri ini membentang di
					 * tempat - daftar proyek beserta isinya, lalu penempatan dokumen
					 * yang sedang dibuka.
					 *
					 * Dibentangkan inline, bukan submenu bersarang: `Dropdown` tidak
					 * punya tingkat kedua, dan membangunnya hanya untuk ini berarti
					 * menambah perkakas navigasi demi satu pemakai.
					 */}
					<DropdownItem
						icon={<FolderOpen className="h-4 w-4" />}
						onSelect={() => setProjectsOpen((open) => !open)}
						trailing={
							<ChevronRight
								className={cn(
									'h-3.5 w-3.5 text-subtle transition-transform',
									projectsOpen && 'rotate-90',
								)}
							/>
						}
					>
						Projects
					</DropdownItem>

					{projectsOpen && (
						<ProjectsSection
							activeDocId={activeDocId}
							onNavigate={(href) => {
								router.push(href)
								close()
							}}
						/>
					)}
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
						<div key={dok.key} className="group/row flex items-center">
							<button
								type="button"
								disabled={openingKey !== null}
								onClick={() => {
									// Dokumen yang sudah ada di perangkat ini langsung aktif;
									// yang baru ada di server perlu diunduh dulu, jadi menunya
									// baru ditutup setelah pembukaannya berhasil.
									if (dok.localId) {
										void open(dok)
										close()
									} else {
										void open(dok).then((ok) => {
											if (ok) close()
										})
									}
								}}
								className={cn(
									'flex min-w-0 flex-1 items-center gap-3 px-3 py-1.5 text-left text-sm transition-colors',
									dok.localId === activeDocId
										? 'text-accent'
										: 'text-foreground hover:bg-[var(--overlay-hover)]',
								)}
							>
								{dok.origin === 'server-only' ? (
									<Cloud className="h-4 w-4 shrink-0 text-subtle" />
								) : (
									<FileText className="h-4 w-4 shrink-0 text-subtle" />
								)}
								<span className="truncate">{dok.title}</span>
								{openingKey === dok.key && (
									<Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-subtle" />
								)}
								{dok.origin === 'local-only' && (
									<CloudOff
										className="h-3.5 w-3.5 shrink-0 text-faint"
										aria-label="Belum tersimpan di cloud"
									/>
								)}
							</button>
						</div>
					))}

					{openError && <p className="px-3 py-1 text-xs text-red-400">{openError}</p>}

					{/* Riwayat sengaja pendek - ia jalan pintas, bukan daftar lengkap.
					    Yang mencari dokumen lama pergi ke Library. */}
					{documents.length > RECENT_DOCUMENT_LIMIT && (
						<button
							type="button"
							onClick={() => {
								router.push('/library')
								close()
							}}
							className="flex w-full items-center gap-3 px-3 py-1.5 text-left text-sm text-muted transition-colors hover:bg-[var(--overlay-hover)] hover:text-foreground"
						>
							<span className="h-4 w-4 shrink-0" />
							<span className="truncate">Lihat semua dokumen…</span>
						</button>
					)}

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

/**
 * Isi bentangan "Projects": daftar proyek beserta jumlah dokumennya, lalu
 * penempatan dokumen yang sedang dibuka.
 *
 * Dua pertanyaan berbeda dijawab di satu tempat karena keduanya muncul
 * bersamaan saat pengguna sedang menulis: "proyek saya apa saja" dan "yang ini
 * masuk mana". Yang pertama menavigasi ke Library, yang kedua mengubah data -
 * karena itu keduanya dipisah label, bukan dicampur jadi satu daftar.
 *
 * Dokumen yang belum tersimpan di cloud tidak punya baris di server, jadi ia
 * tidak bisa ditempatkan ke proyek. Bagian itu diganti ajakan menyimpan, bukan
 * daftar mati yang tidak menjelaskan apa-apa.
 */
function ProjectsSection({
	activeDocId,
	onNavigate,
}: {
	activeDocId: string | null
	onNavigate: (href: string) => void
}) {
	const projects = useProjects()
	const serverDocuments = useDocuments()
	const invalidateDocuments = useInvalidateDocuments()
	const invalidateProjects = useInvalidateProjects()
	const { serverDocId } = useSync()
	const [moving, setMoving] = useState(false)
	const [moveError, setMoveError] = useState<string | null>(null)

	const docServerId = activeDocId ? serverDocId(activeDocId) : null
	const currentProjectId =
		serverDocuments.data?.find((dok) => dok.id === docServerId)?.projectId ?? null

	const move = (projectId: string | null) => {
		if (!docServerId || moving) return
		setMoving(true)
		setMoveError(null)
		updateDocument(docServerId, { projectId })
			.then(() => {
				// Hitungan dokumen per proyek ikut berubah, jadi keduanya ditarik ulang.
				void invalidateDocuments()
				void invalidateProjects()
			})
			.catch((cause) =>
				setMoveError(cause instanceof Error ? cause.message : 'Gagal memindahkan dokumen'),
			)
			.finally(() => setMoving(false))
	}

	return (
		<div className="border-l-2 border-line pl-1">
			{projects.isPending && <p className="px-3 py-1.5 text-xs text-faint">Memuat proyek…</p>}
			{projects.isError && (
				<p className="px-3 py-1.5 text-xs text-red-400">Gagal memuat proyek.</p>
			)}
			{projects.data?.length === 0 && (
				<p className="px-3 py-1.5 text-xs text-faint">Belum ada proyek.</p>
			)}

			{projects.data?.map((project) => (
				<DropdownItem
					key={project.id}
					icon={<Folder className="h-4 w-4" />}
					onSelect={() => onNavigate(`/library?project=${project.id}`)}
					trailing={
						<span className="text-xs text-faint">{project.documentCount}</span>
					}
				>
					{project.name}
				</DropdownItem>
			))}

			<DropdownItem
				icon={<LibraryBig className="h-4 w-4" />}
				onSelect={() => onNavigate('/library?project=all')}
			>
				Kelola di Library
			</DropdownItem>

			<DropdownSeparator />
			<DropdownLabel>Dokumen ini masuk ke</DropdownLabel>

			{docServerId === null ? (
				<p className="px-3 pb-1 text-xs text-faint">
					Simpan dokumen ke cloud dulu untuk menempatkannya di proyek.
				</p>
			) : (
				<>
					<DropdownItem
						icon={currentProjectId === null ? <Check className="h-4 w-4" /> : undefined}
						active={currentProjectId === null}
						disabled={moving}
						onSelect={() => move(null)}
					>
						Tanpa proyek
					</DropdownItem>
					{projects.data?.map((project) => (
						<DropdownItem
							key={project.id}
							icon={currentProjectId === project.id ? <Check className="h-4 w-4" /> : undefined}
							active={currentProjectId === project.id}
							disabled={moving}
							onSelect={() => move(project.id)}
						>
							{project.name}
						</DropdownItem>
					))}
				</>
			)}

			{moveError && <p className="px-3 py-1 text-xs text-red-400">{moveError}</p>}
		</div>
	)
}
