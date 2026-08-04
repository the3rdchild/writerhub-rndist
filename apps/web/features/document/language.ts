/**
 * Menebak bahasa naskah.
 *
 * Tujuannya bukan mengalahkan pustaka deteksi bahasa, melainkan menjawab satu
 * pertanyaan dengan andal: naskah ini bahasa apa, supaya AI diminta menjawab
 * dalam bahasa itu alih-alih hanyut ke bahasa prompt-nya. Untuk itu, membedakan
 * Inggris dari bukan-Inggris jauh lebih penting daripada membedakan Portugis
 * dari Spanyol — kalau pun keliru di antara keduanya, model tetap menerima nama
 * bahasa yang masuk akal dan hasilnya tidak berpindah bahasa.
 *
 * Tebakannya bisa ditimpa pengguna, jadi kekeliruan tidak pernah jadi jalan
 * buntu.
 */

export interface DetectedLanguage {
	/** Kode BCP-47 pendek, mis. "id". */
	code: string
	label: string
	/**
	 * False kalau naskahnya terlalu pendek atau tidak ada penanda yang menonjol.
	 * UI memakainya untuk menyarankan pengguna memilih sendiri.
	 */
	confident: boolean
}

/** Pilihan pada penukar bahasa; `null` berarti ikut hasil deteksi. */
export const LANGUAGE_OPTIONS: ReadonlyArray<{ code: string; label: string }> = [
	{ code: 'en', label: 'English' },
	{ code: 'id', label: 'Bahasa Indonesia' },
	{ code: 'ms', label: 'Bahasa Melayu' },
	{ code: 'es', label: 'Español' },
	{ code: 'pt', label: 'Português' },
	{ code: 'fr', label: 'Français' },
	{ code: 'de', label: 'Deutsch' },
	{ code: 'it', label: 'Italiano' },
	{ code: 'nl', label: 'Nederlands' },
	{ code: 'tr', label: 'Türkçe' },
	{ code: 'vi', label: 'Tiếng Việt' },
	{ code: 'ja', label: '日本語' },
	{ code: 'ko', label: '한국어' },
	{ code: 'zh', label: '中文' },
	{ code: 'ar', label: 'العربية' },
	{ code: 'ru', label: 'Русский' },
]

const LABELS = new Map(LANGUAGE_OPTIONS.map((option) => [option.code, option.label]))

export function languageLabel(code: string): string {
	return LABELS.get(code) ?? code.toUpperCase()
}

/**
 * Aksara yang menentukan bahasanya sendiri.
 *
 * Diperiksa lebih dulu karena jauh lebih pasti daripada hitung-hitungan kata:
 * naskah beraksara Hangul tidak mungkin bahasa Inggris.
 */
const SCRIPTS: ReadonlyArray<{ code: string; pattern: RegExp }> = [
	{ code: 'ko', pattern: /[가-힯]/ },
	{ code: 'ja', pattern: /[぀-ヿ]/ },
	// Han diperiksa setelah kana: teks Jepang memakai kanji juga.
	{ code: 'zh', pattern: /[一-鿿]/ },
	{ code: 'ar', pattern: /[؀-ۿ]/ },
	{ code: 'ru', pattern: /[Ѐ-ӿ]/ },
	{ code: 'th', pattern: /[฀-๿]/ },
]

/**
 * Kata fungsi per bahasa — kata yang sering muncul dan jarang dipinjam bahasa
 * lain. Sengaja pendek: menambah kata umum lintas-bahasa justru mengaburkan
 * bedanya.
 */
const STOPWORDS: Readonly<Record<string, readonly string[]>> = {
	en: ['the', 'and', 'of', 'to', 'is', 'in', 'that', 'for', 'with', 'this', 'are', 'was', 'be', 'it'],
	id: ['yang', 'dan', 'untuk', 'dengan', 'pada', 'tidak', 'ini', 'dari', 'akan', 'adalah', 'dalam', 'atau', 'juga', 'bisa'],
	ms: ['yang', 'dan', 'untuk', 'dengan', 'tidak', 'ini', 'dari', 'akan', 'adalah', 'dalam', 'boleh', 'kerana'],
	es: ['que', 'de', 'la', 'el', 'en', 'los', 'para', 'con', 'una', 'por', 'como', 'las'],
	pt: ['que', 'de', 'para', 'com', 'uma', 'por', 'como', 'mais', 'dos', 'nao', 'ser'],
	fr: ['que', 'de', 'le', 'la', 'les', 'des', 'pour', 'avec', 'une', 'dans', 'est', 'sur'],
	de: ['der', 'die', 'das', 'und', 'ist', 'nicht', 'mit', 'den', 'ein', 'eine', 'auf', 'sich'],
	it: ['che', 'di', 'il', 'la', 'per', 'con', 'una', 'del', 'sono', 'non', 'nel'],
	nl: ['de', 'het', 'een', 'van', 'niet', 'met', 'voor', 'dat', 'zijn', 'op'],
	tr: ['bir', 'için', 'bu', 'daha', 'olarak', 'ile', 'çok', 'ancak'],
	vi: ['của', 'và', 'là', 'không', 'được', 'trong', 'người', 'những'],
}

// Dicocokkan lewat Set: pencarian ini berjalan untuk tiap kata dikali tiap
// bahasa, dan pemindaian larik di dalam dua perulangan itu terasa mahal.
const STOPWORD_SETS = Object.entries(STOPWORDS).map(
	([code, words]) => [code, new Set(words)] as const,
)

/** Naskah lebih pendek dari ini terlalu sedikit buktinya untuk ditebak. */
const MIN_WORDS = 12
/** Selisih minimum agar pemenang dianggap meyakinkan, bukan menang tipis. */
const MIN_LEAD = 2

const DEFAULT: DetectedLanguage = { code: 'en', label: 'English', confident: false }

export function detectLanguage(text: string): DetectedLanguage {
	const sample = text.slice(0, 20_000)

	for (const { code, pattern } of SCRIPTS) {
		if (pattern.test(sample)) {
			return { code, label: languageLabel(code), confident: true }
		}
	}

	const words = sample.toLowerCase().match(/[\p{L}']+/gu) ?? []
	if (words.length < MIN_WORDS) return DEFAULT

	const counts = new Map<string, number>()
	for (const word of words) {
		for (const [code, set] of STOPWORD_SETS) {
			if (set.has(word)) counts.set(code, (counts.get(code) ?? 0) + 1)
		}
	}

	const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1])
	const [best, runnerUp] = ranked
	if (!best || best[1] === 0) return DEFAULT

	return {
		code: best[0],
		label: languageLabel(best[0]),
		confident: best[1] - (runnerUp?.[1] ?? 0) >= MIN_LEAD,
	}
}

/**
 * Tier `standard` dan `advanced` bekerja di atas model POS dan daftar kata
 * bahasa Inggris, jadi bahasa lain harus lewat tier AI. Ini batas kemampuan
 * pipeline-nya, bukan pilihan produk.
 */
export function requiresAiTier(code: string): boolean {
	return code !== 'en'
}
