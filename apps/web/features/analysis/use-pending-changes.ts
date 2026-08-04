'use client'

import type { TextChange } from '@writer-hub/shared'
import { useCallback, useEffect, useState } from 'react'
import { useDocument } from '@/features/document/document-context'
import { replaceRange } from '@/features/document/suggestions'

/**
 * Antrean perubahan yang bisa diterima satu per satu.
 *
 * Perubahan disimpan lokal (bukan di state dokumen) karena hanya bermakna
 * selama hasil analisis itu ditampilkan. Setiap kali satu diterima, offset
 * perubahan sesudahnya digeser sesuai selisih panjang teks - tanpa itu,
 * penerimaan kedua akan memotong teks di posisi yang salah.
 */
export function usePendingChanges(changes: readonly TextChange[] | undefined) {
	const { state, dispatch } = useDocument()
	const [pending, setPending] = useState<TextChange[]>([])

	useEffect(() => {
		setPending(changes ? [...changes] : [])
	}, [changes])

	const accept = useCallback(
		(index: number) => {
			const change = pending[index]
			if (!change) return

			dispatch({ type: 'replaceText', text: replaceRange(state.text, change, change.replacement) })

			const delta = change.replacement.length - change.length
			setPending((current) =>
				current
					.filter((_, i) => i !== index)
					.map((other) =>
						other.offset > change.offset ? { ...other, offset: other.offset + delta } : other,
					),
			)
		},
		[pending, dispatch, state.text],
	)

	const dismiss = useCallback((index: number) => {
		setPending((current) => current.filter((_, i) => i !== index))
	}, [])

	const acceptAll = useCallback(() => {
		// Dari offset terbesar ke terkecil, jadi tidak perlu menggeser apa pun.
		const ordered = [...pending].sort((a, b) => b.offset - a.offset)
		const text = ordered.reduce(
			(current, change) => replaceRange(current, change, change.replacement),
			state.text,
		)

		dispatch({ type: 'replaceText', text })
		setPending([])
	}, [pending, dispatch, state.text])

	return { pending, accept, dismiss, acceptAll }
}
