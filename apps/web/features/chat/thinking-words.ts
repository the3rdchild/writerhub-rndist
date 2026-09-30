/** Label fase berpikir yang tersimpan di langkah; riwayat tetap membacanya begini. */
export const THINKING_LABEL = 'Thinking…'

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
	'Berpikir…',
	'Calculating…',
	'Coalescing…',
	'Cogitating…',
	'Grübeln…',
	'Réfléchir…',
	'Computing…',
	'Conjuring…',
	'Drafting…',
	'正在想……',
	'Cogito ergo sum…',
	'Big brain time…',
	'考え中…',
	'Buffering…',
	'-··· · ·-· ·--· ·· -·- ·· ·-·',
	'02 05 18 16 11 09 18 ...',
	'喵喵喵喵...',
	'熊猫头',
	'Blaming the deadline…',
	'Doing my own research…',
	'Flibbertigibbeting…',
	'Discombobulating…',
	'Bamboozling…',
	'Hubing...',
	'Hullabalooing…',
	'Kerfuffling…',
	'Sharpening pencils…',
	'Inking the quill…',
	'Cooking…',
	'Touching grass (mentally)…',
	'Reticulating splines…',
	'Writing…',
] as const

/** Jeda antarkata; cukup lama untuk dibaca, cukup cepat untuk terasa hidup. */
export const THINKING_WORD_INTERVAL_MS = 2800

/** Kata acak berikutnya, tidak pernah sama dengan yang sedang tampil. */
export function nextThinkingWord(current?: string, random: () => number = Math.random): string {
	const pool = current ? THINKING_WORDS.filter((word) => word !== current) : THINKING_WORDS
	return pool[Math.floor(random() * pool.length)]
}
