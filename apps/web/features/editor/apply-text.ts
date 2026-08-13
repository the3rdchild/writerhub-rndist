'use client'

import type { Editor } from '@tiptap/react'
import { buildTextIndex, textRangeToPM } from '@/features/document/tiptap-offsets'
import { resolveSpan } from '@/features/document/suggestions'
import { toEditorContent } from './markdown'

/**
 * Ganti satu rentang teks dengan teks lain.
 *
 * Rentangnya disimpan sebagai offset teks polos, bukan posisi ProseMirror,
 * karena naskah bisa berubah antara saat usulan dibuat dan saat pengguna
 * menekan Apply. Offset itu cuma petunjuk; posisi sebenarnya dihitung ulang
 * lewat `resolveSpan` (lihat suggestions.ts), yang memilih kemunculan terdekat
 * saat katanya muncul berkali-kali. Dulu pencarian ini memakai `indexOf` murni
 * yang selalu kembali ke kemunculan pertama - jadi kata umum seperti "yang"
 * diganti di halaman 1 walau pemakai sedang di halaman 8 (§P10).
 *
 * `focus` bawaannya `false`: pemakai sudah melihat tempatnya, dan menggulir
 * lagi hanya bisa meleset (§P3.1). Seleksi tetap diperbarui ke akhir teks baru
 * oleh `insertContentAt`; yang dihindari cuma gulir layar dan perampasan fokus.
 *
 * Catatan: `length` tidak dipakai di sini karena `resolveSpan` memutuskan
 * rentang dari `expected`. Ia tetap ada di parameter supaya semua pemanggil
 * (panel analisis, popover, obrolan) tidak perlu diubah.
 */
export function replaceTextRange(
	editor: Editor,
	{ offset, expected }: { offset: number; length: number; expected: string },
	replacement: string,
	{ focus = false }: { focus?: boolean } = {},
): boolean {
	const index = buildTextIndex(editor.state.doc)

	const span = resolveSpan(index.text, expected, offset)
	if (!span) return false

	const range = textRangeToPM(index, span.offset, span.length)
	if (!range) return false

	// Jawaban model kerap berbentuk Markdown; diserahkan mentah-mentah, tabel
	// dan heading masuk ke naskah sebagai teks yang menyerupainya.
	// insertContentAt memperbarui seleksi ke akhir teks baru secara bawaan; fokus
	// (dan gulir) hanya saat diminta lewat `focus`.
	const chain = editor.chain().insertContentAt(range, toEditorContent(replacement))
	if (focus) chain.focus()
	chain.run()
	return true
}
