/**
 * Aturan format kampus di brief, diterjemahkan ke tata letak naskah.
 *
 * Tidak semua aturan bisa diterapkan mesin: gaya sitasi, penomoran bab, dan
 * panjang abstrak adalah cara menulis, bukan setelan halaman - itu tetap
 * urusan AI dan penulis. Yang di sini hanya yang punya padanan pasti: kertas,
 * margin, huruf, ukurannya, dan spasi baris.
 */

import {
	type DocumentTypography,
	INCH,
	PAGE_SIZES,
	type PageMargins,
	type PageSetup,
	type PageSizeId,
	type ResearchBrief,
} from '@writer-hub/shared'
import { FONT_FAMILIES } from '@/features/editor/font-catalog'

const CM_PER_INCH = 2.54
/** Selisih margin di bawah ini dianggap sama - konversi px↔cm membulatkan. */
const MARGIN_TOLERANCE_CM = 0.05

const PAPER_BY_LABEL: Record<string, PageSizeId> = {
	a4: 'a4',
	a5: 'a5',
	b5: 'b5',
	f4: 'folio',
	folio: 'folio',
	'f4 / folio': 'folio',
	letter: 'letter',
	legal: 'legal',
}

export const cmToPx = (cm: number): number => (cm / CM_PER_INCH) * INCH
export const pxToCm = (px: number): number => Math.round((px / INCH) * CM_PER_INCH * 100) / 100

/** "4", "4,0", "4 cm", "1,5" - angka seperti penulis Indonesia mengetiknya. */
export function parseBriefNumber(value: string | undefined): number | null {
	if (!value) return null
	const match = /-?\d+(?:[.,]\d+)?/.exec(value)
	if (!match) return null
	const number = Number(match[0].replace(',', '.'))
	return Number.isFinite(number) ? number : null
}

export function paperSizeOf(label: string | undefined): PageSizeId | null {
	if (!label) return null
	return PAPER_BY_LABEL[label.trim().toLowerCase()] ?? null
}

/** Nilai CSS untuk nama huruf; huruf di luar katalog tetap dicoba lewat namanya sendiri. */
export function fontFamilyOf(label: string | undefined): string | null {
	const name = label?.trim()
	if (!name) return null
	const known = FONT_FAMILIES.find((font) => font.label.toLowerCase() === name.toLowerCase())
	return known?.value ?? `"${name.replace(/"/g, '')}", serif`
}

/** Kebalikannya: nama yang dikenali penulis untuk nilai CSS yang tersimpan. */
export function fontLabelOf(family: string): string {
	const known = FONT_FAMILIES.find((font) => font.value === family)
	if (known) return known.label
	return family.split(',')[0]?.replace(/["']/g, '').trim() || family
}

export interface FormatTarget {
	size?: PageSizeId
	margins?: Partial<PageMargins>
	family?: string
	sizePt?: number
	lineHeight?: number
}

const MARGIN_FIELDS = [
	['left', 'marginKiri'],
	['top', 'marginAtas'],
	['right', 'marginKanan'],
	['bottom', 'marginBawah'],
] as const

export function formatTarget(brief: ResearchBrief): FormatTarget {
	const { entries } = brief
	const target: FormatTarget = {}

	const size = paperSizeOf(entries.kertas?.value)
	if (size) target.size = size

	const margins: Partial<PageMargins> = {}
	for (const [side, key] of MARGIN_FIELDS) {
		const cm = parseBriefNumber(entries[key]?.value)
		if (cm !== null && cm >= 0 && cm < 10) margins[side] = cmToPx(cm)
	}
	if (Object.keys(margins).length > 0) target.margins = margins

	const family = fontFamilyOf(entries.font?.value)
	if (family) target.family = family

	const sizePt = parseBriefNumber(entries.ukuranFont?.value)
	if (sizePt !== null && sizePt >= 6 && sizePt <= 72) target.sizePt = sizePt

	const lineHeight = parseBriefNumber(entries.spasi?.value)
	if (lineHeight !== null && lineHeight >= 0.5 && lineHeight <= 4) target.lineHeight = lineHeight

	return target
}

export interface FormatDifference {
	key: string
	label: string
	current: string
	wanted: string
}

const SIDE_LABEL: Record<keyof PageMargins, string> = {
	left: 'Left margin',
	top: 'Top margin',
	right: 'Right margin',
	bottom: 'Bottom margin',
}

const formatCm = (cm: number): string => `${String(Math.round(cm * 100) / 100).replace('.', ',')} cm`
const formatSpacing = (value: number): string => String(value).replace('.', ',')

/** Di mana naskah sekarang tidak mengikuti aturan yang bisa diterapkan. */
export function formatDifferences(
	target: FormatTarget,
	setup: PageSetup,
	typography: DocumentTypography,
): FormatDifference[] {
	const differences: FormatDifference[] = []

	if (target.size && target.size !== setup.size) {
		differences.push({
			key: 'size',
			label: 'Kertas',
			current: PAGE_SIZES[setup.size].label,
			wanted: PAGE_SIZES[target.size].label,
		})
	}

	for (const [side] of MARGIN_FIELDS) {
		const wanted = target.margins?.[side]
		if (wanted === undefined) continue
		const current = pxToCm(setup.margins[side])
		const wantedCm = pxToCm(wanted)
		if (Math.abs(current - wantedCm) > MARGIN_TOLERANCE_CM) {
			differences.push({
				key: side,
				label: SIDE_LABEL[side],
				current: formatCm(current),
				wanted: formatCm(wantedCm),
			})
		}
	}

	if (target.family && target.family !== typography.baseFont.family) {
		differences.push({
			key: 'family',
			label: 'Font',
			current: fontLabelOf(typography.baseFont.family),
			wanted: fontLabelOf(target.family),
		})
	}
	if (target.sizePt !== undefined && target.sizePt !== typography.baseFont.sizePt) {
		differences.push({
			key: 'sizePt',
			label: 'Font size',
			current: `${typography.baseFont.sizePt} pt`,
			wanted: `${target.sizePt} pt`,
		})
	}
	if (target.lineHeight !== undefined && target.lineHeight !== typography.lineHeight) {
		differences.push({
			key: 'lineHeight',
			label: 'Line spacing',
			current: formatSpacing(typography.lineHeight),
			wanted: formatSpacing(target.lineHeight),
		})
	}

	return differences
}

/** Tata letak sesudah aturan diterapkan; yang tidak diatur aturan dibiarkan apa adanya. */
export function applyFormatTarget(
	target: FormatTarget,
	setup: PageSetup,
	typography: DocumentTypography,
): { setup: PageSetup; typography: DocumentTypography } {
	return {
		setup: {
			...setup,
			...(target.size ? { size: target.size } : {}),
			margins: { ...setup.margins, ...target.margins },
		},
		typography: {
			...typography,
			baseFont: {
				family: target.family ?? typography.baseFont.family,
				sizePt: target.sizePt ?? typography.baseFont.sizePt,
			},
			lineHeight: target.lineHeight ?? typography.lineHeight,
		},
	}
}

export function formatTargetIsEmpty(target: FormatTarget): boolean {
	return Object.keys(target).length === 0
}
