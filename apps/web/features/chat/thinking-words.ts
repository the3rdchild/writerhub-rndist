/** Label fase berpikir yang tersimpan di langkah; riwayat tetap membacanya begini. */
export const THINKING_LABEL = 'Berpikir…'

/**
 * Kata pengganti "Berpikir…" selama langkahnya masih berjalan.
 *
 * Hanya tampilan: langkah yang tersimpan tetap berlabel `THINKING_LABEL`,
 * jadi riwayat obrolan tidak berisi "Cogitating…". Daftarnya pilihan pengguna
 * (29 Sep), menggantikan kata-kata lelucon yang lama.
 */
export const THINKING_WORDS = [
	'Accomplishing…',
	'Actioning…',
	'Actualizing…',
	'Baking…',
	'Brewing…',
	'Calculating…',
	'Cerebrating…',
	'Churning…',
	'Clauding…',
	'Coalescing…',
	'Cogitating…',
	'Computing…',
	'Conjuring…',
] as const

/** Jeda antarkata; cukup lama untuk dibaca, cukup cepat untuk terasa hidup. */
export const THINKING_WORD_INTERVAL_MS = 2800

/** Kata acak berikutnya, tidak pernah sama dengan yang sedang tampil. */
export function nextThinkingWord(current?: string, random: () => number = Math.random): string {
	const pool = current ? THINKING_WORDS.filter((word) => word !== current) : THINKING_WORDS
	return pool[Math.floor(random() * pool.length)]
}
