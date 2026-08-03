'use client'

import {
	Clock,
	FileText,
	FolderOpen,
	Home,
	MessageCircle,
	PanelLeft,
	Pin,
	Plus,
	Search,
	Settings,
	SlidersHorizontal,
	Trash2,
} from 'lucide-react'
import Image from 'next/image'
import { useState } from 'react'
import { sessionLabel, useSessions } from '@/features/sessions/session-context'
import { useSettings } from '@/features/settings/settings-context'
import { cn } from '@/lib/utils'

const EXPANDED_WIDTH = 256
const COLLAPSED_WIDTH = 88

// Placeholder sampai Projects & Sharing dikerjakan (PRD tier V1/V3).
const PLACEHOLDER_PROJECTS = [{ id: 'p1', name: 'Bismillah Skripsi' }]
const PLACEHOLDER_PINNED = [{ id: 'pin1', name: 'Project Skripsi' }]

export function Sidebar() {
	const { settings, toggleSidebar, setSettingsOpen } = useSettings()
	const { sessions, activeId, hydrated, newSession, selectSession, deleteSession } = useSessions()
	const [hoveredId, setHoveredId] = useState<string | null>(null)

	const open = settings.sidebarOpen
	const ordered = [...sessions].sort((a, b) => b.updatedAt - a.updatedAt)

	return (
		<aside
			className="relative flex h-full shrink-0 flex-col overflow-hidden bg-surface transition-[width] duration-200"
			style={{ width: open ? EXPANDED_WIDTH : COLLAPSED_WIDTH }}
		>
			<div className="sidebar-glow" aria-hidden="true" />

			<div className="relative z-10 flex h-full flex-col">
				{open ? (
					<>
						<div className="flex items-center justify-between px-2 py-8">
							<Image
								src="/Logo/Logo-full.png"
								alt="WritingHub"
								width={128}
								height={40}
								className="ml-2 h-10 w-auto object-contain"
								priority
							/>
							<button
								type="button"
								onClick={toggleSidebar}
								aria-label="Tutup sidebar"
								className="rounded p-1 text-subtle transition-colors hover:text-foreground"
							>
								<PanelLeft className="h-5 w-5" />
							</button>
						</div>

						<div className="px-2 pb-3">
							<button
								type="button"
								onClick={newSession}
								className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-accent-foreground transition-colors hover:bg-accent-hover"
							>
								<Plus className="h-5 w-5 shrink-0" />
								<span className="text-base font-medium">Buat Sesi Baru</span>
							</button>
						</div>

						<nav className="px-2">
							<SidebarLink icon={Home} label="Beranda" />
						</nav>

						<div className="mt-1 flex min-h-0 flex-1 flex-col">
							<SidebarSection title="Projects" action={<Plus className="h-5 w-5" />}>
								{PLACEHOLDER_PROJECTS.map((project) => (
									<SidebarLink key={project.id} icon={FolderOpen} label={project.name} />
								))}
							</SidebarSection>

							<SidebarSection title="Disematkan">
								{PLACEHOLDER_PINNED.map((item) => (
									<SidebarLink key={item.id} icon={MessageCircle} label={item.name} trailing={<Pin className="h-3 w-3 text-faint" />} />
								))}
							</SidebarSection>

							<div className="mx-3.5 mb-1 shrink-0 border-t border-line-strong" />

							<div className="flex min-h-0 flex-1 flex-col px-2">
								<div className="flex shrink-0 items-center justify-between px-2 py-1.5">
									<span className="text-[14px] font-semibold uppercase tracking-wide text-subtle">
										Riwayat
									</span>
									<div className="flex items-center gap-0.5">
										<SlidersHorizontal className="h-5 w-5 text-faint" />
										<Search className="h-5 w-5 text-faint" />
									</div>
								</div>

								<div className="flex-1 overflow-y-auto">
									{hydrated && ordered.length === 0 && (
										<p className="px-2 py-3 text-sm text-faint">Belum ada riwayat</p>
									)}

									{hydrated &&
										ordered.map((session) => (
											<div
												key={session.id}
												onClick={() => selectSession(session.id)}
												onMouseEnter={() => setHoveredId(session.id)}
												onMouseLeave={() => setHoveredId(null)}
												className={cn(
													'flex w-full cursor-pointer items-center justify-between rounded-lg px-2 py-1.5 transition-colors',
													session.id === activeId
														? 'bg-[var(--overlay-active)] text-foreground'
														: 'text-muted hover:bg-[var(--overlay-hover)] hover:text-foreground',
												)}
											>
												<div className="flex min-w-0 items-center gap-2">
													<FileText className="h-5 w-5 shrink-0 text-subtle" />
													<span className="truncate text-base">{sessionLabel(session)}</span>
												</div>
												{hoveredId === session.id && (
													<button
														type="button"
														aria-label="Hapus sesi"
														onClick={(event) => {
															event.stopPropagation()
															deleteSession(session.id)
														}}
														className="shrink-0 p-0.5 text-subtle transition-colors hover:text-red-400"
													>
														<Trash2 className="h-4 w-4" />
													</button>
												)}
											</div>
										))}
								</div>
							</div>
						</div>
					</>
				) : (
					<div className="flex flex-1 flex-col items-center gap-1 px-2 pt-1">
						<button
							type="button"
							onClick={toggleSidebar}
							aria-label="Buka sidebar"
							className="flex w-full flex-col items-center rounded-lg px-1 py-2 text-subtle transition-colors hover:bg-[var(--overlay-hover)] hover:text-foreground"
						>
							<PanelLeft className="my-4 h-7 w-7" />
						</button>

						<div className="mb-1 flex w-full flex-col items-center gap-1.5">
							<button
								type="button"
								onClick={newSession}
								aria-label="Buat sesi baru"
								className="flex h-12 w-13 items-center justify-center rounded-lg bg-accent text-accent-foreground transition-colors hover:bg-accent-hover"
							>
								<Plus className="h-7 w-7" />
							</button>
							<span className="text-[13px] font-medium leading-tight text-muted">Sesi Baru</span>
						</div>

						<CollapsedLink icon={Home} label="Beranda" />
						<CollapsedLink icon={FolderOpen} label="Projects" />
						<CollapsedLink icon={Pin} label="Disematkan" />
						<CollapsedLink icon={Clock} label="Riwayat" />
					</div>
				)}

				<div
					className={cn(
						'flex items-center border-t border-line px-2 pb-10 pt-7',
						open ? 'justify-between gap-2' : 'justify-center',
					)}
				>
					{open && (
						<div className="flex min-w-0 items-center gap-2">
							<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-line-strong">
								<span className="text-xs font-medium text-muted">
									{settings.profile.name.charAt(0).toUpperCase()}
								</span>
							</div>
							<div className="min-w-0">
								<p className="truncate text-base leading-tight text-muted">{settings.profile.name}</p>
								<p className="text-[14px] font-semibold leading-tight text-orange-400">
									{settings.profile.role}
								</p>
							</div>
						</div>
					)}
					<button
						type="button"
						onClick={() => setSettingsOpen(true)}
						title="Pengaturan"
						aria-label="Pengaturan"
						className="shrink-0 rounded p-1 text-subtle transition-colors hover:text-foreground"
					>
						<Settings className="h-6 w-6" />
					</button>
				</div>
			</div>
		</aside>
	)
}

