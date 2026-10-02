/*
 * Hitungan lebar & jarak kolom untuk penggaris dan dialog "More column
 * options" (KOL-11). Murni: masukan dan keluarannya px pada lebar teks
 * section; penulisan ke naskah lewat `setColumnsLayout`.
 */

/** Kolom tersempit yang masih masuk akal untuk teks. */
export const MIN_COLUMN_WIDTH = 48
/** Jarak tersempit yang masih bisa digenggam di penggaris. */
export const MIN_COLUMN_GAP = 0

export interface ColumnLayout {
	widths: number[]
	gaps: number[]
}

export type ColumnDrag =
	/** Seluruh pita celah digeser: kolom kiri melebar, kolom kanan menyempit. */
	| { kind: 'band'; index: number }
	/** Tepi kiri celah (= tepi kanan kolom kiri). */
	| { kind: 'edge'; index: number; side: 'left' | 'right' }

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(value, max))

/** Tepi kiri tiap kolom, relatif ke tepi kiri teks. */
export function columnLefts({ widths, gaps }: ColumnLayout): number[] {
	const lefts: number[] = []
	let left = 0
	widths.forEach((width, index) => {
		lefts.push(left)
		left += width + (gaps[index] ?? 0)
	})
	return lefts
}

/**
 * Tata letak sesudah gagang di penggaris diseret ke `x` (relatif tepi kiri
 * teks). Lebar total teks tidak berubah: yang diambil satu kolom diberikan ke
 * celah atau ke kolom sebelahnya.
 */
export function dragColumns(layout: ColumnLayout, drag: ColumnDrag, x: number): ColumnLayout {
	const { index } = drag
	const widths = [...layout.widths]
	const gaps = [...layout.gaps]
	if (index < 0 || index >= widths.length - 1) return { widths, gaps }
	const lefts = columnLefts(layout)
	const gap = gaps[index] ?? 0

	if (drag.kind === 'band') {
		const pair = widths[index] + widths[index + 1]
		const first = clamp(x - lefts[index], MIN_COLUMN_WIDTH, pair - MIN_COLUMN_WIDTH)
		widths[index] = first
		widths[index + 1] = pair - first
		return { widths, gaps }
	}

	if (drag.side === 'left') {
		const first = clamp(x - lefts[index], MIN_COLUMN_WIDTH, widths[index] + gap - MIN_COLUMN_GAP)
		gaps[index] = widths[index] + gap - first
		widths[index] = first
		return { widths, gaps }
	}

	const right = lefts[index + 1] + widths[index + 1]
	const last = clamp(right - x, MIN_COLUMN_WIDTH, widths[index + 1] + gap - MIN_COLUMN_GAP)
	gaps[index] = widths[index + 1] + gap - last
	widths[index + 1] = last
	return { widths, gaps }
}

/** Kolom rata selebar `width` dengan jarak `gap` di tiap celah. */
export function evenColumns(width: number, count: number, gap: number): ColumnLayout {
	const usable = Math.max(0, width - gap * (count - 1))
	return {
		widths: Array.from({ length: count }, () => usable / count),
		gaps: Array.from({ length: Math.max(0, count - 1) }, () => gap),
	}
}

export type ColumnPreset = 'one' | 'two' | 'three' | 'left' | 'right'

/**
 * Prasetel ala Word: "Left" = kolom kiri sempit (sepertiga), "Right" = kolom
 * kanan sempit. Mengembalikan null untuk satu kolom.
 */
export function presetColumns(preset: ColumnPreset, width: number, gap: number): ColumnLayout | null {
	if (preset === 'one') return null
	if (preset === 'two') return evenColumns(width, 2, gap)
	if (preset === 'three') return evenColumns(width, 3, gap)
	const usable = Math.max(0, width - gap)
	const narrow = usable / 3
	return {
		widths: preset === 'left' ? [narrow, usable - narrow] : [usable - narrow, narrow],
		gaps: [gap],
	}
}

