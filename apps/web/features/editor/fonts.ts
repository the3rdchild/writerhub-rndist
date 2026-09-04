import localFont from 'next/font/local'

/**
 * Font disajikan dari repo, bukan lewat `next/font/google`.
 *
 * `next/font/google` mengunduh setiap berkas font saat kompilasi. Dengan 23
 * keluarga di sini - dan Google menyertakan semua subset (cyrillic, greek,
 * vietnamese, dan seterusnya) terlepas dari opsi `subsets`, karena opsi itu
 * hanya mengatur preload - satu kompilasi dingin menembakkan ~290 permintaan
 * serentak ke fonts.gstatic.com. Sebagian gagal, dan Turbopack menyimpan
 * kegagalan itu di cache-nya, jadi build patah permanen dengan
 *
 *     Module not found: Can't resolve '@vercel/turbopack-next/internal/font/google/font'
 *
 * sampai `.next` dihapus. Tidak ada opsi retry atau pembatas konkurensi yang
 * bisa disetel untuk itu.
 *
 * Berkas woff2 subset `latin` kini tersimpan di `apps/web/assets/fonts/`, jadi
 * build tidak menyentuh jaringan sama sekali - di mesin pengembang, di image
 * Docker, maupun di CI. Perbarui dengan `bun run apps/web/scripts/download-fonts.ts`
 * setelah mengubah daftar font; skrip itu juga yang mencetak entri `src` di
 * bawah ini.
 *
 * Keluarga variable font cukup satu berkas per gaya: rentang `weight` di
 * bawah menyatakan seluruh rentang yang didukung berkasnya.
 */

const ui = localFont({
	src: [{ path: '../../assets/fonts/inter-normal-100-900.woff2', weight: '100 900', style: 'normal' }],
	variable: '--font-ui',
})

const document = localFont({
	src: [
		{ path: '../../assets/fonts/source-serif-4-normal-200-900.woff2', weight: '200 900', style: 'normal' },
		{ path: '../../assets/fonts/source-serif-4-italic-200-900.woff2', weight: '200 900', style: 'italic' },
	],
	variable: '--font-document',
	adjustFontFallback: 'Times New Roman',
})

const lato = localFont({
	src: [
		{ path: '../../assets/fonts/lato-normal-400.woff2', weight: '400', style: 'normal' },
		{ path: '../../assets/fonts/lato-normal-700.woff2', weight: '700', style: 'normal' },
		{ path: '../../assets/fonts/lato-italic-400.woff2', weight: '400', style: 'italic' },
		{ path: '../../assets/fonts/lato-italic-700.woff2', weight: '700', style: 'italic' },
	],
	variable: '--font-lato',
	preload: false,
})

const lexend = localFont({
	src: [{ path: '../../assets/fonts/lexend-normal-100-900.woff2', weight: '100 900', style: 'normal' }],
	variable: '--font-lexend',
	preload: false,
})

const montserrat = localFont({
	src: [
		{ path: '../../assets/fonts/montserrat-normal-100-900.woff2', weight: '100 900', style: 'normal' },
		{ path: '../../assets/fonts/montserrat-italic-100-900.woff2', weight: '100 900', style: 'italic' },
	],
	variable: '--font-montserrat',
	preload: false,
})

const nunito = localFont({
	src: [
		{ path: '../../assets/fonts/nunito-normal-200-1000.woff2', weight: '200 1000', style: 'normal' },
		{ path: '../../assets/fonts/nunito-italic-200-1000.woff2', weight: '200 1000', style: 'italic' },
	],
	variable: '--font-nunito',
	preload: false,
})

const openSans = localFont({
	src: [
		{ path: '../../assets/fonts/open-sans-normal-300-800.woff2', weight: '300 800', style: 'normal' },
		{ path: '../../assets/fonts/open-sans-italic-300-800.woff2', weight: '300 800', style: 'italic' },
	],
	variable: '--font-open-sans',
	preload: false,
})

const oswald = localFont({
	src: [{ path: '../../assets/fonts/oswald-normal-200-700.woff2', weight: '200 700', style: 'normal' }],
	variable: '--font-oswald',
	preload: false,
})

const poppins = localFont({
	src: [
		{ path: '../../assets/fonts/poppins-normal-400.woff2', weight: '400', style: 'normal' },
		{ path: '../../assets/fonts/poppins-normal-700.woff2', weight: '700', style: 'normal' },
		{ path: '../../assets/fonts/poppins-italic-400.woff2', weight: '400', style: 'italic' },
		{ path: '../../assets/fonts/poppins-italic-700.woff2', weight: '700', style: 'italic' },
	],
	variable: '--font-poppins',
	preload: false,
})

const raleway = localFont({
	src: [
		{ path: '../../assets/fonts/raleway-normal-100-900.woff2', weight: '100 900', style: 'normal' },
		{ path: '../../assets/fonts/raleway-italic-100-900.woff2', weight: '100 900', style: 'italic' },
	],
	variable: '--font-raleway',
	preload: false,
})

