import {
	Caveat,
	EB_Garamond,
	Inter,
	JetBrains_Mono,
	Lato,
	Lexend,
	Libre_Baskerville,
	Lobster,
	Lora,
	Merriweather,
	Montserrat,
	Nunito,
	Open_Sans,
	Oswald,
	Pacifico,
	Playfair_Display,
	Poppins,
	Raleway,
	Roboto,
	Roboto_Mono,
	Roboto_Slab,
	Source_Serif_4,
	Spectral,
} from 'next/font/google'

/**
 * Pemuatan berkas font.
 *
 * Semuanya lewat `next/font/google`, yang mengunduh dan menyajikan fontnya dari
 * domain kita sendiri saat build - tidak ada permintaan ke fonts.googleapis.com
 * dari peramban pembaca, jadi editor tetap utuh di jaringan tertutup dan tidak
 * membocorkan siapa yang sedang membuka dokumen.
 *
 * Nama pilihan dan nilai CSS-nya ada di `font-catalog.ts`; berkas ini hanya
 * memuat. Nama variabel di bawah harus sama persis dengan yang disebut katalog.
 *
 * Tiap font wajib jadi `const` tersendiri di lingkup modul - itu syarat
 * next/font, yang membaca panggilannya saat kompilasi, bukan saat jalan.
 */

/** Antarmuka: sidebar, panel, toolbar. */
const ui = Inter({
	subsets: ['latin'],
	variable: '--font-ui',
	weight: ['400', '500', '600', '700'],
})

/**
 * Badan dokumen. Serif dengan tinggi-x besar dan italic sungguhan - dirancang
 * untuk teks panjang, sehingga draf terbaca seperti naskah akademik alih-alih
 * seperti isian formulir.
 */
const document = Source_Serif_4({
	subsets: ['latin'],
	variable: '--font-document',
	weight: ['400', '600', '700'],
	style: ['normal', 'italic'],
})

/*
 * Huruf pilihan untuk isi dokumen.
 *
 * `preload: false` di semuanya, dan itu bukan penghematan kecil: memuat awal
 * dua puluh keluarga huruf berarti mengunduh berkas untuk font yang mungkin
 * tidak dipakai satu pun di naskah yang sedang dibuka. Yang terunduh hanya yang
 * benar-benar dipakai teks di layar - deklarasinya sendiri tidak berbiaya.
 *
 * Berat huruf dibiarkan kosong bila keluarganya punya versi variable: satu
 * berkas itu sudah mencakup tebal dan biasa sekaligus. Beberapa keluarga -
 * Lexend, Oswald, Roboto Slab, Caveat, Lobster, Pacifico - memang tidak punya
 * italic di Google Fonts; miringnya nanti dibuatkan peramban.
 */

const lato = Lato({
	subsets: ['latin'],
	variable: '--font-lato',
	weight: ['400', '700'],
	style: ['normal', 'italic'],
	preload: false,
})
const lexend = Lexend({ subsets: ['latin'], variable: '--font-lexend', preload: false })
const montserrat = Montserrat({
	subsets: ['latin'],
	variable: '--font-montserrat',
	style: ['normal', 'italic'],
	preload: false,
})
const nunito = Nunito({
	subsets: ['latin'],
	variable: '--font-nunito',
	style: ['normal', 'italic'],
	preload: false,
})
const openSans = Open_Sans({
	subsets: ['latin'],
	variable: '--font-open-sans',
	style: ['normal', 'italic'],
	preload: false,
})
const oswald = Oswald({ subsets: ['latin'], variable: '--font-oswald', preload: false })
const poppins = Poppins({
	subsets: ['latin'],
	variable: '--font-poppins',
	weight: ['400', '700'],
	style: ['normal', 'italic'],
	preload: false,
})
const raleway = Raleway({
	subsets: ['latin'],
	variable: '--font-raleway',
	style: ['normal', 'italic'],
	preload: false,
})
const roboto = Roboto({
	subsets: ['latin'],
	variable: '--font-roboto',
	style: ['normal', 'italic'],
	preload: false,
})

const ebGaramond = EB_Garamond({
	subsets: ['latin'],
	variable: '--font-eb-garamond',
	style: ['normal', 'italic'],
	preload: false,
})
const libreBaskerville = Libre_Baskerville({
	subsets: ['latin'],
	variable: '--font-libre-baskerville',
	style: ['normal', 'italic'],
	preload: false,
})
const lora = Lora({
	subsets: ['latin'],
	variable: '--font-lora',
	style: ['normal', 'italic'],
	preload: false,
})
const merriweather = Merriweather({
	subsets: ['latin'],
	variable: '--font-merriweather',
	style: ['normal', 'italic'],
	preload: false,
})
const playfairDisplay = Playfair_Display({
	subsets: ['latin'],
	variable: '--font-playfair-display',
	style: ['normal', 'italic'],
	preload: false,
})
const robotoSlab = Roboto_Slab({
	subsets: ['latin'],
	variable: '--font-roboto-slab',
	preload: false,
})
const spectral = Spectral({
	subsets: ['latin'],
	variable: '--font-spectral',
	weight: ['400', '700'],
	style: ['normal', 'italic'],
	preload: false,
})

const jetbrainsMono = JetBrains_Mono({
	subsets: ['latin'],
	variable: '--font-jetbrains-mono',
	style: ['normal', 'italic'],
	preload: false,
})
const robotoMono = Roboto_Mono({
	subsets: ['latin'],
	variable: '--font-roboto-mono',
	style: ['normal', 'italic'],
	preload: false,
})

const caveat = Caveat({ subsets: ['latin'], variable: '--font-caveat', preload: false })
const lobster = Lobster({
	subsets: ['latin'],
	variable: '--font-lobster',
	weight: '400',
	preload: false,
})
const pacifico = Pacifico({
	subsets: ['latin'],
	variable: '--font-pacifico',
	weight: '400',
	preload: false,
})

/**
 * Kelas yang mendefinisikan seluruh variabel font. Dipasang di `<html>` supaya
 * `var(--font-x)` di dalam naskah - termasuk yang tersimpan dari sesi lama -
 * selalu punya nilai.
 */
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
