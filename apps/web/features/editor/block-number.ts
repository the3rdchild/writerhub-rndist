'use client'

import { Extension } from '@tiptap/core'

/**
 * Rupa dan penanda nomor sebuah judul - bukan nomornya sendiri.
 *
 * Nomor itu kini dihitung hidup oleh `live-numbering` dari tingkat judul dan
 * skema penomoran dokumen, lalu digambar sebagai dekorasi. Yang tetap tersimpan
 * pada node adalah dua hal yang memang dimiliki tiap judul sendiri:
 *
 * - `numberStyle`: rupa nomornya, diambil dari properti tanda paragraf di Word.
 *   Nomor bab yang tebal, misalnya, menyimpan tebalnya di sini, bukan pada teks
 *   paragrafnya - persis seperti Word memisahkan keduanya. Dituangkan sebagai
 *   properti kustom CSS supaya hanya mengenai nomornya.
 * - `suppressNumber`: penanda judul yang menolak nomornya. "DAFTAR ISI" memakai
 *   gaya heading agar masuk kerangka, namun membatalkan penomoran; tanpa
 *   penanda ini, "PENDAHULUAN" sesudahnya menjadi "BAB 2".
 *
 * Nomor tidak ikut teks paragrafnya - itu sengaja, supaya pemeriksa tata bahasa
 * dan hitungan keterbacaan tidak menghitung "1.2.3" sebagai kalimat.
 */

const NUMBERED = ['paragraph', 'heading']

export const BlockNumber = Extension.create({
	name: 'blockNumber',

	addGlobalAttributes() {
		return [
			{
				types: NUMBERED,
				attributes: {
					/**
					 * Judul yang menolak nomornya tidak dihitung penomoran hidup.
					 *
					 * Disimpan agar tetap ada setelah halaman dimuat ulang - dekorasi
					 * sendiri tidak ikut tersimpan. Bawaannya null (tidak menyatakan
					 * apa-apa) supaya dokumen lama yang belum memilikinya tetap bernomor.
					 */
					suppressNumber: {
						default: null,
						parseHTML: (element) => element.hasAttribute('data-no-number'),
						renderHTML: (attributes) =>
							attributes.suppressNumber ? { 'data-no-number': '' } : {},
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
