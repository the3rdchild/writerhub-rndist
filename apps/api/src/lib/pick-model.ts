import { DEFAULT_CHAT_MODEL, isKnownChatModel } from '@writer-hub/shared'

/**
 * Model mana yang benar-benar dipakai untuk satu permintaan.
 *
 * Pilihan pemanggil hanya dihormati kalau ia model yang kami kenal DAN
 * sambungannya memang bisa mengarahkan per permintaan. Di luar OpenRouter,
 * `baseUrl` menunjuk ke satu penyebaran dengan satu model; mengirim nama lain
 * ke sana bukan berarti mendapat model itu, melainkan galat - atau lebih buruk,
 * model yang sama dengan tagihan yang salah.
 *
 * `DEFAULT_CHAT_MODEL` adalah string kosong: ia berarti "ikut bawaan", bukan
 * nama model, jadi ia jatuh ke `fallback` seperti permintaan tanpa pilihan.
 *
 * Ada di lib dan bukan di dalam service obrolan karena jalur draf memerlukan
 * aturan yang sama persis: dua tempat yang memutuskan model dengan cara berbeda
 * berarti pengguna mendapat model berbeda tergantung pintu mana yang ia masuki.
 */
export function pickModel(requested: string | undefined, fallback: string, baseUrl: string): string {
	if (!requested || !isKnownChatModel(requested) || requested === DEFAULT_CHAT_MODEL) return fallback

	return baseUrl.includes('openrouter.ai') ? requested : fallback
}
