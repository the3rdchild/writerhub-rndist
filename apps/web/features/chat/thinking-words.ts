/** Label fase berpikir yang tersimpan di langkah; riwayat tetap membacanya begini. */
export const THINKING_LABEL = 'Berpikir…'

/**
 * Kata pengganti "Berpikir…" selama langkahnya masih berjalan.
 *
 * Hanya tampilan: langkah yang tersimpan tetap berlabel `THINKING_LABEL`,
 * jadi riwayat obrolan tidak berisi "Kerfuffling…".
 */
export const THINKING_WORDS = [
	'Drafting…',
	'Big brain time…',
	'Buffering…',
	'Blaming the deadline…',
	'Doing my own research…',
	'Flibbertigibbeting…',
	'Discombobulating…',
	'Bamboozling…',
	'Lollygagging…',
	'Dillydallying…',
	'Shenaniganing…',
	'Hullabalooing…',
	'Kerfuffling…',
	'Sharpening pencils…',
	'Inking the quill…',
	'Consulting the thesaurus…',
	'Cooking…',
	'Main character thinking…',
	'Touching grass (mentally)…',
	'Reticulating splines…',
] as const

/** Jeda antarkata; cukup lama untuk dibaca, cukup cepat untuk terasa hidup. */
export const THINKING_WORD_INTERVAL_MS = 2800

/** Kata acak berikutnya, tidak pernah sama dengan yang sedang tampil. */
export function nextThinkingWord(current?: string, random: () => number = Math.random): string {
	const pool = current ? THINKING_WORDS.filter((word) => word !== current) : THINKING_WORDS
	return pool[Math.floor(random() * pool.length)]
}
