import { webfontFamily } from '@/features/editor/font-catalog'
export const TWIPS_PER_PX = 15

export function twipsToPx(twips: number): number {
	return Math.round(twips / TWIPS_PER_PX)
}

const EMU_PER_PX = 9525

export function emuToPx(emu: number): number {
	return Math.round(emu / EMU_PER_PX)
}

export function halfPointsToPt(halfPoints: number): number {
	return Math.round((halfPoints / 2) * 10) / 10
}

export function toCssColor(value: string | undefined): string | undefined {
	if (!value || value.toLowerCase() === 'auto') return undefined
	return /^[0-9a-f]{6}$/i.test(value) ? `#${value.toLowerCase()}` : value
}

const HIGHLIGHTS: Record<string, string> = {
	yellow: '#ffff00',
	green: '#00ff00',
	cyan: '#00ffff',
	magenta: '#ff00ff',
	blue: '#0000ff',
	red: '#ff0000',
	darkBlue: '#000080',
	darkCyan: '#008080',
	darkGreen: '#008000',
	darkMagenta: '#800080',
	darkRed: '#800000',
	darkYellow: '#808000',
	darkGray: '#808080',
	lightGray: '#c0c0c0',
	black: '#000000',
	white: '#ffffff',
}

export function highlightColor(value: string | undefined): string | undefined {
	if (!value) return undefined
	return HIGHLIGHTS[value] ?? undefined
}

const WORD_LINE_TO_CSS = 1.15

export function toLineHeight(line: number | undefined, rule: string | undefined): string {
	if (line === undefined || line <= 0) return 'normal'

	if (rule === 'exact' || rule === 'atLeast') return `${twipsToPx(line)}px`

	const multiple = line / 240
	if (multiple === 1) return 'normal'
	return String(Math.round(multiple * WORD_LINE_TO_CSS * 100) / 100)
}

export function toFontStack(font: string | undefined): string | undefined {
	if (!font) return undefined
	const loaded = webfontFamily(font)
	if (loaded) return loaded

	const quoted = /\s/.test(font) ? `"${font}"` : font
	if (/mono|consol|courier|code/i.test(font)) return `${quoted}, monospace`
	if (/times|georgia|garamond|book|serif|cambria|minion/i.test(font)) return `${quoted}, serif`
	return `${quoted}, sans-serif`
}
