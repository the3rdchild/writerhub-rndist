/**
 * Font yang bisa disematkan ke dalam blok rancangan, beserta nadanya.
 *
 * Ada dua alasan daftar ini tinggal di `packages/shared`, dan keduanya sudah
 * pernah menggigit di tempat lain:
 *
 * 1. **Prompt dan penyuntik harus membaca daftar yang sama.** Prompt rancangan
 *    disusun di `apps/api` (`services/drafts/prompt.ts` dan `tools.ts` di sini),
 *    sementara yang benar-benar menyematkan bytes-nya ada di `apps/web`. `apps/api`
 *    tidak bisa mengimpor dari `apps/web`; kalau daftarnya disalin, prompt akan
 *    menawarkan font yang tidak ada penyematnya - dan kegagalannya hanya terlihat
 *    sebagai rancangan yang fontnya diam-diam berbeda.
 * 2. **Nada itu bagian dari daftarnya, bukan hiasan.** Model yang cuma diberi
 *    `system-ui` menghasilkan seluruh rancangan dengan suara yang sama. "Flyer
 *    lomba anak" tidak boleh dijawab Times New Roman, dan "undangan resmi" tidak
 *    boleh dijawab font display. `tone` ada supaya prompt bisa menyebutkan
 *    pilihannya beserta wataknya.
 *
 * Kenapa `data:` URI dan bukan URL: bingkai blok memang bisa dibuka CSP-nya ke
 * origin, tapi **pemotretnya tidak**. `html-raster.ts` merender lewat
 * `<foreignObject>` di dalam SVG yang dimuat sebagai `data:image/svg+xml` - dokumen
 * terisolasi yang tidak memuat apa pun dari jaringan. Font lewat URL karena itu
 * akan benar di layar dan salah di PNG dan DOCX, yaitu kegagalan yang paling sulit
 * dikenali. `data:` URI melayani ketiganya - bingkai, pemotret, dan `printToPDF`.
 */

/** Golongan bentuk; sama dengan yang dipakai pemilih font di toolbar. */
export type FontCategory = 'sans' | 'serif' | 'mono' | 'display'

/**
 * Watak font dalam satu kata.
 *
 * Nilainya bahasa Inggris karena satu-satunya pembacanya adalah prompt, dan
 * seluruh prompt di repo ini berbahasa Inggris. Ia bukan label antarmuka -
 * label untuk manusia ada di `font-catalog.ts` di `apps/web`.
 */
export type FontTone =
	| 'neutral'
	| 'friendly'
	| 'bold'
	| 'elegant'
	| 'formal'
	| 'classic'
	| 'technical'
	| 'playful'

export interface FontFace {
	/** Nama berkas di `apps/web/public/fonts/`. */
	file: string
	/** `400`, atau rentang `100 900` untuk variable font. */
	weight: string
	style: 'normal' | 'italic'
}

export interface EmbeddableFont {
	/** Ditulis apa adanya di `font-family`; ini juga yang disebut model. */
	family: string
	slug: string
	category: FontCategory
	tone: FontTone
	faces: readonly FontFace[]
}

/**
 * Berkasnya disajikan dari `public/`, bukan lewat `next/font/local`.
 *
 * Keduanya menunjuk berkas yang sama di disk - `fonts.ts` mengimpornya dari
 * `../../public/fonts/` - tapi `next/font/local` menghasilkan URL ber-hash yang
 * tidak bisa ditebak saat runtime. Penyuntik butuh jalur yang tetap.
 */
export const FONT_FILE_BASE = '/fonts/'

