export interface DetectedLanguage {
	code: string
	label: string
	confident: boolean
}
export const LANGUAGE_OPTIONS: ReadonlyArray<{ code: string; label: string; flag: string }> = [
	{ code: 'en', label: 'English', flag: 'us' },
	{ code: 'id', label: 'Bahasa Indonesia', flag: 'id' },
	{ code: 'ms', label: 'Bahasa Melayu', flag: 'my' },
	{ code: 'es', label: 'Español', flag: 'es' },
	{ code: 'pt', label: 'Português', flag: 'br' },
	{ code: 'fr', label: 'Français', flag: 'fr' },
	{ code: 'de', label: 'Deutsch', flag: 'de' },
	{ code: 'it', label: 'Italiano', flag: 'it' },
	{ code: 'nl', label: 'Nederlands', flag: 'nl' },
	{ code: 'tr', label: 'Türkçe', flag: 'tr' },
	{ code: 'vi', label: 'Tiếng Việt', flag: 'vn' },
	{ code: 'ja', label: '日本語', flag: 'jp' },
	{ code: 'ko', label: '한국어', flag: 'kr' },
	{ code: 'zh', label: '中文', flag: 'cn' },
	{ code: 'ar', label: 'العربية', flag: 'sa' },
	{ code: 'ru', label: 'Русский', flag: 'ru' },
]

const LABELS = new Map(LANGUAGE_OPTIONS.map((option) => [option.code, option.label]))

export function languageLabel(code: string): string {
	return LABELS.get(code) ?? code.toUpperCase()
}
const SCRIPTS: ReadonlyArray<{ code: string; pattern: RegExp }> = [
	{ code: 'ko', pattern: /[가-힯]/ },
	{ code: 'ja', pattern: /[぀-ヿ]/ },
	{ code: 'zh', pattern: /[一-鿿]/ },
	{ code: 'ar', pattern: /[؀-ۿ]/ },
	{ code: 'ru', pattern: /[Ѐ-ӿ]/ },
	{ code: 'th', pattern: /[฀-๿]/ },
]
const STOPWORDS: Readonly<Record<string, readonly string[]>> = {
	en: ['the', 'and', 'of', 'to', 'is', 'in', 'that', 'for', 'with', 'this', 'are', 'was', 'be', 'it'],
	id: [
		'yang',
		'dan',
		'untuk',
		'dengan',
		'pada',
		'tidak',
		'ini',
		'dari',
		'akan',
		'adalah',
		'dalam',
		'atau',
		'juga',
		'bisa',
	],
	ms: [
		'yang',
		'dan',
		'untuk',
		'dengan',
		'tidak',
		'ini',
		'dari',
		'akan',
		'adalah',
		'dalam',
		'boleh',
		'kerana',
	],
	es: ['que', 'de', 'la', 'el', 'en', 'los', 'para', 'con', 'una', 'por', 'como', 'las'],
	pt: ['que', 'de', 'para', 'com', 'uma', 'por', 'como', 'mais', 'dos', 'nao', 'ser'],
	fr: ['que', 'de', 'le', 'la', 'les', 'des', 'pour', 'avec', 'une', 'dans', 'est', 'sur'],
	de: ['der', 'die', 'das', 'und', 'ist', 'nicht', 'mit', 'den', 'ein', 'eine', 'auf', 'sich'],
	it: ['che', 'di', 'il', 'la', 'per', 'con', 'una', 'del', 'sono', 'non', 'nel'],
	nl: ['de', 'het', 'een', 'van', 'niet', 'met', 'voor', 'dat', 'zijn', 'op'],
	tr: ['bir', 'için', 'bu', 'daha', 'olarak', 'ile', 'çok', 'ancak'],
	vi: ['của', 'và', 'là', 'không', 'được', 'trong', 'người', 'những'],
}
const STOPWORD_SETS = Object.entries(STOPWORDS).map(([code, words]) => [code, new Set(words)] as const)
const MIN_WORDS = 12
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
export function requiresAiTier(code: string): boolean {
	return code !== 'en'
}
