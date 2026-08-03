import type { GrammarSuggestion, TextRange } from '@writer-hub/shared'

/** Suggestion dari API plus status UI-nya. */
export interface EditorSuggestion extends GrammarSuggestion {
	dismissed: boolean
}

/**
 * Cari posisi akurat `original` di dalam teks.
 *
 * Offset dari API — terutama yang berasal dari LLM — kerap meleset satu-dua
 * karakter, misalnya menunjuk "tuffs" untuk kata "stuffs", sehingga highlight
 * hanya menutupi sebagian kata dan accept menghasilkan "sstuff". Karena itu
 * span selalu dihitung ulang dari `original`; offset API cuma dipakai sebagai
 * petunjuk untuk memilih kemunculan terdekat saat katanya muncul berkali-kali.
 */
export function resolveSpan(text: string, original: string, hint?: number): TextRange | null {
	if (!original) return null

	const length = original.length
	if (hint !== undefined && text.slice(hint, hint + length) === original) {
		return { offset: hint, length }
	}

	let best = -1
	let bestDistance = Number.POSITIVE_INFINITY
	for (let from = 0; ; ) {
		const index = text.indexOf(original, from)
		if (index === -1) break

		const distance = hint === undefined ? index : Math.abs(index - hint)
		if (distance < bestDistance) {
			bestDistance = distance
			best = index
		}
		from = index + 1
	}

	return best === -1 ? null : { offset: best, length }
}

/** Petakan suggestion dari API ke bentuk editor dengan span yang sudah dikoreksi. */
export function reconcileSuggestions(
	text: string,
	suggestions: readonly GrammarSuggestion[],
): EditorSuggestion[] {
	return suggestions.map((suggestion) => {
		const span = resolveSpan(text, suggestion.original, suggestion.offset)
		return {
			...suggestion,
			dismissed: false,
			offset: span?.offset,
			length: span?.length,
		}
	})
}

/** Terapkan satu penggantian; jatuh ke pencarian teks kalau span tidak diketahui. */
export function applySuggestion(text: string, suggestion: EditorSuggestion): string {
	if (suggestion.offset !== undefined && suggestion.length !== undefined) {
		return (
			text.slice(0, suggestion.offset) +
			suggestion.replacement +
			text.slice(suggestion.offset + suggestion.length)
		)
	}

	const index = text.indexOf(suggestion.original)
	if (index === -1) return text
	return text.slice(0, index) + suggestion.replacement + text.slice(index + suggestion.original.length)
}

/**
 * Terapkan sekumpulan penggantian sekaligus.
 * Diproses dari offset terbesar ke terkecil supaya offset yang belum diproses
 * tidak bergeser.
 */
export function applySuggestions(text: string, suggestions: readonly EditorSuggestion[]): string {
	const ordered = [...suggestions].sort((a, b) => (b.offset ?? 0) - (a.offset ?? 0))
	return ordered.reduce(applySuggestion, text)
}

/** Geser offset suggestion lain setelah sebuah penggantian mengubah panjang teks. */
export function shiftAfter(
	suggestions: readonly EditorSuggestion[],
	appliedOffset: number,
	delta: number,
): EditorSuggestion[] {
	return suggestions.map((suggestion) =>
		suggestion.offset !== undefined && suggestion.offset > appliedOffset
			? { ...suggestion, offset: suggestion.offset + delta }
			: suggestion,
	)
}

/** Terapkan satu perubahan berbasis rentang (dipakai panel analisis). */
export function replaceRange(text: string, range: TextRange, replacement: string): string {
	return text.slice(0, range.offset) + replacement + text.slice(range.offset + range.length)
}
