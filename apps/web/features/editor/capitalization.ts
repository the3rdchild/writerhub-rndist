'use client'

import type { Editor } from '@tiptap/react'

/**
 * Ubah kapitalisasi teks yang sedang diseleksi.
 *
 * Ditulis sebagai transformasi per node teks, bukan "ambil teksnya lalu sisipkan
 * ulang": menyisipkan ulang seluruh rentang akan meratakan format di dalamnya -
 * satu kata tebal di tengah seleksi hilang ketebalannya. Di sini tiap node teks
 * diganti dengan versi barunya beserta `marks` aslinya, jadi tebal/miring/tautan
 * di dalam seleksi tetap utuh.
 */

export type CapitalizationMode = 'lower' | 'upper' | 'title'

/**
 * Huruf pertama tiap kata jadi kapital, sisanya kecil.
 *
 * Sengaja sederhana: tidak ada daftar kata sambung yang dikecualikan, dan
 * akronim seperti "PDF" ikut jadi "Pdf". Aturan title case yang "pintar" berbeda
 * antar gaya selingkung, dan menebaknya diam-diam lebih menyebalkan daripada
 * aturan yang bisa diramalkan.
 */
function toTitleCase(text: string): string {
	return text.replace(
		/\p{L}[\p{L}\p{M}\p{N}'’-]*/gu,
		(word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase(),
	)
}

const TRANSFORMS: Record<CapitalizationMode, (text: string) => string> = {
	lower: (text) => text.toLowerCase(),
	upper: (text) => text.toUpperCase(),
	title: toTitleCase,
}

/**
 * Terapkan `mode` ke seleksi saat ini. Mengembalikan false bila tidak ada yang
 * berubah - seleksi kosong, atau teksnya memang sudah berbentuk begitu.
 */
export function applyCapitalization(editor: Editor | null, mode: CapitalizationMode): boolean {
	if (!editor) return false

	const { from, to, empty } = editor.state.selection
	if (empty) return false

	const transform = TRANSFORMS[mode]
	const { tr } = editor.state
	let changed = false

	editor.state.doc.nodesBetween(from, to, (node, pos) => {
		if (!node.isText || !node.text) return
		// Node teks bisa menjulur keluar seleksi di kedua ujungnya; yang diproses
		// hanya irisannya.
		const start = Math.max(pos, from)
		const end = Math.min(pos + node.nodeSize, to)
		if (start >= end) return

		const slice = node.text.slice(start - pos, end - pos)
		const next = transform(slice)
		if (next === slice) return

		// Posisi dipetakan lewat `tr.mapping`: sebagian besar perubahan huruf
		// berukuran sama, tapi tidak semua (mis. "ß" jadi "SS"), jadi penggantian
		// berikutnya bisa bergeser.
		tr.replaceWith(tr.mapping.map(start), tr.mapping.map(end), editor.schema.text(next, node.marks))
		changed = true
	})

	if (!changed) return false
	editor.view.dispatch(tr.scrollIntoView())
	editor.view.focus()
	return true
}
