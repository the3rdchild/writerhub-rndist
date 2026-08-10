'use client'

import type { TextChange } from '@writer-hub/shared'
import { useCallback, useEffect, useState } from 'react'
import { resolveSpan } from '@/features/document/suggestions'
import { buildTextIndex } from '@/features/document/tiptap-offsets'
import { replaceTextRange } from '@/features/editor/apply-text'
import { useEditorInstance } from '@/features/editor/editor-context'

/** Segmen yang sudah diterapkan dan masih bisa dibatalkan. */
export interface AppliedChange {
	/** Identitas stabil untuk render; urutan asli change di hasil analisis. */
	id: number
	/** Naskah sebelum diterapkan - tujuan Revert. */
	original: string
	/** Kandidat yang dipasang; ini yang dicari saat Revert. */
	applied: string
	/** Offset saat diterapkan; hanya petunjuk awal bagi `resolveSpan`. */
	offset: number
}

/**
 * Antrean perubahan yang bisa diterima satu per satu, plus riwayat singkat
 * yang sudah diterapkan supaya bisa dibatalkan.
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
	const [applied, setApplied] = useState<AppliedChange[]>([])
	/** Penomoran kartu "diterapkan"; sekadar kunci render yang tidak berulang. */
	const [nextId, setNextId] = useState(0)

	useEffect(() => {
		setPending(changes ? [...changes] : [])
		// Hasil baru berarti riwayat penerapan yang lama tidak lagi berlaku:
		// offsetnya milik naskah versi sebelumnya.
		setApplied([])
	}, [changes])

	/**
	 * Terapkan satu segmen. `candidate` memilih alternatif tertentu; tanpa itu
	 * `replacement` yang dipakai - fitur tanpa kandidat (Humanizer) dan hasil
	 * lama tetap bekerja seperti sebelumnya.
	 */
	const accept = useCallback(
		(index: number, candidate?: string) => {
			const change = pending[index]
			if (!change) return

			const replacement = candidate ?? change.replacement

			if (editor) {
				const ok = replaceTextRange(
					editor,
					{ offset: change.offset, length: change.length, expected: change.original },
					replacement,
				)
				if (ok) {
					setApplied((current) => [
						...current,
						{ id: nextId, original: change.original, applied: replacement, offset: change.offset },
					])
					setNextId((id) => id + 1)
				}
			}

			const delta = replacement.length - change.length
			setPending((current) =>
				current
					.filter((_, i) => i !== index)
					.map((other) =>
						other.offset > change.offset ? { ...other, offset: other.offset + delta } : other,
					),
			)
		},
		[pending, editor, nextId],
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
		// Terapkan-semua sengaja tidak mengisi riwayat Revert: membatalkannya satu
		// per satu setelah belasan penggantian beruntun lebih membingungkan
		// daripada Ctrl+Z biasa, yang memang sudah menanganinya.
		setApplied([])
	}, [pending, editor])

	/**
	 * Kembalikan satu segmen ke naskah aslinya.
	 *
	 * Teks yang dicari adalah kandidat yang tadi dipasang, bukan posisinya:
	 * pengguna bisa saja menyunting bagian lain sehingga offsetnya bergeser.
	 * Kalau teks itu sudah tidak ada - karena bagian itu sendiri yang disunting -
	 * pembatalan tidak dilakukan, dan pemanggil sudah menandainya lewat
	 * `canRevert`.
	 */
	const revert = useCallback(
		(id: number) => {
			const entry = applied.find((item) => item.id === id)
			if (!entry || !editor) return

			const ok = replaceTextRange(
				editor,
				{ offset: entry.offset, length: entry.applied.length, expected: entry.applied },
				entry.original,
			)
			if (ok) setApplied((current) => current.filter((item) => item.id !== id))
		},
		[applied, editor],
	)

	/** Apakah teks yang diterapkan masih utuh di naskah sekarang? */
	const canRevert = useCallback(
		(id: number): boolean => {
			const entry = applied.find((item) => item.id === id)
			if (!entry || !editor || editor.isDestroyed) return false
			const { text } = buildTextIndex(editor.state.doc)
			return resolveSpan(text, entry.applied, entry.offset) !== null
		},
		[applied, editor],
	)

	return { pending, applied, accept, dismiss, acceptAll, revert, canRevert }
}
