'use client'

import {
	Check,
	Copy,
	FileText,
	Folder,
	FolderInput,
	Inbox,
	Link2,
	Loader2,
	MoreVertical,
	Pencil,
	Share2,
	SquareArrowOutUpRight,
	Trash2,
	X,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { Dropdown, DropdownItem, DropdownSeparator } from '@/components/ui/dropdown'
import { getDocument, updateDocument } from '@/features/documents/api'
import type { DocumentSummary, TabSummary } from '@/features/documents/types'
import { useInvalidateDocuments } from '@/features/documents/use-documents'
import { useProjects } from '@/features/projects/use-projects'
import { createShare } from '@/features/share/api'
import { useSync } from '@/features/sync/sync-context'
import { cn } from '@/lib/utils'

/** Tanggal dibaca manusia, tanpa pustaka tanggal. */
const dateFormat = new Intl.DateTimeFormat('id-ID', {
	day: 'numeric',
	month: 'short',
	year: 'numeric',
	hour: '2-digit',
	minute: '2-digit',
})

/** Tab yang sedang menunggu dialog bagikannya dibuka. */
interface ShareTarget {
	tabId: string
	title: string
}

/**
 * Satu dokumen di library.
 *
 * "Buka" mengambil detailnya dulu (kartu hanya memegang ringkasan), lalu
 * menyerahkannya ke sync context untuk dijadikan dokumen baru di editor,
 * lengkap dengan seluruh tabnya.
 */
export function DocumentCard({
	document,
	onDelete,
}: {
	document: DocumentSummary
	onDelete: () => void
}) {
	const router = useRouter()
	const { openFromLibrary } = useSync()
	const invalidate = useInvalidateDocuments()
	const { data: projects } = useProjects()

	const [renaming, setRenaming] = useState(false)
	const [opening, setOpening] = useState(false)
	const [shareTarget, setShareTarget] = useState<ShareTarget | null>(null)
	/** Pilihan tab untuk dibagikan; terisi hanya bila dokumennya punya >1 tab. */
	const [shareTabs, setShareTabs] = useState<TabSummary[] | null>(null)
	const [movingOpen, setMovingOpen] = useState(false)
	const [actionError, setActionError] = useState<string | null>(null)

	const open = () => {
		setOpening(true)
		setActionError(null)
		getDocument(document.id)
			.then(async (detail) => {
				const tabId = await openFromLibrary(detail)
				if (tabId) {
					router.push('/')
				} else {
					setActionError(
						'Jumlah dokumen atau tab sudah mencapai batas. Tutup salah satu dulu.',
					)
				}
			})
			.catch((cause) =>
				setActionError(cause instanceof Error ? cause.message : 'Gagal membuka dokumen'),
			)
			.finally(() => setOpening(false))
	}

	const rename = (title: string) => {
		setRenaming(false)
		setActionError(null)
		updateDocument(document.id, { title })
			.then(() => void invalidate())
			.catch((cause) =>
				setActionError(cause instanceof Error ? cause.message : 'Gagal mengganti nama'),
			)
	}

	/**
	 * Share tetap per TAB (keputusan 2 rencana restrukturisasi), jadi kartu
	 * dokumen harus memilih tabnya dulu: langsung bila hanya ada satu, lewat
	 * pilihan kecil bila lebih.
	 */
	const startShare = () => {
		setActionError(null)
		getDocument(document.id)
			.then((detail) => {
				if (detail.tabs.length === 0) {
					setActionError('Dokumen ini tidak punya tab untuk dibagikan.')
					return
				}
				if (detail.tabs.length === 1) {
					setShareTarget({ tabId: detail.tabs[0].id, title: detail.tabs[0].title })
				} else {
					setShareTabs(detail.tabs)
				}
			})
			.catch((cause) =>
				setActionError(cause instanceof Error ? cause.message : 'Gagal membaca tab dokumen'),
			)
	}

	/** Pindahkan ke proyek lain; `null` mengeluarkannya ke "Tanpa proyek". */
	const moveToProject = (projectId: string | null) => {
		setActionError(null)
		updateDocument(document.id, { projectId })
			.then(() => void invalidate())
			.catch((cause) =>
				setActionError(cause instanceof Error ? cause.message : 'Gagal memindahkan dokumen'),
			)
	}

	return (
		<div className="flex flex-col gap-2 rounded-2xl border border-line bg-surface-raised p-4 transition-colors hover:border-line-strong">
			<div className="flex items-start gap-3">
				<span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--overlay-active)] text-lg leading-none">
					<FileText className="h-4 w-4 text-subtle" />
				</span>

				<div className="min-w-0 flex-1">
					{renaming ? (
						<CardNameInput
							initialValue={document.title}
							onCommit={rename}
							onCancel={() => setRenaming(false)}
						/>
					) : (
						<h3 className="truncate text-sm font-medium text-foreground" title={document.title}>
							{document.title}
						</h3>
					)}
					<p className="mt-0.5 text-xs text-subtle">
						{document.tabCount} tab · {dateFormat.format(new Date(document.updatedAt))}
					</p>
				</div>

				<Dropdown
					align="end"
					trigger={({ open: menuOpen, toggle, id }) => (
						<button
							type="button"
							onClick={toggle}
							aria-label={`Opsi ${document.title}`}
							aria-expanded={menuOpen}
							aria-controls={id}
							className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-subtle transition-colors hover:bg-[var(--overlay-active)] hover:text-foreground"
						>
							<MoreVertical className="h-4 w-4" />
						</button>
					)}
				>
					{({ close }) => (
						<>
							<DropdownItem
								icon={
									opening ? (
										<Loader2 className="h-4 w-4 animate-spin" />
									) : (
										<SquareArrowOutUpRight className="h-4 w-4" />
									)
								}
								disabled={opening}
								onSelect={() => {
									close()
									open()
								}}
							>
								Buka
							</DropdownItem>
							<DropdownItem
								icon={<Pencil className="h-4 w-4" />}
								onSelect={() => {
									close()
									setRenaming(true)
								}}
							>
								Ganti nama
							</DropdownItem>
							<DropdownItem
								icon={<Share2 className="h-4 w-4" />}
								onSelect={() => {
									if (document.tabCount <= 1) close()
									startShare()
								}}
							>
								Bagikan
							</DropdownItem>
							{/* Share per tab: dokumen multi-tab menawarkan pilihan tabnya
							    sebagai submenu kecil; dokumen satu tab langsung membuka
							    dialog (menu sudah ditutup di atas). */}
							{shareTabs && (
								<div className="border-l border-line ml-5 flex flex-col">
									{shareTabs.map((tab) => (
										<DropdownItem
											key={tab.id}
											icon={<FileText className="h-4 w-4" />}
											onSelect={() => {
												close()
												setShareTabs(null)
												setShareTarget({ tabId: tab.id, title: tab.title })
											}}
										>
											{tab.title}
										</DropdownItem>
									))}
								</div>
							)}
							{/* Kartu library selalu dokumen server, jadi pemindahan proyek
							    selalu bekerja; dokumen lokal-saja memang tidak muncul di sini. */}
							<DropdownItem
								icon={<FolderInput className="h-4 w-4" />}
								onSelect={() => setMovingOpen((current) => !current)}
							>
								Pindahkan ke proyek
							</DropdownItem>
							{movingOpen && (
								<div className="border-l border-line ml-5 flex flex-col">
									<DropdownItem
										icon={
											document.projectId === null ? (
												<Check className="h-4 w-4" />
											) : (
												<Inbox className="h-4 w-4" />
											)
										}
										onSelect={() => {
											close()
											setMovingOpen(false)
											if (document.projectId !== null) moveToProject(null)
										}}
									>
										Tanpa proyek
									</DropdownItem>
									{projects?.map((project) => (
										<DropdownItem
											key={project.id}
											icon={
												document.projectId === project.id ? (
													<Check className="h-4 w-4" />
												) : (
													<Folder className="h-4 w-4" />
												)
											}
											onSelect={() => {
												close()
												setMovingOpen(false)
												if (document.projectId !== project.id) moveToProject(project.id)
											}}
										>
											{project.name}
										</DropdownItem>
									))}
									{projects?.length === 0 && (
										<p className="px-3 py-1.5 text-xs text-faint">
											Belum ada proyek. Buat dari sidebar Library.
										</p>
									)}
								</div>
							)}
							<DropdownSeparator />
							<DropdownItem
								icon={<Trash2 className="h-4 w-4" />}
								onSelect={() => {
									close()
									onDelete()
								}}
							>
								Hapus
							</DropdownItem>
						</>
					)}
				</Dropdown>
			</div>

			{actionError && <p className="text-xs text-red-500">{actionError}</p>}

			<button
				type="button"
				onClick={open}
				disabled={opening}
				className={cn(
					'mt-1 flex items-center justify-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-sm text-muted transition-colors hover:bg-[var(--overlay-hover)] hover:text-foreground',
					opening && 'cursor-not-allowed opacity-60',
				)}
			>
				{opening ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
				Buka di editor
			</button>

			{shareTarget && (
				<CardShareDialog
					tabId={shareTarget.tabId}
					title={shareTarget.title}
					onClose={() => setShareTarget(null)}
				/>
			)}
		</div>
	)
}

