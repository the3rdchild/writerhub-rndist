'use client'

import { Folder, Inbox, LibraryBig, MoreVertical, Pencil, Plus, Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Dropdown, DropdownItem } from '@/components/ui/dropdown'
import { useInvalidateDocuments } from '@/features/documents/use-documents'
import { createProject, deleteProject, updateProject } from '@/features/projects/api'
import type { ProjectSummary } from '@/features/projects/types'
import { useInvalidateProjects, useProjects } from '@/features/projects/use-projects'
import { cn } from '@/lib/utils'

/**
 * Sidebar kiri /library: filter dokumen per proyek. Pilihan disimpan di query
 * string `?project=` (all / none / <id>) supaya bisa di-bookmark dan tombol
 * Kembali bekerja.
 */
export function ProjectSidebar({ active }: { active: string }) {
	const router = useRouter()
	const { data: projects } = useProjects()
	const invalidateProjects = useInvalidateProjects()
	const invalidateDocuments = useInvalidateDocuments()

	const [creating, setCreating] = useState(false)
	const [renamingId, setRenamingId] = useState<string | null>(null)
	const [pendingDelete, setPendingDelete] = useState<ProjectSummary | null>(null)
	const [deleting, setDeleting] = useState(false)
	const [actionError, setActionError] = useState<string | null>(null)

	const go = (value: string) => router.push(`/library?project=${encodeURIComponent(value)}`)

	const failMessage = (cause: unknown, fallback: string) =>
		setActionError(cause instanceof Error ? cause.message : fallback)

	const create = (name: string) => {
		setCreating(false)
		setActionError(null)
		createProject({ name })
			.then((project) => {
				void invalidateProjects()
				go(project.id)
			})
			.catch((cause) => failMessage(cause, 'Gagal membuat proyek'))
	}

	const rename = (project: ProjectSummary, name: string) => {
		setRenamingId(null)
		if (name === project.name) return
		setActionError(null)
		updateProject(project.id, { name })
			.then(() => void invalidateProjects())
			.catch((cause) => failMessage(cause, 'Gagal mengganti nama proyek'))
	}

	const confirmDelete = () => {
		if (!pendingDelete) return
		setDeleting(true)
		setActionError(null)
		deleteProject(pendingDelete.id)
			.then(() => {
				// Dokumen di dalamnya pindah ke "Tanpa proyek" (FK set null),
				// jadi daftar dokumen juga perlu ditarik ulang.
				void invalidateProjects()
				void invalidateDocuments()
				if (active === pendingDelete.id) go('all')
				setPendingDelete(null)
			})
			.catch((cause) => failMessage(cause, 'Gagal menghapus proyek'))
			.finally(() => setDeleting(false))
	}

	return (
		<aside className="flex w-56 shrink-0 flex-col border-r border-line">
			<nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-3 py-4">
				<SidebarItem
					icon={<LibraryBig className="h-4 w-4" />}
					label="Semua dokumen"
					active={active === 'all'}
					onSelect={() => go('all')}
				/>
				<SidebarItem
					icon={<Inbox className="h-4 w-4" />}
					label="Tanpa proyek"
					active={active === 'none'}
					onSelect={() => go('none')}
				/>

				{projects && projects.length > 0 && (
					<p className="px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-faint">
						Proyek
					</p>
				)}

				{projects?.map((project) =>
					renamingId === project.id ? (
						<div key={project.id} className="px-2 py-0.5">
							<ProjectNameInput
								initialValue={project.name}
								autoFocus
								onCommit={(name) => rename(project, name)}
								onCancel={() => setRenamingId(null)}
							/>
						</div>
					) : (
						<div key={project.id} className="group/row flex items-center">
							<SidebarItem
								icon={<Folder className="h-4 w-4" />}
								label={project.name}
								active={active === project.id}
								onSelect={() => go(project.id)}
								className="flex-1"
							/>
							<Dropdown
								align="end"
								trigger={({ toggle, id }) => (
									<button
										type="button"
										onClick={toggle}
										aria-label={`Opsi proyek ${project.name}`}
										aria-controls={id}
										className="mr-1 rounded p-1 text-subtle opacity-0 transition-opacity hover:bg-[var(--overlay-active)] hover:text-foreground group-hover/row:opacity-100"
									>
										<MoreVertical className="h-3.5 w-3.5" />
									</button>
								)}
							>
								{({ close }) => (
									<>
										<DropdownItem
											icon={<Pencil className="h-4 w-4" />}
											onSelect={() => {
												close()
												setRenamingId(project.id)
											}}
										>
											Ganti nama
										</DropdownItem>
										<DropdownItem
											icon={<Trash2 className="h-4 w-4" />}
											onSelect={() => {
												close()
												setPendingDelete(project)
											}}
										>
											Hapus
										</DropdownItem>
									</>
								)}
							</Dropdown>
						</div>
					),
				)}

				{actionError && <p className="px-3 pt-2 text-xs text-red-500">{actionError}</p>}
			</nav>

			<div className="border-t border-line p-3">
				{creating ? (
					<ProjectNameInput
						initialValue=""
						placeholder="Nama proyek"
						autoFocus
						onCommit={create}
						onCancel={() => setCreating(false)}
					/>
				) : (
					<button
						type="button"
						onClick={() => setCreating(true)}
						className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted transition-colors hover:bg-[var(--overlay-hover)] hover:text-foreground"
					>
						<Plus className="h-4 w-4" />
						Proyek baru
					</button>
				)}
			</div>

			<ConfirmDialog
				open={pendingDelete !== null}
				danger
				title="Hapus proyek ini?"
				description={
					<>
						Proyek <strong className="text-foreground">{pendingDelete?.name}</strong> dihapus.
						Dokumen di dalamnya <strong className="text-foreground">tidak ikut terhapus</strong>{' '}
						— mereka kembali ke &ldquo;Tanpa proyek&rdquo;.
					</>
				}
				confirmLabel={deleting ? 'Menghapus…' : 'Hapus'}
				onConfirm={confirmDelete}
				onCancel={() => setPendingDelete(null)}
			/>
		</aside>
	)
}