const roboto = localFont({
	src: [
		{ path: '../../assets/fonts/roboto-normal-100-900.woff2', weight: '100 900', style: 'normal' },
		{ path: '../../assets/fonts/roboto-italic-100-900.woff2', weight: '100 900', style: 'italic' },
	],
	variable: '--font-roboto',
	preload: false,
})

const ebGaramond = localFont({
	src: [
		{ path: '../../assets/fonts/eb-garamond-normal-400-800.woff2', weight: '400 800', style: 'normal' },
		{ path: '../../assets/fonts/eb-garamond-italic-400-800.woff2', weight: '400 800', style: 'italic' },
	],
	variable: '--font-eb-garamond',
	preload: false,
	adjustFontFallback: 'Times New Roman',
})

const libreBaskerville = localFont({
	src: [
		{
			path: '../../assets/fonts/libre-baskerville-normal-400-700.woff2',
			weight: '400 700',
			style: 'normal',
		},
		{
			path: '../../assets/fonts/libre-baskerville-italic-400-700.woff2',
			weight: '400 700',
			style: 'italic',
		},
	],
	variable: '--font-libre-baskerville',
	preload: false,
	adjustFontFallback: 'Times New Roman',
})

const lora = localFont({
	src: [
		{ path: '../../assets/fonts/lora-normal-400-700.woff2', weight: '400 700', style: 'normal' },
		{ path: '../../assets/fonts/lora-italic-400-700.woff2', weight: '400 700', style: 'italic' },
	],
	variable: '--font-lora',
	preload: false,
	adjustFontFallback: 'Times New Roman',
})

const merriweather = localFont({
	src: [
		{ path: '../../assets/fonts/merriweather-normal-300-900.woff2', weight: '300 900', style: 'normal' },
		{ path: '../../assets/fonts/merriweather-italic-300-900.woff2', weight: '300 900', style: 'italic' },
	],
	variable: '--font-merriweather',
	preload: false,
	adjustFontFallback: 'Times New Roman',
})

const playfairDisplay = localFont({
	src: [
		{
			path: '../../assets/fonts/playfair-display-normal-400-900.woff2',
			weight: '400 900',
			style: 'normal',
		},
		{
			path: '../../assets/fonts/playfair-display-italic-400-900.woff2',
			weight: '400 900',
			style: 'italic',
		},
	],
	variable: '--font-playfair-display',
	preload: false,
	adjustFontFallback: 'Times New Roman',
})

const robotoSlab = localFont({
	src: [{ path: '../../assets/fonts/roboto-slab-normal-100-900.woff2', weight: '100 900', style: 'normal' }],
	variable: '--font-roboto-slab',
	preload: false,
	adjustFontFallback: 'Times New Roman',
})

const spectral = localFont({
	src: [
		{ path: '../../assets/fonts/spectral-normal-400.woff2', weight: '400', style: 'normal' },
		{ path: '../../assets/fonts/spectral-normal-700.woff2', weight: '700', style: 'normal' },
		{ path: '../../assets/fonts/spectral-italic-400.woff2', weight: '400', style: 'italic' },
		{ path: '../../assets/fonts/spectral-italic-700.woff2', weight: '700', style: 'italic' },
	],
	variable: '--font-spectral',
	preload: false,
	adjustFontFallback: 'Times New Roman',
})

const jetbrainsMono = localFont({
	src: [
		{ path: '../../assets/fonts/jetbrains-mono-normal-100-800.woff2', weight: '100 800', style: 'normal' },
		{ path: '../../assets/fonts/jetbrains-mono-italic-100-800.woff2', weight: '100 800', style: 'italic' },
	],
	variable: '--font-jetbrains-mono',
	preload: false,
})

const robotoMono = localFont({
	src: [
		{ path: '../../assets/fonts/roboto-mono-normal-100-700.woff2', weight: '100 700', style: 'normal' },
		{ path: '../../assets/fonts/roboto-mono-italic-100-700.woff2', weight: '100 700', style: 'italic' },
	],
	variable: '--font-roboto-mono',
	preload: false,
})

const caveat = localFont({
	src: [{ path: '../../assets/fonts/caveat-normal-400-700.woff2', weight: '400 700', style: 'normal' }],
	variable: '--font-caveat',
	preload: false,
})

const lobster = localFont({
	src: [{ path: '../../assets/fonts/lobster-normal-400.woff2', weight: '400', style: 'normal' }],
	variable: '--font-lobster',
	preload: false,
})

const pacifico = localFont({
	src: [{ path: '../../assets/fonts/pacifico-normal-400.woff2', weight: '400', style: 'normal' }],
	variable: '--font-pacifico',
	preload: false,
})

export const FONT_VARIABLES = [
	ui,
	document,
	lato,
	lexend,
	montserrat,
	nunito,
	openSans,
	oswald,
	poppins,
	raleway,
	roboto,
	ebGaramond,
	libreBaskerville,
	lora,
	merriweather,
	playfairDisplay,
	robotoSlab,
	spectral,
	jetbrainsMono,
	robotoMono,
	caveat,
	lobster,
	pacifico,
]
	.map((font) => font.variable)
	.join(' ')