export function CardNameInput({
	initialValue,
	onCommit,
	onCancel,
}: {
	initialValue: string
	onCommit: (value: string) => void
	onCancel: () => void
}) {
	const [value, setValue] = useState(initialValue)
	const inputRef = useRef<HTMLInputElement>(null)

	useEffect(() => {
		inputRef.current?.select()
	}, [])

	const commit = () => {
		const trimmed = value.trim()
		if (trimmed) onCommit(trimmed)
		else onCancel()
	}

	return (
		<input
			ref={inputRef}
			value={value}
			autoFocus
			onChange={(event) => setValue(event.target.value)}
			onBlur={commit}
			onKeyDown={(event) => {
				if (event.key === 'Enter') commit()
				else if (event.key === 'Escape') onCancel()
			}}
			aria-label="Nama dokumen"
			className="w-full rounded-lg border border-accent bg-surface-raised px-2 py-1 text-sm text-foreground outline-none"
		/>
	)
}

/**
 * Dialog bagikan dari library: link dibuat dari `tabId`, tanpa membuka editor
 * dulu - kontennya diambil server dari tab yang tersimpan. Versi sederhana
 * dari dialog di menu bar: akses dan perannya bawaan, yang penting URL-nya
 * sampai ke tangan pemakai.
 */
function CardShareDialog({
	tabId,
	title,
	onClose,
}: {
	tabId: string
	title: string
	onClose: () => void
}) {
	const overlayRef = useRef<HTMLDivElement>(null)
	const [link, setLink] = useState('')
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState<string | null>(null)
	const [copied, setCopied] = useState(false)

	useEffect(() => {
		window.document.body.style.overflow = 'hidden'
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === 'Escape') onClose()
		}
		window.addEventListener('keydown', onKeyDown)

		createShare({ tabId, access: 'anyone', role: 'viewer' })
			.then((result) => setLink(`${window.location.origin}${result.url}`))
			.catch((cause) => setError(cause instanceof Error ? cause.message : 'Gagal membuat link'))
			.finally(() => setLoading(false))

		return () => {
			window.document.body.style.overflow = ''
			window.removeEventListener('keydown', onKeyDown)
		}
		// biome-ignore lint/correctness/useExhaustiveDependencies: dialog hanya membuat link sekali saat dibuka
	}, [tabId])

	const copyLink = async () => {
		if (!link) return
		try {
			await navigator.clipboard.writeText(link)
			setCopied(true)
			setTimeout(() => setCopied(false), 2000)
		} catch {
			// Jatuhkan ke input yang bisa dipilih bila clipboard ditolak.
		}
	}

	return (
		<div
			ref={overlayRef}
			role="dialog"
			aria-modal="true"
			aria-label="Bagikan tab"
			className="fixed inset-0 z-[70] flex animate-in items-center justify-center bg-black/60 backdrop-blur-sm fade-in duration-200"
			onClick={(event) => {
				if (event.target === overlayRef.current) onClose()
			}}
		>
			<div className="flex w-full max-w-md animate-in flex-col gap-4 rounded-2xl border border-line-strong bg-surface-raised p-5 shadow-2xl zoom-in-95 duration-200">
				<div className="flex items-start justify-between gap-4">
					<h2 className="text-base font-semibold text-foreground">
						Bagikan &ldquo;{title}&rdquo;
					</h2>
					<button
						type="button"
						onClick={onClose}
						aria-label="Tutup"
						className="rounded-md p-1 text-subtle transition-colors hover:bg-[var(--overlay-hover)] hover:text-foreground"
					>
						<X className="h-5 w-5" />
					</button>
				</div>

				<div className="flex items-center gap-2 rounded-lg border border-line-strong bg-surface-inset px-3 py-2">
					<Link2 className="h-4 w-4 shrink-0 text-faint" />
					<input
						type="text"
						readOnly
						value={loading ? 'Membuat link…' : error ? '' : link}
						className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none"
					/>
					<button
						type="button"
						onClick={() => void copyLink()}
						disabled={!link || loading || Boolean(error)}
						className={cn(
							'flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
							copied ? 'bg-green-500/15 text-green-600' : 'text-accent hover:bg-accent/10',
							(!link || loading || error) && 'cursor-not-allowed opacity-50',
						)}
					>
						{copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
						{copied ? 'Tersalin' : 'Salin'}
					</button>
				</div>

				{error ? (
					<p className="text-xs text-red-500">{error}</p>
				) : (
					<p className="text-xs text-subtle">
						Link merujuk salinan tab di server. Siapa pun yang memiliki link dapat membuka.
					</p>
				)}
			</div>
		</div>
	)
}
