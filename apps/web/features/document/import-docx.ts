'use client'

/**
 * Membaca DOCX beserta formatnya, di browser.
 *
 * Jalur ini sengaja terpisah dari ekstraksi teks yang sudah ada. Ekstraksi di
 * worker melayani pipeline analisis: ia memang hanya butuh teks polos, dan
 * membuangnya format adalah keputusan yang benar di sana. Impor ini melayani
 * hal lain - memasukkan naskah ke editor - jadi ia menempuh rute sendiri:
 * DOCX → HTML → skema Tiptap.
 *
 * Dikerjakan di browser, bukan di worker, karena hasilnya langsung masuk ke
 * editor. Mengirimkannya bolak-balik lewat antrean hanya menambah tunggu tanpa
 * menambah apa pun.
 */

/** Yang hilang saat mengimpor, dan alasannya. */
export interface ImportWarning {
	message: string
}

export interface DocxImport {
	html: string
	/** Hal yang tidak punya padanan di editor ini; ditunjukkan, bukan disembunyikan. */
	warnings: ImportWarning[]
}

/**
 * Gaya Word dipetakan ke node yang benar-benar kita punya.
 *
 * Tanpa peta ini, "Heading 1" milik Word masuk sebagai paragraf tebal - mirip
 * secara visual, tapi bukan heading, jadi kerangka dokumen dan navigasinya
 * kosong.
 */
const STYLE_MAP = [
	"p[style-name='Title'] => h1:fresh",
	"p[style-name='Subtitle'] => h2:fresh",
	"p[style-name='Heading 1'] => h1:fresh",
	"p[style-name='Heading 2'] => h2:fresh",
	"p[style-name='Heading 3'] => h3:fresh",
	"p[style-name='Heading 4'] => h4:fresh",
	"p[style-name='Heading 5'] => h5:fresh",
	"p[style-name='Heading 6'] => h6:fresh",
	"p[style-name='Quote'] => blockquote:fresh",
	"p[style-name='Intense Quote'] => blockquote:fresh",
	'r[style-name=\'Strong\'] => strong',
	'r[style-name=\'Emphasis\'] => em',
	// Word menandai coret dan garis bawah sebagai properti run, bukan gaya;
	// mammoth sudah menanganinya lewat opsi bawaan.
]

/**
 * Pesan mammoth yang tidak perlu dilihat pengguna.
 *
 * Peringatan "unrecognised paragraph style" muncul untuk hampir tiap dokumen
 * Word dan hampir selalu tidak berarti apa-apa - gaya itu jatuh ke paragraf
 * biasa, yang memang yang diinginkan. Membanjiri pengguna dengan itu membuat
 * peringatan yang benar-benar penting ikut terabaikan.
 */
function isNoise(message: string): boolean {
	return /unrecognised (paragraph|run) style/i.test(message)
}

export async function importDocx(file: File): Promise<DocxImport> {
	/*
	 * Impor dinamis: mammoth berukuran besar dan hanya dipakai saat pengguna
	 * benar-benar mengunggah DOCX, jadi ia tidak ikut bundel halaman awal.
	 *
	 * Diimpor dari entry utamanya, bukan dari `mammoth/mammoth.browser`. Field
	 * `browser` di package.json-nya sudah memetakan bagian yang bergantung Node
	 * (unzip, akses berkas) ke versi browser, jadi bundler yang menggantinya -
	 * dan hanya entry utama yang punya berkas tipe.
	 */
	const { default: mammoth } = await import('mammoth')

	const result = await mammoth.convertToHtml(
		{ arrayBuffer: await file.arrayBuffer() },
		{
			styleMap: STYLE_MAP,
			// Gambar disematkan sebagai data URI supaya ikut tersimpan bersama
			// naskah - editor ini tidak punya penyimpanan aset tersendiri.
			convertImage: mammoth.images.imgElement(async (image) => ({
				src: `data:${image.contentType};base64,${await image.read('base64')}`,
			})),
		},
	)

	const warnings = result.messages
		.filter((message) => !isNoise(message.message))
		.map((message) => ({ message: message.message }))

	return { html: result.value, warnings }
}

/** Apakah berkas ini DOCX, dilihat dari MIME maupun namanya. */
export function isDocx(file: File): boolean {
	return (
		file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
		file.name.toLowerCase().endsWith('.docx')
	)
}