export const EMBEDDABLE_FONTS: readonly EmbeddableFont[] = [
	{
		family: 'Inter',
		slug: 'inter',
		category: 'sans',
		tone: 'neutral',
		faces: [{ file: 'inter-normal-100-900.woff2', weight: '100 900', style: 'normal' }],
	},
	{
		family: 'Roboto',
		slug: 'roboto',
		category: 'sans',
		tone: 'neutral',
		faces: [
			{ file: 'roboto-normal-100-900.woff2', weight: '100 900', style: 'normal' },
			{ file: 'roboto-italic-100-900.woff2', weight: '100 900', style: 'italic' },
		],
	},
	{
		family: 'Open Sans',
		slug: 'open-sans',
		category: 'sans',
		tone: 'neutral',
		faces: [
			{ file: 'open-sans-normal-300-800.woff2', weight: '300 800', style: 'normal' },
			{ file: 'open-sans-italic-300-800.woff2', weight: '300 800', style: 'italic' },
		],
	},
	{
		family: 'Lato',
		slug: 'lato',
		category: 'sans',
		tone: 'friendly',
		faces: [
			{ file: 'lato-normal-400.woff2', weight: '400', style: 'normal' },
			{ file: 'lato-normal-700.woff2', weight: '700', style: 'normal' },
			{ file: 'lato-italic-400.woff2', weight: '400', style: 'italic' },
			{ file: 'lato-italic-700.woff2', weight: '700', style: 'italic' },
		],
	},
	{
		family: 'Lexend',
		slug: 'lexend',
		category: 'sans',
		tone: 'friendly',
		faces: [{ file: 'lexend-normal-100-900.woff2', weight: '100 900', style: 'normal' }],
	},
	{
		family: 'Nunito',
		slug: 'nunito',
		category: 'sans',
		tone: 'friendly',
		faces: [
			{ file: 'nunito-normal-200-1000.woff2', weight: '200 1000', style: 'normal' },
			{ file: 'nunito-italic-200-1000.woff2', weight: '200 1000', style: 'italic' },
		],
	},
	{
		family: 'Poppins',
		slug: 'poppins',
		category: 'sans',
		tone: 'friendly',
		faces: [
			{ file: 'poppins-normal-400.woff2', weight: '400', style: 'normal' },
			{ file: 'poppins-normal-700.woff2', weight: '700', style: 'normal' },
			{ file: 'poppins-italic-400.woff2', weight: '400', style: 'italic' },
			{ file: 'poppins-italic-700.woff2', weight: '700', style: 'italic' },
		],
	},
	{
		family: 'Montserrat',
		slug: 'montserrat',
		category: 'sans',
		tone: 'bold',
		faces: [
			{ file: 'montserrat-normal-100-900.woff2', weight: '100 900', style: 'normal' },
			{ file: 'montserrat-italic-100-900.woff2', weight: '100 900', style: 'italic' },
		],
	},
	{
		family: 'Oswald',
		slug: 'oswald',
		category: 'sans',
		tone: 'bold',
		faces: [{ file: 'oswald-normal-200-700.woff2', weight: '200 700', style: 'normal' }],
	},
	{
		family: 'Raleway',
		slug: 'raleway',
		category: 'sans',
		tone: 'elegant',
		faces: [
			{ file: 'raleway-normal-100-900.woff2', weight: '100 900', style: 'normal' },
			{ file: 'raleway-italic-100-900.woff2', weight: '100 900', style: 'italic' },
		],
	},
	{
		family: 'Source Serif 4',
		slug: 'source-serif-4',
		category: 'serif',
		tone: 'formal',
		faces: [
			{ file: 'source-serif-4-normal-200-900.woff2', weight: '200 900', style: 'normal' },
			{ file: 'source-serif-4-italic-200-900.woff2', weight: '200 900', style: 'italic' },
		],
	},
	{
		family: 'Spectral',
		slug: 'spectral',
		category: 'serif',
		tone: 'formal',
		faces: [
			{ file: 'spectral-normal-400.woff2', weight: '400', style: 'normal' },
			{ file: 'spectral-normal-700.woff2', weight: '700', style: 'normal' },
			{ file: 'spectral-italic-400.woff2', weight: '400', style: 'italic' },
			{ file: 'spectral-italic-700.woff2', weight: '700', style: 'italic' },
		],
	},
	{
		family: 'EB Garamond',
		slug: 'eb-garamond',
		category: 'serif',
		tone: 'classic',
		faces: [
			{ file: 'eb-garamond-normal-400-800.woff2', weight: '400 800', style: 'normal' },
			{ file: 'eb-garamond-italic-400-800.woff2', weight: '400 800', style: 'italic' },
		],
	},
	{
		family: 'Libre Baskerville',
		slug: 'libre-baskerville',
		category: 'serif',
		tone: 'classic',
		faces: [
			{ file: 'libre-baskerville-normal-400-700.woff2', weight: '400 700', style: 'normal' },
			{ file: 'libre-baskerville-italic-400-700.woff2', weight: '400 700', style: 'italic' },
		],
	},
	{
		family: 'Lora',
		slug: 'lora',
		category: 'serif',
		tone: 'classic',
		faces: [
			{ file: 'lora-normal-400-700.woff2', weight: '400 700', style: 'normal' },
			{ file: 'lora-italic-400-700.woff2', weight: '400 700', style: 'italic' },
		],
	},
	{
		family: 'Merriweather',
		slug: 'merriweather',
		category: 'serif',
		tone: 'classic',
		faces: [
			{ file: 'merriweather-normal-300-900.woff2', weight: '300 900', style: 'normal' },
			{ file: 'merriweather-italic-300-900.woff2', weight: '300 900', style: 'italic' },
		],
	},
	{
		family: 'Playfair Display',
		slug: 'playfair-display',
		category: 'serif',
		tone: 'elegant',
		faces: [
			{ file: 'playfair-display-normal-400-900.woff2', weight: '400 900', style: 'normal' },
			{ file: 'playfair-display-italic-400-900.woff2', weight: '400 900', style: 'italic' },
		],
	},
	{
		family: 'Roboto Slab',
		slug: 'roboto-slab',
		category: 'serif',
		tone: 'bold',
		faces: [{ file: 'roboto-slab-normal-100-900.woff2', weight: '100 900', style: 'normal' }],
	},
	{
		family: 'JetBrains Mono',
		slug: 'jetbrains-mono',
		category: 'mono',
		tone: 'technical',
		faces: [
			{ file: 'jetbrains-mono-normal-100-800.woff2', weight: '100 800', style: 'normal' },
			{ file: 'jetbrains-mono-italic-100-800.woff2', weight: '100 800', style: 'italic' },
		],
	},
	{
		family: 'Roboto Mono',
		slug: 'roboto-mono',
		category: 'mono',
		tone: 'technical',
		faces: [
			{ file: 'roboto-mono-normal-100-700.woff2', weight: '100 700', style: 'normal' },
			{ file: 'roboto-mono-italic-100-700.woff2', weight: '100 700', style: 'italic' },
		],
	},
	{
		family: 'Caveat',
		slug: 'caveat',
		category: 'display',
		tone: 'playful',
		faces: [{ file: 'caveat-normal-400-700.woff2', weight: '400 700', style: 'normal' }],
	},
	{
		family: 'Lobster',
		slug: 'lobster',
		category: 'display',
		tone: 'playful',
		faces: [{ file: 'lobster-normal-400.woff2', weight: '400', style: 'normal' }],
	},
	{
		family: 'Pacifico',
		slug: 'pacifico',
		category: 'display',
		tone: 'playful',
		faces: [{ file: 'pacifico-normal-400.woff2', weight: '400', style: 'normal' }],
	},
]

