'use client'

import type { TextChange } from '@writer-hub/shared'
import { useCallback, useEffect, useState } from 'react'
import { replaceTextRange } from '@/features/editor/apply-text'
import { useEditorInstance } from '@/features/editor/editor-context'

/**
 * Antrean perubahan yang bisa diterima satu per satu.
 *
 * Perubahan disimpan lokal (bukan di state dokumen) karena hanya bermakna
 * selama hasil analisis itu ditampilkan. Setiap kali satu diterima, offset
 * perubahan sesudahnya digeser sesuai selisih panjang teks - tanpa itu,
 * penerimaan kedua akan memotong teks di posisi yang salah.
 *
 * Penggantian diterapkan langsung ke editor lewat replaceTextRange (lihat
 * features/editor/apply-text), supaya format dokumen tidak ikut diratakan.
 */
export function usePendingChanges(changes: readonly TextChange[] | undefined) {
	const { editor } = useEditorInstance()
	const [pending, setPending] = useState<TextChange[]>([])

	useEffect(() => {
		setPending(changes ? [...changes] : [])
	}, [changes])

	const accept = useCallback(
		(index: number) => {
			const change = pending[index]
			if (!change) return

			if (editor) {
				replaceTextRange(
					editor,
					{ offset: change.offset, length: change.length, expected: change.original },
					change.replacement,
				)
			}

			const delta = change.replacement.length - change.length
			setPending((current) =>
				current
					.filter((_, i) => i !== index)
					.map((other) =>
						other.offset > change.offset ? { ...other, offset: other.offset + delta } : other,
					),
			)
		},
		[pending, editor],
	)

	const dismiss = useCallback((index: number) => {
		setPending((current) => current.filter((_, i) => i !== index))
	}, [])

	const acceptAll = useCallback(() => {
		// Dari offset terbesar ke terkecil, jadi tidak perlu menggeser apa pun
		// di dalam dokumen editor.
		if (editor) {
			const ordered = [...pending].sort((a, b) => b.offset - a.offset)
			for (const change of ordered) {
				replaceTextRange(
					editor,
					{ offset: change.offset, length: change.length, expected: change.original },
					change.replacement,
				)
			}
		}
		setPending([])
	}, [pending, editor])

	return { pending, accept, dismiss, acceptAll }
}