/** Sama lebar dan sama jarak (dalam toleransi pembulatan)? */
export function isEven({ widths, gaps }: ColumnLayout): boolean {
	const near = (a: number, b: number) => Math.abs(a - b) < 0.75
	return widths.every((width) => near(width, widths[0])) && gaps.every((gap) => near(gap, gaps[0] ?? 0))
}

/**
 * Tambalan atribut `columns` dari tata letak yang disunting. Kolom rata
 * ditulis ringkas (`gap` saja, `widths`/`gaps` dihapus) - bentuk yang sama
 * dengan perintah "Two columns" - supaya DOCX-nya keluar `w:equalWidth`; yang
 * tak rata membawa `widths` dan `gaps` (dibulatkan ke piksel), persis bentuk
 * impor `w:col`.
 */
export function layoutPatch(layout: ColumnLayout): {
	count: number
	gap: number
	widths: number[] | null
	gaps: number[] | null
} {
	const count = layout.widths.length
	const gap = Math.round(layout.gaps[0] ?? 0)
	if (isEven(layout)) return { count, gap, widths: null, gaps: null }
	return {
		count,
		gap,
		widths: layout.widths.map((width) => Math.round(width)),
		gaps: layout.gaps.map((value) => Math.round(value)),
	}
}

/* ── Dialog "More column options…" ──────────────────────────────────────── */

export type LengthUnit = 'cm' | 'in'

const PX_PER: Record<LengthUnit, number> = { cm: 96 / 2.54, in: 96 }

export function pxToUnit(px: number, unit: LengthUnit): number {
	return Math.round((px / PX_PER[unit]) * 100) / 100
}

export function unitToPx(value: number, unit: LengthUnit): number {
	return value * PX_PER[unit]
}

/** Jumlah kolom diganti: kolom dihitung ulang rata dari lebar teks, jarak pertamanya dipertahankan. */
export function withCount(layout: ColumnLayout, count: number, width: number): ColumnLayout {
	return evenColumns(width, Math.max(1, Math.round(count)), layout.gaps[0] ?? 0)
}

/**
 * Lebar satu kolom diubah di dialog. Kolom rata: semua kolom ikut, jaraknya
 * yang menyesuaikan. Tak rata: selisihnya diambil dari kolom terakhir (atau
 * kolom sebelumnya bila yang diubah kolom terakhir), seperti Word.
 */
export function withWidth(
	layout: ColumnLayout,
	index: number,
	value: number,
	width: number,
	equal: boolean,
): ColumnLayout {
	const count = layout.widths.length
	if (count < 2 || index < 0 || index >= count) return layout
	if (equal) {
		const each = clamp(value, MIN_COLUMN_WIDTH, width / count)
		const gap = (width - each * count) / (count - 1)
		return {
			widths: Array.from({ length: count }, () => each),
			gaps: Array.from({ length: count - 1 }, () => gap),
		}
	}
	const widths = [...layout.widths]
	const partner = index === count - 1 ? count - 2 : count - 1
	const pool = widths[index] + widths[partner]
	widths[index] = clamp(value, MIN_COLUMN_WIDTH, pool - MIN_COLUMN_WIDTH)
	widths[partner] = pool - widths[index]
	return { widths, gaps: [...layout.gaps] }
}

/** Jarak satu celah diubah; kolom rata menyesuaikan lebarnya, tak rata mengambil dari kolom kanannya. */
export function withSpacing(
	layout: ColumnLayout,
	index: number,
	value: number,
	width: number,
	equal: boolean,
): ColumnLayout {
	const count = layout.widths.length
	if (count < 2 || index < 0 || index >= count - 1) return layout
	if (equal) {
		const gap = clamp(value, MIN_COLUMN_GAP, (width - MIN_COLUMN_WIDTH * count) / (count - 1))
		return evenColumns(width, count, gap)
	}
	const widths = [...layout.widths]
	const gaps = [...layout.gaps]
	const pool = gaps[index] + widths[index + 1]
	gaps[index] = clamp(value, MIN_COLUMN_GAP, pool - MIN_COLUMN_WIDTH)
	widths[index + 1] = pool - gaps[index]
	return { widths, gaps }
}
