'use client'

import { CloudOff, FileText } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { deleteDocument } from '@/features/documents/api'
import { filterByProject, type MergedDocument } from '@/features/documents/merged'
import { useInvalidateDocuments } from '@/features/documents/use-documents'
import { useMergedDocuments } from '@/features/documents/use-merged-documents'
import { useSessions } from '@/features/sessions/session-context'
import { DocumentCard } from './document-card'
import { LocalDocumentCard } from './local-document-card'

/**
 * Daftar dokumen, sebagai kartu-kartu.
 *
 * Menampilkan dokumen server DAN dokumen yang baru ada di perangkat ini. Dulu
 * halaman ini khusus cloud sementara Riwayat di menu khusus lokal, jadi dua
 * daftar yang tampak setara sebenarnya berisi himpunan berbeda - dokumen yang
 * belum disimpan hanya ada di satu tempat, dokumen lama yang sudah ditutup
 * hanya ada di tempat lain. Aturan penggabungannya di `features/documents/merged.ts`.
 *
 * `projectFilter` dari query string: 'all' (semua), 'none' (belum berproyek),
 * atau ID proyek.
 */
export function DocumentGrid({ projectFilter }: { projectFilter: string }) {
	const { documents, isPending, isError, error } = useMergedDocuments()
	const invalidate = useInvalidateDocuments()
	const { deleteDocument: deleteLocalDocument } = useSessions()
	const [pendingDelete, setPendingDelete] = useState<MergedDocument | null>(null)
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

	const visible = filterByProject(documents, projectFilter)

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
				<h2 className="mt-4 text-lg font-medium text-foreground">Belum ada dokumen</h2>
				<p className="mt-1 max-w-md text-sm text-muted">
					Buat dokumen di editor - ia langsung muncul di sini, dan bisa disimpan ke cloud kapan
					saja lewat tombol di kartunya.
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

	/**
	 * Dokumen server dihapus lewat API; dokumen lokal-saja dihapus dari Y.Doc.
	 * Dokumen yang sudah tersinkron dihapus di dua tempat - baris servernya dan
	 * salinannya di perangkat ini - supaya tidak muncul lagi sebagai "lokal
	 * saja" sesaat setelah dihapus.
	 */
	const confirmDelete = () => {
		if (!pendingDelete) return
		const { serverId, localId } = pendingDelete
		setDeleting(true)
		setDeleteError(null)

		const removeServer = serverId ? deleteDocument(serverId) : Promise.resolve()
		removeServer
			.then(() => {
				if (localId) deleteLocalDocument(localId)
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
				{visible.map((document) =>
					document.serverId ? (
						<DocumentCard
							key={document.key}
							document={{
								id: document.serverId,
								title: document.title,
								// Baris server selalu punya proyek (setiap dokumen wajib
								// berproyek) - projectId hanya null untuk dokumen lokal-saja,
								// yang tidak masuk cabang ini (document.serverId truthy).
								projectId: document.projectId as string,
								tabCount: document.tabCount,
								updatedAt: document.updatedAt,
								createdAt: 0,
							}}
							onDelete={() => setPendingDelete(document)}
						/>
					) : (
						<LocalDocumentCard
							key={document.key}
							document={document}
							onDelete={() => setPendingDelete(document)}
						/>
					),
				)}
			</div>

			<ConfirmDialog
				open={pendingDelete !== null}
				danger
				title="Hapus dokumen ini?"
				description={
					<>
						{pendingDelete?.serverId ? (
							<>
								Dokumen <strong className="text-foreground">{pendingDelete.title}</strong> beserta
								seluruh {pendingDelete.tabCount} tab-nya (termasuk riwayat versi dan link
								berbagi di dalamnya) dihapus dari cloud. Tidak ada jalan kembali.
							</>
						) : (
							<>
								Dokumen <strong className="text-foreground">{pendingDelete?.title}</strong> beserta
								seluruh {pendingDelete?.tabCount} tab-nya dihapus dari perangkat ini. Dokumen ini{' '}
								<strong className="text-foreground">belum pernah tersimpan di cloud</strong>, jadi
								tidak ada salinan yang bisa dipulihkan.
							</>
						)}
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