function SidebarSection({
	title,
	action,
	children,
}: {
	title: string
	action?: React.ReactNode
	children: React.ReactNode
}) {
	return (
		<div className="mb-1 px-2">
			<div className="flex items-center justify-between px-2 py-1.5">
				<span className="text-[14px] font-semibold uppercase tracking-wide text-subtle">{title}</span>
				{action && <span className="text-faint">{action}</span>}
			</div>
			{children}
		</div>
	)
}

function SidebarLink({
	icon: Icon,
	label,
	trailing,
}: {
	icon: React.ComponentType<{ className?: string }>
	label: string
	trailing?: React.ReactNode
}) {
	return (
		<button
			type="button"
			className="group flex w-full items-center justify-between rounded-lg px-2 py-2 text-muted transition-colors hover:bg-[var(--overlay-hover)] hover:text-foreground"
		>
			<span className="flex min-w-0 items-center gap-2">
				<Icon className="h-5 w-5 shrink-0 text-subtle" />
				<span className="truncate text-base">{label}</span>
			</span>
			{trailing && <span className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100">{trailing}</span>}
		</button>
	)
}

function CollapsedLink({
	icon: Icon,
	label,
}: {
	icon: React.ComponentType<{ className?: string }>
	label: string
}) {
	return (
		<button
			type="button"
			className="flex w-full flex-col items-center gap-0.5 rounded-lg px-1 py-2 text-subtle transition-colors hover:bg-[var(--overlay-hover)] hover:text-foreground"
		>
			<Icon className="h-7 w-7" />
			<span className="text-[13px] leading-tight">{label}</span>
		</button>
	)
}
