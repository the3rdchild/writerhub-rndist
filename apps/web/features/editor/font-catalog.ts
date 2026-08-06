/**
 * Daftar jenis huruf yang bisa dipilih untuk badan dokumen.
 *
 * Sengaja dipisah dari `fonts.ts` yang memuat berkasnya: pemuatan itu lewat
 * `next/font/google` dan hanya bisa dibaca kompilator Next, sementara daftar
 * ini juga dipakai pengurai DOCX yang jalan di luar Next (uji `bun test`).
 *
 * Font web ditulis sebagai `var(--font-x)`, bukan namanya, meski namanya juga
 * dikenali peramban. Variabel itu berisi sepasang nama - `"Lora", "Lora
 * Fallback"` - dan yang kedua adalah font sistem yang metriknya sudah
 * disetarakan next/font. Menyebut "Lora" saja berarti kehilangan pasangan itu:
 * naskah tersusun dengan huruf cadangan seadanya lebih dulu, lalu bergeser
 * begitu berkasnya tiba. Variabelnya juga satu-satunya nama yang dijanjikan
 * next/font; nama font cadangan itu urusan dalamnya sendiri.
 */

export type FontCategory = 'sans' | 'serif' | 'mono' | 'display'

export interface FontFamilyOption {
	/** Nilai `font-family` yang ditulis ke dalam naskah. */
	value: string
	label: string
	category: FontCategory
}

export const FONT_CATEGORY_LABELS: Record<FontCategory, string> = {
	sans: 'Sans-serif',
	serif: 'Serif',
	mono: 'Monospace',
	display: 'Dekoratif',
}

/**
 * Huruf badan dokumen - sama dengan yang dipasang `globals.css`. Dipakai
 * toolbar sebagai nilai yang ditampilkan selama teks belum diberi jenis huruf
 * sendiri, supaya kotaknya menyebut huruf yang benar-benar terlihat di layar.
 */
export const DEFAULT_FONT_FAMILY = 'var(--font-document), serif'

/**
 * Urut menurut abjad di dalam golongannya, bukan menurut selera: yang mencari
 * font sudah tahu namanya, dan daftar sepanjang ini hanya bisa ditelusuri
 * kalau letaknya bisa ditebak.
 */
export const FONT_FAMILIES: readonly FontFamilyOption[] = [
	{ label: 'Arial', value: 'Arial, Helvetica, sans-serif', category: 'sans' },
	{ label: 'Inter', value: 'var(--font-ui), sans-serif', category: 'sans' },
	{ label: 'Lato', value: 'var(--font-lato), sans-serif', category: 'sans' },
	{ label: 'Lexend', value: 'var(--font-lexend), sans-serif', category: 'sans' },
	{ label: 'Montserrat', value: 'var(--font-montserrat), sans-serif', category: 'sans' },
	{ label: 'Nunito', value: 'var(--font-nunito), sans-serif', category: 'sans' },
	{ label: 'Open Sans', value: 'var(--font-open-sans), sans-serif', category: 'sans' },
	{ label: 'Oswald', value: 'var(--font-oswald), sans-serif', category: 'sans' },
	{ label: 'Poppins', value: 'var(--font-poppins), sans-serif', category: 'sans' },
	{ label: 'Raleway', value: 'var(--font-raleway), sans-serif', category: 'sans' },
	{ label: 'Roboto', value: 'var(--font-roboto), sans-serif', category: 'sans' },
	{ label: 'Verdana', value: 'Verdana, Geneva, sans-serif', category: 'sans' },

	{ label: 'EB Garamond', value: 'var(--font-eb-garamond), serif', category: 'serif' },
	{ label: 'Georgia', value: 'Georgia, serif', category: 'serif' },
	{ label: 'Libre Baskerville', value: 'var(--font-libre-baskerville), serif', category: 'serif' },
	{ label: 'Lora', value: 'var(--font-lora), serif', category: 'serif' },
	{ label: 'Merriweather', value: 'var(--font-merriweather), serif', category: 'serif' },
	{ label: 'Playfair Display', value: 'var(--font-playfair-display), serif', category: 'serif' },
	{ label: 'Roboto Slab', value: 'var(--font-roboto-slab), serif', category: 'serif' },
	{ label: 'Source Serif 4', value: DEFAULT_FONT_FAMILY, category: 'serif' },
	{ label: 'Spectral', value: 'var(--font-spectral), serif', category: 'serif' },
	{ label: 'Times New Roman', value: '"Times New Roman", Times, serif', category: 'serif' },

	{ label: 'Courier New', value: '"Courier New", Courier, monospace', category: 'mono' },
	{ label: 'JetBrains Mono', value: 'var(--font-jetbrains-mono), monospace', category: 'mono' },
	{ label: 'Roboto Mono', value: 'var(--font-roboto-mono), monospace', category: 'mono' },

	{ label: 'Caveat', value: 'var(--font-caveat), cursive', category: 'display' },
	{ label: 'Lobster', value: 'var(--font-lobster), cursive', category: 'display' },
	{ label: 'Pacifico', value: 'var(--font-pacifico), cursive', category: 'display' },
]

/** Hanya font yang berkasnya kita muat sendiri - sisanya milik sistem pembaca. */
const WEBFONT_BY_NAME = new Map(
	FONT_FAMILIES.filter((font) => font.value.startsWith('var(')).map((font) => [
		font.label.toLowerCase(),
		font.value,
	]),
)

/**
 * Nama font dari dokumen luar ke nilai CSS kita.
 *
 * Naskah Word yang meminta "Lora" sebenarnya sudah akan tampil benar, tapi
 * lewat nama telanjang: tanpa cadangan bermetrik yang disebut di atas, dan
 * tanpa cocok dengan satu pun isi katalog - hingga toolbar tidak bisa menyebut
 * huruf apa yang sedang dipakai. Font yang tidak kita muat sengaja tidak
 * dijawab; untuk itu penebakan cadangan di `toFontStack` sudah cukup.
 */
export function webfontFamily(name: string): string | undefined {
	return WEBFONT_BY_NAME.get(name.trim().toLowerCase())
}

/**
 * Label untuk sebuah nilai `font-family`. Naskah impor kerap memakai huruf yang
 * tidak ada di daftar; menampilkan tumpukan CSS mentahnya di toolbar tidak
 * memberi tahu apa pun, jadi yang ditampilkan nama huruf pertamanya.
 */
export function fontFamilyLabel(value: string): string {
	const known = FONT_FAMILIES.find((font) => font.value === value)
	if (known) return known.label

	const first = value.split(',')[0]?.trim() ?? ''
	return first.replace(/^["']|["']$/g, '') || value
}
