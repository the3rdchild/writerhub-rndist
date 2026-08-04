'use client'

import type { Editor } from '@tiptap/react'
import { useEffect, useState } from 'react'
import { buildTextIndex, pmRangeToText } from '@/features/document/tiptap-offsets'

/**
 * Teks yang sedang disorot, sebagai state React.
 *
 * Offset teks polos sengaja TIDAK dihitung di sini. Memetakannya berarti
 * memindai seluruh dokumen, dan itu terjadi tiap kali kursor bergeser satu
 * karakter — pada naskah puluhan halaman ongkosnya terasa. Yang butuh offset
 * memanggil `selectionTextRange` saat aksinya benar-benar dijalankan.
 */

export interface EditorSelection {
	from: number
	to: number
	text: string
	/** Perkiraan jumlah kata; ditampilkan di popup seleksi. */
	words: number
}

/** Ambang seleksi yang dianggap sengaja, bukan salah klik. */
const MIN_SELECTION_LENGTH = 2

function countWords(text: string): number {
	const trimmed = text.trim()
	return trimmed ? trimmed.split(/\s+/).length : 0
}

function read(editor: Editor): EditorSelection | null {
	const { from, to, empty } = editor.state.selection
	if (empty) return null

	const text = editor.state.doc.textBetween(from, to, '\n', ' ')
	if (text.trim().length < MIN_SELECTION_LENGTH) return null

	return { from, to, text, words: countWords(text) }
}

function same(a: EditorSelection | null, b: EditorSelection | null): boolean {
	if (a === null || b === null) return a === b
	return a.from === b.from && a.to === b.to
}

export function useEditorSelection(editor: Editor | null): EditorSelection | null {
	const [selection, setSelection] = useState<EditorSelection | null>(null)

	useEffect(() => {
		if (!editor) {
			setSelection(null)
			return
		}

		const sync = () =>
			setSelection((current) => {
				const next = read(editor)
				return same(current, next) ? current : next
			})

		sync()
		editor.on('selectionUpdate', sync)
		editor.on('transaction', sync)
		return () => {
			editor.off('selectionUpdate', sync)
			editor.off('transaction', sync)
		}
	}, [editor])

	return selection
}

/** Rentang seleksi dalam koordinat teks polos — koordinat yang dipakai API. */
export function selectionTextRange(
	editor: Editor,
	selection: EditorSelection,
): { offset: number; length: number } | null {
	return pmRangeToText(buildTextIndex(editor.state.doc), selection.from, selection.to)
}

/**
 * Beberapa paragraf di sekitar seleksi, sebagai konteks percakapan.
 *
 * Cukup untuk menjawab "kalimat ini kaku tidak" tanpa mengirim seluruh naskah
 * tiap giliran — pada PRD puluhan halaman bedanya besar sekali.
 */
export function surroundingText(editor: Editor, selection: EditorSelection, radius = 1_200): string {
	const { doc } = editor.state
	const from = Math.max(0, selection.from - radius)
	const to = Math.min(doc.content.size, selection.to + radius)
	return doc.textBetween(from, to, '\n', ' ')
}
