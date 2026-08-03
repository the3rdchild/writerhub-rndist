import type { Editor } from '@tiptap/react'

/**
 * Jembatan antara isi editor dan teks polos yang dipakai pipeline analisis.
 *
 * Dua arahnya harus konsisten: teks yang dikirim ke API dan teks yang dipakai
 * memetakan offset sorotan berasal dari fungsi yang sama, jadi pemisah bloknya
 * tidak boleh berbeda satu karakter pun dari `buildTextIndex`.
 */

/** Teks polos yang dikirim ke API — pemisah blok harus cocok dengan buildTextIndex. */
export function editorPlainText(editor: Editor): string {
	return editor.getText({ blockSeparator: '\n' })
}

function escapeHtml(value: string): string {
	return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/**
 * Teks polos jadi paragraf HTML.
 *
 * Dipakai saat naskah datang dari luar editor — tempelan, unggahan, atau hasil
 * ekstraksi worker — dan sebagai cadangan untuk sesi lama yang tersimpan
 * sebelum isinya ikut disimpan sebagai HTML.
 */
export function textToParagraphs(text: string): string {
	if (!text) return '<p></p>'
	return text
		.split('\n')
		.map((line) => `<p>${line ? escapeHtml(line) : '<br>'}</p>`)
		.join('')
}
