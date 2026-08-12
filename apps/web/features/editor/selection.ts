'use client'

import type { Editor } from '@tiptap/react'
import { useEffect, useMemo, useState } from 'react'
import { useEditorInstance } from '@/features/editor/editor-context'
import { buildTextIndex, pmRangeToText } from '@/features/document/tiptap-offsets'

/**
 * Teks yang sedang disorot, sebagai state React.
 *
 * Offset teks polos sengaja TIDAK dihitung di sini. Memetakannya berarti
 * memindai seluruh dokumen, dan itu terjadi tiap kali kursor bergeser satu
 * karakter - pada naskah puluhan halaman ongkosnya terasa. Yang butuh offset
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
	// Teks ikut dibandingkan: seleksi yang disunting di tempat (mis. lewat
	// penerapan change) punya from/to yang sama tapi isi yang sudah berbeda.
	return a.from === b.from && a.to === b.to && a.text === b.text
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

/** Rentang seleksi dalam koordinat teks polos - koordinat yang dipakai API. */
export function selectionTextRange(
	editor: Editor,
	selection: EditorSelection,
): { offset: number; length: number } | null {
	return pmRangeToText(buildTextIndex(editor.state.doc), selection.from, selection.to)
}

/**
 * Seleksi editor yang sedang aktif, sebagai scope analisis.
 *
 * Dipakai panel-panel kanan supaya tombol Run mereka bisa bekerja pada teks
 * yang sedang disorot - sama seperti menu popup seleksi, tapi tanpa harus
 * melewati popup-nya. Seleksi dipertahankan di state ProseMirror walau editor
 * kehilangan fokus (lihat SelectionHighlight), jadi scope ini tetap valid
 * begitu pengguna mengklik panel/rail di kanan.
 *
 * Offset teks polos baru dihitung sekali di sini (bukan tiap transaksi), jadi
 * panel yang memangginya tidak menanggung pemindaian dokumen pada setiap ketikan.
 */
export interface SelectionScope {
	/** Teks polos yang terseleksi. */
	text: string
	/** Posisi seleksi di dalam dokumen penuh - untuk menggeser offset hasil. */
	offset: number
	/** Panjang seleksi dalam koordinat teks polos. */
	length: number
	/** Selalu true; menandai bahwa ini analisis per-seleksi, bukan naskah penuh. */
	scoped: true
	/** Perkiraan jumlah kata; ditampilkan di chip indikator. */
	wordCount: number
	/** Paragraf di sekitarnya - konteks percakapan, bukan bahan analisis. */
	surrounding: string
}

export function useSelectionScope(): SelectionScope | null {
	const { editor } = useEditorInstance()
	const selection = useEditorSelection(editor)

	return useMemo(() => {
		if (!editor || !selection) return null
		const range = selectionTextRange(editor, selection)
		if (!range) return null
		return {
			text: selection.text,
			offset: range.offset,
			length: range.length,
			scoped: true,
			wordCount: selection.words,
			surrounding: surroundingText(editor, selection),
		}
	}, [editor, selection])
}

/**
 * Beberapa paragraf di sekitar seleksi, sebagai konteks percakapan.
 *
 * Cukup untuk menjawab "kalimat ini kaku tidak" tanpa mengirim seluruh naskah
 * tiap giliran - pada PRD puluhan halaman bedanya besar sekali.
 */
export function surroundingText(editor: Editor, selection: EditorSelection, radius = 1_200): string {
	const { doc } = editor.state
	const from = Math.max(0, selection.from - radius)
	const to = Math.min(doc.content.size, selection.to + radius)
	return doc.textBetween(from, to, '\n', ' ')
}
