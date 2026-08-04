'use client'

import type { Editor } from '@tiptap/react'
import { buildTextIndex, textRangeToPM } from '@/features/document/tiptap-offsets'

/**
 * Ganti satu rentang teks dengan teks lain.
 *
 * Rentangnya disimpan sebagai offset teks polos, bukan posisi ProseMirror,
 * karena naskah bisa berubah antara saat usulan dibuat dan saat pengguna
 * menekan Apply. Kalau isi di offset itu ternyata sudah bukan yang diharapkan,
 * teks aslinya dicari ulang - dan kalau tetap tidak ketemu, lebih baik gagal
 * daripada menimpa kalimat yang salah.
 */
export function replaceTextRange(
	editor: Editor,
	{ offset, length, expected }: { offset: number; length: number; expected: string },
	replacement: string,
): boolean {
	const index = buildTextIndex(editor.state.doc)

	const atOffset = index.text.slice(offset, offset + length)
	const start = atOffset === expected ? offset : index.text.indexOf(expected)
	if (start === -1) return false

	const range = textRangeToPM(index, start, expected.length)
	if (!range) return false

	editor.chain().focus().insertContentAt(range, replacement).run()
	return true
}
