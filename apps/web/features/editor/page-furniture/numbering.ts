/**
 * Perhitungan nomor halaman per lembar (T4).
 *
 * Aturannya menempel pada section: format (romawi/arab/huruf) dan mulai-ulang.
 * Lembar membawa hasil evaluasi paginator (`sectionIndex` + `pageNumbering`),
 * urutan nomor dihitung di sini dengan satu penghitung yang mengalir dari
 * lembar pertama sampai terakhir — mulai-ulang hanya berlaku di lembar pertama
 * section-nya, persis seperti Word.
 */

import { formatPageNumber, type PageNumbering } from '@writer-hub/shared'

/** Aturan ketika section tidak menyimpan apa-apa: desimal, lanjut mengalir. */
export const CONTINUE_NUMBERING: PageNumbering = { format: 'decimal', restart: 'continue' }

export interface NumberedSheet {
	index: number
	sectionIndex?: number
	pageNumbering?: PageNumbering | null
}

/**
 * Nomor terformat tiap lembar (posisi = indeks lembar).
 * Tanpa lembar terukur (paginasi belum jalan), jatuh ke 1..count desimal.
 */
export function formatSheetNumbers(sheets: readonly NumberedSheet[], fallbackCount = 1): string[] {
	if (sheets.length === 0) {
		return Array.from({ length: Math.max(1, fallbackCount) }, (_, index) => String(index + 1))
	}

	const numbers: string[] = []
	let counter = 0
	let previousSection: number | null = null

	for (const sheet of sheets) {
		const rule = sheet.pageNumbering ?? CONTINUE_NUMBERING
		const section = sheet.sectionIndex ?? 0
		/* Mulai-ulang hanya sekali per pergantian section; lembar yang membuka
		 * section menampilkan angka restart-nya sendiri (start at 5 → 5, 6, 7). */
		if (section !== previousSection && typeof rule.restart === 'number') {
			counter = rule.restart - 1
		}
		counter += 1
		numbers[sheet.index] = formatPageNumber(counter, rule.format)
		previousSection = section
	}

	return numbers
}
