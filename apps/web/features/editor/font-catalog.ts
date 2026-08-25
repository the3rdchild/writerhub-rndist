export type FontCategory = 'sans' | 'serif' | 'mono' | 'display'

export interface FontFamilyOption {
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
export const DEFAULT_FONT_FAMILY = 'var(--font-document), serif'
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
const WEBFONT_BY_NAME = new Map(
	FONT_FAMILIES.filter((font) => font.value.startsWith('var(')).map((font) => [
		font.label.toLowerCase(),
		font.value,
	]),
)
export function webfontFamily(name: string): string | undefined {
	return WEBFONT_BY_NAME.get(name.trim().toLowerCase())
}
export function fontFamilyLabel(value: string): string {
	const known = FONT_FAMILIES.find((font) => font.value === value)
	if (known) return known.label

	const first = value.split(',')[0]?.trim() ?? ''
	return first.replace(/^["']|["']$/g, '') || value
}
