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
const ui = Inter({
	subsets: ['latin'],
	variable: '--font-ui',
	weight: ['400', '500', '600', '700'],
})
const document = Source_Serif_4({
	subsets: ['latin'],
	variable: '--font-document',
	weight: ['400', '600', '700'],
	style: ['normal', 'italic'],
})
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
