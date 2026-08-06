'use client'

/**
 * Membaca DOCX beserta formatnya, di browser.
 *
 * Jalur ini sengaja terpisah dari ekstraksi teks yang sudah ada. Ekstraksi di
 * worker melayani pipeline analisis: ia memang hanya butuh teks polos, dan
 * membuang format adalah keputusan yang benar di sana. Impor ini melayani hal
 * lain - memasukkan naskah ke editor - jadi ia menempuh rute sendiri, membaca
 * OOXML langsung jadi dokumen Tiptap.
 *
 * Dikerjakan di browser, bukan di worker, karena hasilnya langsung masuk ke
 * editor. Mengirimkannya bolak-balik lewat antrean hanya menambah tunggu tanpa
 * menambah apa pun.
 */

import type { DocxImport, ImportWarning } from './docx'

export type { DocxImport, ImportWarning }

export async function importDocx(file: File): Promise<DocxImport> {
	// Impor dinamis: seluruh pembaca DOCX beserta pembongkar zip-nya hanya
	// dipakai saat pengguna benar-benar mengunggah berkas, jadi ia tidak ikut
	// bundel halaman awal.
	const { readDocx } = await import('./docx')
	return readDocx(new Uint8Array(await file.arrayBuffer()))
}

/** Apakah berkas ini DOCX, dilihat dari MIME maupun namanya. */
export function isDocx(file: File): boolean {
	return (
		file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
		file.name.toLowerCase().endsWith('.docx')
	)
}