const BY_FAMILY = new Map(EMBEDDABLE_FONTS.map((font) => [font.family.toLowerCase(), font]))

/** Pencarian tak peka huruf besar-kecil; model tidak selalu menyalin persis. */
export function embeddableFont(family: string): EmbeddableFont | undefined {
	return BY_FAMILY.get(family.trim().toLowerCase())
}

/**
 * Daftar pilihan font untuk prompt rancangan, dikelompokkan menurut nada.
 *
 * Disusun di sini, bukan di masing-masing prompt, supaya `insert_html_block` di
 * AI Chat dan jalur `/drafts` menawarkan pilihan yang persis sama. Dua daftar
 * yang berbeda berarti dua rancangan yang berbeda untuk permintaan yang sama.
 */
export function fontChoicePrompt(): string {
	const byTone = new Map<FontTone, string[]>()
	for (const font of EMBEDDABLE_FONTS) {
		const bucket = byTone.get(font.tone)
		if (bucket) bucket.push(font.family)
		else byTone.set(font.tone, [font.family])
	}

	const groups = [...byTone].map(([tone, families]) => `${tone}: ${families.join(', ')}`).join('; ')

	return [
		'Choose a typeface that fits the tone of the piece, and name it literally in',
		`font-family (for example: font-family: 'Playfair Display', serif). Available - ${groups}.`,
		'Those families are embedded for you; any other name silently falls back to a',
		'system font, so do not invent one and do not write @font-face yourself.',
	].join(' ')
}
