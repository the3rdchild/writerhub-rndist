'use client'

import { Extension } from '@tiptap/core'

/**
 * Nomor otomatis sebuah blok - "BAB I", "1.2.3", butir daftar.
 *
 * Nomornya disimpan sebagai atribut dan digambar lewat `::before`, bukan
 * disisipkan sebagai teks. Bedanya penting di beberapa tempat sekaligus:
 *
 * - Pemeriksa tata bahasa dan hitungan keterbacaan tidak melihatnya. "1.2.3"
 *   bukan kalimat, dan menghitungnya sebagai kalimat merusak seluruh statistik
 *   naskah.
 * - Kursor tidak bisa masuk ke dalamnya, jadi nomor tidak bisa terhapus
 *   sebagian - persis seperti di Word.
 * - Saat penomoran hidup menyusul, yang perlu diubah hanya nilai atributnya;
 *   naskahnya sendiri tidak ikut disentuh.
 *
 * Rupa nomornya diambil dari properti tanda paragraf (`w:pPr/w:rPr`) - memang
 * di situlah Word menyimpan bagaimana nomor digambar, terpisah dari rupa teks
 * paragrafnya. Ia dikirim sebagai properti kustom CSS supaya hanya mengenai
 * nomornya dan tidak menyentuh isi paragraf.
 */

const NUMBERED = ['paragraph', 'heading']

export const BlockNumber = Extension.create({
	name: 'blockNumber',

	addGlobalAttributes() {
		return [
			{
				types: NUMBERED,
				attributes: {
					blockNumber: {
						default: null,
						parseHTML: (element) => element.getAttribute('data-number'),
						renderHTML: (attributes) =>
							attributes.blockNumber ? { 'data-number': attributes.blockNumber } : {},
					},
					numberStyle: {
						default: null,
						parseHTML: (element) => element.getAttribute('data-number-style'),
						renderHTML: (attributes) =>
							attributes.numberStyle
								? { 'data-number-style': attributes.numberStyle, style: attributes.numberStyle }
								: {},
					},
				},
			},
		]
	},
})
