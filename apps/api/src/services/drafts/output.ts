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
 * Alasan yang dilaporkan selama perendernya belum ada.
 *
 * Kontraknya sengaja dikunci lebih dulu (lihat `docs/RENDER-WORKER-PLAN.md` §7),
 * jadi pemanggil sudah bisa menulis penanganannya sekarang: begitu worker
 * mendarat, entri di sini berubah menjadi entri di `downloads` tanpa PPE
 * mengubah apa pun. Statusnya tetap `ready` karena dokumennya memang siap.
 */
const NOT_IMPLEMENTED =
	'Perender berkas belum tersedia. Dokumennya sudah bisa dibuka dan dicetak dari WritingHub.'

export function pendingRenderErrors(outputs: readonly DraftOutput[]): DraftRenderError[] {
	return outputs.map((output) => ({ output, reason: NOT_IMPLEMENTED }))
}
