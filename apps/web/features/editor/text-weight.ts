'use client'

import { Extension } from '@tiptap/core'

/**
 * Bobot huruf sebagai gaya teks, sejajar dengan rupa dan ukurannya.
 *
 * Editor menebalkan judul lewat CSS - `.document-body h1 { font-weight: 600 }` -
 * dan itu benar untuk naskah yang ditulis di sini: judul yang baru diketik
 * harus langsung terlihat seperti judul. Tapi aturan itu tidak bisa dibantah
 * dari dalam. Tanda tebal punya `<strong>`, sedangkan "justru tidak tebal"
 * tidak punya penandanya sendiri, jadi teks apa pun di dalam judul akan tampil
 * setengah tebal entah dokumennya menghendaki atau tidak.
 *
 * Itu terasa saat mengimpor DOCX. Di naskah ilmiah, judul bab kerap seukuran
 * dan setipis teks isi - yang membedakannya hanya nomornya - jadi menebalkannya
 * mengubah rupa dokumen dari yang ditinggalkan penulisnya di Word.
 *
 * Ekstensi ini menempel pada mark `textStyle`, cara yang sama dipakai
 * `fontFamily` dan `fontSize` bawaan Tiptap.
 */
export const TextWeight = Extension.create({
	name: 'textWeight',

	addGlobalAttributes() {
		return [
			{
				types: ['textStyle'],
				attributes: {
					fontWeight: {
						default: null,
						parseHTML: (element) => element.style.fontWeight || null,
						renderHTML: (attributes) =>
							attributes.fontWeight ? { style: `font-weight: ${attributes.fontWeight}` } : {},
					},
				},
			},
		]
	},
})
