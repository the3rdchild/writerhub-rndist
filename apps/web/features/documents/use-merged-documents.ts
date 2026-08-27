'use client'

import { useCallback, useMemo, useState } from 'react'
import { useSessions } from '@/features/sessions/session-context'
import { useSync } from '@/features/sync/sync-context'
import { getDocument } from './api'
import { mergeDocuments, type MergedDocument } from './merged'
import { useDocuments } from './use-documents'

export function useMergedDocuments() {
	const { documents, selectDocument } = useSessions()
	const { serverDocId, openFromLibrary } = useSync()
	const serverDocuments = useDocuments()

	const merged = useMemo(
		() => mergeDocuments(documents, serverDocuments.data ?? [], serverDocId),
		[documents, serverDocuments.data, serverDocId],
	)

	return {
		documents: merged,
		isPending: serverDocuments.isPending,
		isError: serverDocuments.isError,
		error: serverDocuments.error,
		selectDocument,
		openFromLibrary,
	}
}

export function useOpenDocument() {
	const { selectDocument } = useSessions()
	const { openFromLibrary } = useSync()
	const [openingKey, setOpeningKey] = useState<string | null>(null)
	const [openError, setOpenError] = useState<string | null>(null)

	const open = useCallback(
		async (dok: MergedDocument): Promise<boolean> => {
			setOpenError(null)

			if (dok.localId) {
				selectDocument(dok.localId)
				return true
			}
			if (!dok.serverId) return false

			setOpeningKey(dok.key)
			try {
				const detail = await getDocument(dok.serverId)
				const tabId = await openFromLibrary(detail)
				if (!tabId) {
					setOpenError('Batas jumlah dokumen tercapai - tutup salah satu dulu.')
					return false
				}
				return true
			} catch (cause) {
				setOpenError(cause instanceof Error ? cause.message : 'Gagal membuka dokumen')
				return false
			} finally {
				setOpeningKey(null)
			}
		},
		[selectDocument, openFromLibrary],
	)

	return { open, openingKey, openError, clearOpenError: () => setOpenError(null) }
}
