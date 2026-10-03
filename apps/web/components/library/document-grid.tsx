'use client'

import { CloudOff, FileText, Search } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { deleteDocument, getDocument } from '@/features/documents/api'
import {
	type DocumentSort,
	filterByProject,
	type MergedDocument,
	searchDocuments,
	sortDocuments,
} from '@/features/documents/merged'
import { useInvalidateDocuments } from '@/features/documents/use-documents'
import { useMergedDocuments } from '@/features/documents/use-merged-documents'
import { useSessions } from '@/features/sessions/session-context'
import { useSync } from '@/features/sync/sync-context'
import { DocumentCard } from './document-card'
import { LocalDocumentCard } from './local-document-card'

export function DocumentGrid({ projectFilter }: { projectFilter: string }) {
	const { documents, isPending, isError, error } = useMergedDocuments()
	const invalidate = useInvalidateDocuments()
	const { deleteDocument: deleteLocalDocument, duplicateDocument } = useSessions()
	const { openFromLibrary } = useSync()
	const [query, setQuery] = useState('')
	const [sort, setSort] = useState<DocumentSort>('modified')
	const [actionError, setActionError] = useState<string | null>(null)
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
				<h2 className="mt-4 text-lg font-medium text-foreground">Could not load the library</h2>
				<p className="mt-1 max-w-md text-sm text-muted">
					{error instanceof Error ? error.message : 'Something went wrong while reading the document list.'}
				</p>
			</div>
		)
	}

	const inProject = filterByProject(documents, projectFilter)
	const visible = sortDocuments(searchDocuments(inProject, query), sort)

	/* Salinan selalu dokumen lokal; dokumen yang baru ada di server diunduh dulu. */
	const duplicate = async (dok: MergedDocument) => {
		setActionError(null)
		try {
			let source = dok.localId
			if (!source && dok.serverId) {
				source = await openFromLibrary(await getDocument(dok.serverId))
				if (!source) {
					setActionError('Too many documents or tabs are open. Close one first.')
					return
				}
			}
			if (!source || !duplicateDocument(source)) setActionError('Could not duplicate the document.')
		} catch (cause) {
			setActionError(cause instanceof Error ? cause.message : 'Could not duplicate the document.')
		}
	}

	const toolbar = (
		<div className="mx-auto mb-4 flex w-full max-w-5xl flex-wrap items-center gap-3">
			<label className="relative min-w-[220px] flex-1">
				<span className="sr-only">Search documents</span>
				<Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-faint" />
				<input
					type="search"
					value={query}
					onChange={(event) => setQuery(event.target.value)}
					placeholder="Search documents"
					className="w-full rounded-xl border border-line-strong bg-surface-inset py-2 pr-3 pl-9 text-sm text-foreground outline-none transition-colors placeholder:text-faint focus:border-accent/50"
				/>
			</label>
			<label className="flex items-center gap-2 text-sm text-muted">
				Sort by
				<select
					value={sort}
					onChange={(event) => setSort(event.target.value as DocumentSort)}
					className="rounded-xl border border-line-strong bg-surface-inset px-3 py-2 text-sm text-foreground outline-none focus:border-accent/50"
				>
					<option value="modified">Last modified</option>
					<option value="name">Name</option>
				</select>
			</label>
			{actionError && <p className="w-full text-xs text-red-500">{actionError}</p>}
		</div>
	)

	if (inProject.length > 0 && visible.length === 0) {
		return (
			<>
				{toolbar}
				<div className="flex h-48 flex-col items-center justify-center text-center">
					<Search className="h-10 w-10 text-faint" />
					<h2 className="mt-4 text-base font-medium text-foreground">No documents match “{query.trim()}”</h2>
				</div>
			</>
		)
	}

	if (visible.length === 0) {
		if (documents.length > 0) {
			return (
				<div className="flex h-64 flex-col items-center justify-center text-center">
					<FileText className="h-12 w-12 text-faint" />
					<h2 className="mt-4 text-lg font-medium text-foreground">No documents here</h2>
					<p className="mt-1 max-w-md text-sm text-muted">
						Move documents into this project with &ldquo;Move to project&rdquo; in a document card&rsquo;s
						menu.
					</p>
				</div>
			)
		}
		return (
			<div className="flex h-64 flex-col items-center justify-center text-center">
				<FileText className="h-12 w-12 text-faint" />
				<h2 className="mt-4 text-lg font-medium text-foreground">No documents yet</h2>
				<p className="mt-1 max-w-md text-sm text-muted">
					Create a document in the editor - it shows up here right away, and you can save it to the cloud any
					time from its card.
				</p>
				<Link
					href="/"
					className="mt-6 rounded-xl bg-accent px-5 py-2 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent-hover"
				>
					Back to editor
				</Link>
			</div>
		)
	}
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
				setDeleteError(cause instanceof Error ? cause.message : 'Could not delete the document'),
			)
			.finally(() => setDeleting(false))
	}

	return (
		<>
			{toolbar}
			<div className="mx-auto grid w-full max-w-5xl grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
				{visible.map((document) =>
					document.serverId ? (
						<DocumentCard
							key={document.key}
							document={{
								id: document.serverId,
								title: document.title,
								projectId: document.projectId as string,
								templateSlug: null,
								layout: null,
								metadata: null,
								brief: null,
								tabCount: document.tabCount,
								updatedAt: document.updatedAt,
								createdAt: 0,
							}}
							onDelete={() => setPendingDelete(document)}
							onDuplicate={() => void duplicate(document)}
						/>
					) : (
						<LocalDocumentCard
							key={document.key}
							document={document}
							onDelete={() => setPendingDelete(document)}
							onDuplicate={() => void duplicate(document)}
						/>
					),
				)}
			</div>

			<ConfirmDialog
				open={pendingDelete !== null}
				danger
				title="Delete this document?"
				description={
					<>
						{pendingDelete?.serverId ? (
							<>
								<strong className="text-foreground">{pendingDelete.title}</strong> and all{' '}
								{pendingDelete.tabCount} of its tabs (including version history and share links) will be
								deleted from the cloud. This can't be undone.
							</>
						) : (
							<>
								<strong className="text-foreground">{pendingDelete?.title}</strong> and all{' '}
								{pendingDelete?.tabCount} of its tabs will be deleted from this device. This document{' '}
								<strong className="text-foreground">was never saved to the cloud</strong>, so there is no copy
								to restore.
							</>
						)}
						{deleteError && <span className="mt-2 block text-red-500">{deleteError}</span>}
					</>
				}
				confirmLabel={deleting ? 'Deleting…' : 'Delete'}
				onConfirm={confirmDelete}
				onCancel={() => {
					setPendingDelete(null)
					setDeleteError(null)
				}}
			/>
		</>
	)
}
