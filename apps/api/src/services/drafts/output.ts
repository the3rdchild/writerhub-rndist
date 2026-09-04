import { DRAFT_OUTPUTS, type DraftOutput, type DraftRenderError } from '@writer-hub/shared'
import type { DraftRequest } from './dto'

/**
 * Bentuk berkas yang diminta, dibaca dari permintaannya.
 *
 * Ada dua sumber, dan yang eksplisit selalu menang. `output` di badan permintaan
 * dipakai apa adanya; tanpa itu, kalimat penggunanya yang dibaca - pemanggil
 * eksternal sering hanya meneruskannya apa adanya, dan "outputnya pdf" ada di
 * teksnya, bukan di medan mana pun.
 *
 * **Kenapa bukan model yang memutuskan.** `kind: 'auto'` boleh menyerahkannya ke
 * model karena artefaknya mendeklarasikan dirinya sendiri: jawaban satu-pagar
 * ```html *adalah* keputusannya (`markdown-doc.ts`). Format tidak punya properti
 * itu - ia wadah pengiriman, bukan bentuk naskah. Menaruhnya di prompt berarti
 * satu keputusan lagi untuk dilawan, sementara pola di bawah membacanya dengan
 * biaya nol dan bisa diuji.
 */

/**
 * Hanya token format yang tidak punya arti lain. Kata umum sengaja tidak ada di
 * sini: "gambar" jauh lebih sering menyebut isi rancangannya ("flyer dengan
 * gambar kucing") daripada bentuk berkasnya, dan menebaknya salah berarti
 * membelanjakan satu slot perender untuk berkas yang tidak diminta.
 */
const TOKENS: ReadonlyArray<readonly [DraftOutput, RegExp]> = [
	['pdf', /\bpdf\b/i],
	['docx', /\bdocx\b/i],
	['png', /\bpng\b/i],
	['jpg', /\bjpe?g\b/i],
]

/**
 * "word" tidak bisa dicari sendirian - `\bword\b` juga kena pada "500 words",
 * dan panjang naskah adalah hal yang memang sering ditulis di permintaan ini
 * (`words` bahkan medan tersendiri di `dto.ts`). Jadi ia hanya dikenali ketika
 * didahului kata yang menandai "bentuk berkas".
 */
const WORD_PHRASE = /\b(?:ms|microsoft|file|berkas|format|output|keluaran|dokumen)\s+word\b/i

/** Format yang benar-benar disebut kalimatnya. Kosong kalau tidak ada. */
export function outputsInPrompt(prompt: string | undefined): DraftOutput[] {
	if (!prompt) return []

	const found = new Set<DraftOutput>()
	for (const [output, pattern] of TOKENS) {
		if (pattern.test(prompt)) found.add(output)
	}
	if (WORD_PHRASE.test(prompt)) found.add('docx')

	// Diurutkan menurut daftar bersama, bukan menurut urutan kemunculannya di
	// kalimat: keluaran yang sama harus selalu menghasilkan larik yang sama.
	return DRAFT_OUTPUTS.filter((output) => found.has(output))
}

/**
 * Keputusan akhir untuk satu permintaan. Larik kosong berarti **tidak ada yang
 * dirender** - itu yang menjaga pemanggil lama, yang tidak pernah mengirim
 * `output` dan tidak menyebut format apa pun, berperilaku persis seperti dulu.
 */
export function resolveOutputs(request: DraftRequest): DraftOutput[] {
	return request.output ?? outputsInPrompt(request.prompt)
}

/**
 * Alasan untuk keluaran yang diminta ketika naskahnya sendiri belum selesai -
 * `generating`, dan `failed` yang tidak akan pernah punya naskah.
 *
 * Bukan kegagalan, dan kalimatnya harus mencerminkan itu: render baru
 * dititipkan setelah naskahnya tersimpan (docs/RENDER-WORKER-PLAN.md §2), jadi
 * satu-satunya jawaban jujur di sini adalah "belum, tanyakan lagi".
 */
const NOT_WRITTEN_YET = 'Berkasnya baru dibuat setelah naskahnya selesai - tanyakan lagi lewat statusUrl.'

export function pendingRenderErrors(outputs: readonly DraftOutput[]): DraftRenderError[] {
	return outputs.map((output) => ({ output, reason: NOT_WRITTEN_YET }))
}

/**
 * Format yang bisa dihasilkan perender hari ini. Yang di luar daftar ini tetap
 * dijawab `renderErrors` - sebagian berhasil adalah keadaan normal, bukan
 * kekecualian - tapi alasannya jujur: perendernya memang belum ada.
 */
export const RENDERABLE_OUTPUTS: readonly DraftOutput[] = ['pdf']

/**
 * Alasan untuk keluaran yang diminta tapi tidak ada di `downloads` **sesudah**
 * render selesai. Beda dari `pendingRenderErrors`: di sini pekerjaannya sudah
 * berakhir, jadi "belum tersedia" hanya benar untuk format yang perendernya
 * memang belum ditulis.
 */
export function unrenderedReason(output: DraftOutput): string {
	if (!RENDERABLE_OUTPUTS.includes(output)) {
		return `Perender ${output.toUpperCase()} belum tersedia. Dokumennya sudah bisa dibuka dan dicetak dari WritingHub.`
	}
	return `Render ${output.toUpperCase()} berakhir tanpa hasil yang tercatat. Coba minta ulang dokumennya.`
}

/** Panjang nama berkas yang masih enak dibaca di bilah unduhan. */
const MAX_FILENAME_CHARS = 100

/**
 * Nama berkas unduhan dari judul dokumen - objeknya bernama UUID, dan nama
 * itulah yang dipakai peramban tanpa `ResponseContentDisposition`.
 *
 * Murni dan bisa diuji karena salahnya senyap: satu garis miring yang lolos
 * berubah jadi folder lain di peramban pembacanya, bukan galat di sini.
 */
export function downloadFileName(title: string, output: DraftOutput): string {
	const base = title
		.replace(/[\r\n\t]+/g, ' ')
		// Karakter yang bermakna di path (Windows maupun Unix) dan yang tidak
		// sah di header HTTP dibuang; sisanya - termasuk non-ASCII - aman
		// karena SDK yang menyandikan headernya.
		// biome-ignore lint/suspicious/noControlCharactersInRegex: justru karakter kendali itu yang sedang dibuang - ia tidak sah di dalam nilai header
		.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '')
		.replace(/\s+/g, ' ')
		.trim()
		.slice(0, MAX_FILENAME_CHARS)
		.trimEnd()

	return `${base || 'dokumen'}.${output}`
}
