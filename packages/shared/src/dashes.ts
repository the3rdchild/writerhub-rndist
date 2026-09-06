/**
 * Penjaga tanda hubir panjang pada keluaran AI.
 *
 * Em dash (—) dan en dash (–) sebagai tanda baca kalimat adalah penanda gaya
 * tulis mesin yang paling mudah dikenali; penulis yang menulis sendiri hampir
 * selalu memakai koma, kurung, atau memecah kalimat. Aturan ini mengganti
 * dash prosa menjadi koma pada balasan chat maupun isi dokumen hasil AI,
 * dengan dua pengecualian yang sengaja dipertahankan:
 *
 * - Rentang angka (2019–2020, halaman 12–15): en dash memang konvensinya,
 *   dan dirapikan tanpa spasi. Em dash pada rentang ikut dinormalkan ke en.
 * - Dash di awal baris: penanda dialog pada naskah naratif. Menggantinya
 *   membuat dialog rusak, jadi dibiarkan apa adanya.
 *
 * Karakter hyphen biasa (-) tidak pernah disentuh; Markdown (daftar, garis
 * tabel, rule) memakainya di mana-mana.
 */

/** Rentang angka: digit, spasi opsional, dash, spasi opsional, digit. */
const NUMBER_RANGE = /(\d)[ \t]*[—–][ \t]*(?=\d)/g

/** Dash prosa: ada karakter non-spasi sebelumnya pada baris yang sama. */
const PROSE_DASH = /([^\n\s])[ \t]*[—–][ \t]*/g

/*
 * Rentang dan prosa tidak bisa dibersihkan dua replace berurutan: hasil
 * normalisasi rentang (2019–2020) berbentuk persis seperti dash prosa yang
 * menempel di digit, jadi pass kedua akan merusaknya. Rentang disembunyikan
 * dulu ke area pemakaian pribadi Unicode, yang mustahil muncul dari model.
 */
const RANGE_TOKEN = '\uE000'
const RANGE_STORE: string[] = []

export function sanitizeAIDashes(text: string): string {
	RANGE_STORE.length = 0
	const hidden = text.replace(NUMBER_RANGE, (_match, digit: string) => {
		RANGE_STORE.push(`${digit}–`)
		return `${RANGE_TOKEN}${RANGE_STORE.length - 1}${RANGE_TOKEN}`
	})
	const cleaned = hidden.replace(PROSE_DASH, '$1, ')
	return cleaned.replace(
		new RegExp(`${RANGE_TOKEN}(\\d+)${RANGE_TOKEN}`, 'g'),
		(_m, index: string) => RANGE_STORE[Number(index)] ?? '',
	)
}

/**
 * Varian untuk argumen tool call: JSON tiba sebagai untai mentah dari
 * provider, dan tanda — hanya mungkin berada di dalam nilai string (struktur
 * JSON sepenuhnya ASCII), jadi pembersihan rekursif per nilai string membuat
 * seluruh untai tetap utuh secara struktural. Untai yang gagal diurai
 * dibersihkan mentah - masih aman oleh alasan yang sama.
 */
export function sanitizeToolArguments(raw: string): string {
	try {
		return JSON.stringify(sanitizeJsonStrings(JSON.parse(raw)))
	} catch {
		return sanitizeAIDashes(raw)
	}
}

function sanitizeJsonStrings(value: unknown): unknown {
	if (typeof value === 'string') return sanitizeAIDashes(value)
	if (Array.isArray(value)) return value.map(sanitizeJsonStrings)
	if (value && typeof value === 'object') {
		return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, sanitizeJsonStrings(item)]))
	}
	return value
}
