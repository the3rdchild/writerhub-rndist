'use client'

import { CloudOff, CloudUpload, FileText, Loader2, MoreVertical, Pencil, Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Dropdown, DropdownItem, DropdownSeparator } from '@/components/ui/dropdown'
import type { MergedDocument } from '@/features/documents/merged'
import { useSessions } from '@/features/sessions/session-context'
import { useSync } from '@/features/sync/sync-context'
import { CardNameInput } from './document-card'

const dateFormat = new Intl.DateTimeFormat('id-ID', {
	day: 'numeric',
	month: 'short',
	year: 'numeric',
	hour: '2-digit',
	minute: '2-digit',
})

export function LocalDocumentCard({
	document,
	onDelete,
}: {
	document: MergedDocument
	onDelete: () => void
}) {
	const router = useRouter()
	const { selectDocument, renameDocument } = useSessions()
	const { saveDocumentToCloud } = useSync()

	const [renaming, setRenaming] = useState(false)
	const [saving, setSaving] = useState(false)
	const [actionError, setActionError] = useState<string | null>(null)

	const localId = document.localId
	if (!localId) return null

	const open = () => {
		selectDocument(localId)
		router.push('/')
	}

	const saveToCloud = () => {
		setSaving(true)
		setActionError(null)
		saveDocumentToCloud(localId)
			.then((ok) => {
				if (!ok) setActionError('Gagal menyimpan ke cloud. Coba lagi.')
			})
			.finally(() => setSaving(false))
	}

	return (
		<div className="flex flex-col gap-2 rounded-2xl border border-dashed border-line bg-surface-raised p-4 transition-colors hover:border-line-strong">
			<div className="flex items-start gap-3">
				<span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--overlay-active)]">
					<FileText className="h-4 w-4 text-subtle" />
				</span>

				<div className="min-w-0 flex-1">
					{renaming ? (
						<CardNameInput
							initialValue={document.title}
							onCommit={(title) => {
								renameDocument(localId, title)
								setRenaming(false)
							}}
							onCancel={() => setRenaming(false)}
						/>
					) : (
						<h3 className="truncate text-sm font-medium text-foreground" title={document.title}>
							{document.title}
						</h3>
					)}
					<p className="mt-0.5 flex items-center gap-1.5 text-xs text-subtle">
						<span>
							{document.tabCount} tab · {dateFormat.format(new Date(document.updatedAt))}
						</span>
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
								icon={<Pencil className="h-4 w-4" />}
								onSelect={() => {
									close()
									setRenaming(true)
								}}
							>
								Ganti nama
							</DropdownItem>
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

			<p className="flex items-center gap-1.5 text-xs text-faint">
				<CloudOff className="h-3.5 w-3.5 shrink-0" />
				Belum tersimpan di cloud
			</p>

			{actionError && <p className="text-xs text-red-500">{actionError}</p>}

			<div className="flex gap-2">
				<button
					type="button"
					onClick={open}
					className="flex-1 rounded-xl border border-line px-3 py-2 text-sm text-foreground transition-colors hover:bg-[var(--overlay-hover)]"
				>
					Buka di editor
				</button>
				<button
					type="button"
					onClick={saveToCloud}
					disabled={saving}
					title="Simpan dokumen ini beserta seluruh tabnya ke cloud"
					className="flex items-center justify-center gap-1.5 rounded-xl bg-accent px-3 py-2 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent-hover disabled:opacity-60"
				>
					{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CloudUpload className="h-4 w-4" />}
					Simpan
				</button>
			</div>
		</div>
	)
}
