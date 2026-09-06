'use client'

import type { Editor } from '@tiptap/react'
import { useEffect, useState } from 'react'
import { pageOfPos, paginationKey } from './pagination'

export interface PageStatus {
	/** Lembar tempat kursor berada (1-based). */
	page: number
	/** Jumlah lembar hasil paginasi. */
	pageCount: number
}

/**
 * Halaman kursor dan jumlah lembar, dibaca langsung dari keadaan plugin
 * paginasi setiap kali editor bertransaksi.
 *
 * Dipakai bilah status editor: angkanya mengikuti kursor seperti di Word,
 * bukan mengikuti gulungan layar. Perubahan paginasi sendiri datang sebagai
 * transaksi (dispatch meta), jadi satu langganan 'transaction' mencakup
 * keduanya.
 */
export function usePageStatus(editor: Editor | null): PageStatus {
	const [status, setStatus] = useState<PageStatus>({ page: 1, pageCount: 1 })

	useEffect(
		function trackCursorPage() {
			if (!editor || editor.isDestroyed) return

			const read = () => {
				const state = paginationKey.getState(editor.state)
				if (!state) return
				setStatus((prev) => {
					const sheet = pageOfPos(state.blockPages, editor.state.selection.head)
					const page = (sheet ?? prev.page - 1) + 1
					if (page === prev.page && state.pageCount === prev.pageCount) return prev
					return { page, pageCount: state.pageCount }
				})
			}

			read()
			editor.on('transaction', read)
			return () => {
				editor.off('transaction', read)
			}
		},
		[editor],
	)

	return status
}
