'use client'

import { CloudOff, FileText } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { deleteDocument } from '@/features/documents/api'
import type { DocumentSummary } from '@/features/documents/types'
import { useDocuments, useInvalidateDocuments } from '@/features/documents/use-documents'
import { DocumentCard } from './document-card'

/**
 * Daftar dokumen di cloud, sebagai kartu-kartu.
 *
 * Halaman ini hanya menampilkan dokumen server; naskah yang masih lokal-saja
 * tidak muncul di sini - ia milik tab editor, dan penandanya sudah ada di
 * sidebar tab.
 *
 * `projectFilter` dari query string: 'all' (semua), 'none' (belum berproyek),
 * atau ID proyek.
 */
export function DocumentGrid({ projectFilter }: { projectFilter: string }) {
	const { data: documents, isPending, isError, error } = useDocuments()
	const invalidate = useInvalidateDocuments()
	const [pendingDelete, setPendingDelete] = useState<DocumentSummary | null>(null)
	const [deleteError, setDeleteError] = useState<string | null>(null)
	const [deleting, setDeleting] = useState(false)

	if (isPending) {
		return (
			<div className="flex h-64 items-center justify-center">
				<div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
			</div>
		)
	}

	if (isError) {
		return (
			<div className="flex h-64 flex-col items-center justify-center text-center">
				<CloudOff className="h-12 w-12 text-faint" />
				<h2 className="mt-4 text-lg font-medium text-foreground">Gagal memuat library</h2>
				<p className="mt-1 max-w-md text-sm text-muted">
					{error instanceof Error ? error.message : 'Terjadi kesalahan saat membaca daftar dokumen.'}
				</p>
			</div>
		)
	}

	const visible =
		projectFilter === 'all'
			? documents
			: projectFilter === 'none'
				? documents.filter((document) => document.projectId === null)
				: documents.filter((document) => document.projectId === projectFilter)

	if (visible.length === 0) {
		if (documents.length > 0) {
			return (
				<div className="flex h-64 flex-col items-center justify-center text-center">
					<FileText className="h-12 w-12 text-faint" />
					<h2 className="mt-4 text-lg font-medium text-foreground">Tidak ada dokumen di sini</h2>
					<p className="mt-1 max-w-md text-sm text-muted">
						Pindahkan dokumen ke proyek ini lewat menu &ldquo;Pindahkan ke proyek&rdquo; di kartu
						dokumen.
					</p>
				</div>
			)
		}
		return (
			<div className="flex h-64 flex-col items-center justify-center text-center">
				<FileText className="h-12 w-12 text-faint" />
				<h2 className="mt-4 text-lg font-medium text-foreground">Belum ada dokumen di cloud</h2>
				<p className="mt-1 max-w-md text-sm text-muted">
					Buka tab dokumen di editor, lalu pilih &ldquo;Simpan ke cloud&rdquo; dari menunya.
				</p>
				<Link
					href="/"
					className="mt-6 rounded-xl bg-accent px-5 py-2 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent-hover"
				>
					Kembali ke editor
				</Link>
			</div>
		)
	}

	const confirmDelete = () => {
		if (!pendingDelete) return
		setDeleting(true)
		setDeleteError(null)
		deleteDocument(pendingDelete.id)
			.then(() => {
				setPendingDelete(null)
				void invalidate()
			})
			.catch((cause) =>
				setDeleteError(cause instanceof Error ? cause.message : 'Gagal menghapus dokumen'),
			)
			.finally(() => setDeleting(false))
	}

	return (
		<>
			<div className="mx-auto grid w-full max-w-5xl grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
				{visible.map((document) => (
					<DocumentCard
						key={document.id}
						document={document}
						onDelete={() => setPendingDelete(document)}
					/>
				))}
			</div>

			<ConfirmDialog
				open={pendingDelete !== null}
				danger
				title="Hapus dokumen ini?"
				description={
					<>
						Dokumen <strong className="text-foreground">{pendingDelete?.title}</strong> dihapus
						dari cloud. Tidak ada jalan kembali.
						{deleteError && <span className="mt-2 block text-red-500">{deleteError}</span>}
					</>
				}
				confirmLabel={deleting ? 'Menghapus…' : 'Hapus'}
				onConfirm={confirmDelete}
				onCancel={() => {
					setPendingDelete(null)
					setDeleteError(null)
				}}
			/>
		</>
	)
}