function SidebarItem({
	icon,
	label,
	active,
	onSelect,
	className,
}: {
	icon: React.ReactNode
	label: string
	active: boolean
	onSelect: () => void
	className?: string
}) {
	return (
		<button
			type="button"
			onClick={onSelect}
			className={cn(
				'flex min-w-0 items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors',
				active
					? 'bg-[var(--overlay-active)] font-medium text-foreground'
					: 'text-muted hover:bg-[var(--overlay-hover)] hover:text-foreground',
				className,
			)}
		>
			<span className="flex h-4 w-4 shrink-0 items-center justify-center text-subtle">{icon}</span>
			<span className="truncate">{label}</span>
		</button>
	)
}

/** Input nama inline, dipakai untuk membuat dan mengganti nama proyek. */
function ProjectNameInput({
	initialValue,
	placeholder,
	autoFocus,
	onCommit,
	onCancel,
}: {
	initialValue: string
	placeholder?: string
	autoFocus?: boolean
	onCommit: (value: string) => void
	onCancel: () => void
}) {
	const [value, setValue] = useState(initialValue)
	const inputRef = useRef<HTMLInputElement>(null)

	useEffect(() => {
		if (autoFocus) inputRef.current?.select()
	}, [autoFocus])

	const commit = () => {
		const trimmed = value.trim()
		if (trimmed) onCommit(trimmed)
		else onCancel()
	}

	return (
		<input
			ref={inputRef}
			value={value}
			autoFocus={autoFocus}
			placeholder={placeholder}
			onChange={(event) => setValue(event.target.value)}
			onBlur={commit}
			onKeyDown={(event) => {
				if (event.key === 'Enter') commit()
				else if (event.key === 'Escape') onCancel()
			}}
			aria-label={placeholder ?? 'Nama proyek'}
			className="w-full rounded-lg border border-accent bg-surface-raised px-2 py-1 text-sm text-foreground outline-none"
		/>
	)
}
