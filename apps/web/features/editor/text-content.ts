import type { JSONContent } from '@tiptap/core'
import type { Editor } from '@tiptap/react'

export function editorPlainText(editor: Editor): string {
	return editor.getText({ blockSeparator: '\n' })
}

function escapeHtml(value: string): string {
	return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function textToParagraphs(text: string): string {
	if (!text) return '<p></p>'
	return text
		.split('\n')
		.map((line) => `<p>${line ? escapeHtml(line) : '<br>'}</p>`)
		.join('')
}

/**
 * Tipe node yang mengakhiri satu blok teks, sehingga isinya tidak menempel
 * pada blok berikutnya saat dijadikan teks polos.
 */
const BLOCK_TYPES = new Set(['paragraph', 'heading', 'blockquote', 'listItem', 'codeBlock', 'tableRow'])

/**
 * Membaca teks dari dokumen Tiptap tanpa instance editor.
 *
 * editorPlainText() butuh Editor yang hidup, jadi tidak bisa dipakai di server
 * - padahal metadata halaman berbagi harus dibentuk di sana. Penelusuran
 * berhenti begitu `maxChars` terlampaui supaya dokumen panjang tidak dibaca
 * seluruhnya hanya untuk mengambil satu cuplikan.
 */
export function jsonPlainText(
	node: JSONContent | null | undefined,
	maxChars = Number.POSITIVE_INFINITY,
): string {
	if (!node) return ''

	const parts: string[] = []
	let length = 0

	const visit = (current: JSONContent): boolean => {
		if (typeof current.text === 'string' && current.text.length > 0) {
			parts.push(current.text)
			length += current.text.length
			if (length >= maxChars) return false
		}

		for (const child of current.content ?? []) {
			if (!visit(child)) return false
		}

		if (BLOCK_TYPES.has(current.type ?? '')) {
			parts.push('\n')
			length += 1
		}

		return length < maxChars
	}

	visit(node)
	return parts
		.join('')
		.replace(/\n{2,}/g, '\n')
		.trim()
}

/** Cuplikan satu baris untuk deskripsi meta dan kartu pratinjau tautan. */
export function excerpt(text: string, maxChars: number): string {
	const flat = text.replace(/\s+/g, ' ').trim()
	if (flat.length <= maxChars) return flat

	// Dipotong di batas kata terdekat supaya tidak berakhir di tengah kata.
	const clipped = flat.slice(0, maxChars)
	const lastSpace = clipped.lastIndexOf(' ')
	return `${(lastSpace > maxChars * 0.6 ? clipped.slice(0, lastSpace) : clipped).trimEnd()}…`
}
