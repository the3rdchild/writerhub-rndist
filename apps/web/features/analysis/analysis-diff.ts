import type { AnalysisFeature, TextChange } from '@writer-hub/shared'
import type { VersionDiffRange } from '@/features/versions/diff'
import { computeVersionDiff } from '@/features/versions/diff'
import type { EditorSuggestion } from '@/features/document/suggestions'
import { replaceRange } from '@/features/document/suggestions'

/**
 * Fitur yang punya mode "Compare". Mencakup seluruh `AnalysisFeature` plus
 * `'proofreader'`, yang menempuh jalur grammar check terpisah - keduanya
 * menyimpan suntingan tertunda yang bisa disintesis jadi teks hasil, jadi
 * keduanya layak di-diff.
 */
export type AnalysisDiffFeature = AnalysisFeature | 'proofreader'

/** Segmen yang sudah diterapkan dan masih bisa dibatalkan - bentuk yang sama
 *  dengan `AppliedChange` di `use-pending-changes`, diduplikasi di sini supaya
 *  modul diff tidak mengimpor hook (yang punya efek samping React). */
interface AppliedChangeLike {
	offset: number
	original: string
}

/**
 * Satu suntingan dalam koordinat teks polos dokumen - abstraksi bersama untuk
 * saran grammar, change analisis, dan kalimat AI Detector. Dipakai
 * `synthesizeResultText` untuk menerapkan semuanya seolah-olah "Accept all"
 * ditekan, tanpa menyentuh editor.
 */
export interface PendingEdit {
	offset: number
	length: number
	replacement: string
}

/**
 * Sintesis teks hasil "accept-all virtual": terapkan tiap suntingan ke teks
 * dasar, dari offset terbesar ke terkecil supaya offset yang belum diproses
 * tidak bergeser. Tidak menyentuh editor - murni perhitungan teks polos.
 *
 * Dipakai panel analisis untuk membandingkan naskah saat ini dengan apa yang
 * akan jadi bila seluruh saran diterima (§diff hasil dengan dokumen).
 */
export function synthesizeResultText(baseText: string, edits: readonly PendingEdit[]): string {
	// Salin dulu; `sort` mengubah urutan in-place.
	const ordered = [...edits].sort((a, b) => b.offset - a.offset)
	return ordered.reduce((text, edit) => replaceRange(text, edit, edit.replacement), baseText)
}

/**
 * Daftar suntingan tertunda dari hasil analisis berbasis `changes[]`
 * (AI Rewriter, Humanizer, Translator).
 *
 * `applied` dikeluarkan: segmen yang sudah diterima tidak dihitung lagi -
 * kalau diff tetap menampilkannya, teks hasil tidak akan menyusut saat satu
 * per satu diterima, dan kesan "ini belum diterapkan" bertahan.
 */
export function editsFromChanges(
	pending: readonly TextChange[],
	applied: readonly AppliedChangeLike[],
): PendingEdit[] {
	const appliedKeys = new Set(applied.map((entry) => `${entry.offset}:${entry.original}`))
	return pending
		.filter((change) => !appliedKeys.has(`${change.offset}:${change.original}`))
		.map((change) => ({
			offset: change.offset,
			length: change.length,
			replacement: change.replacement,
		}))
}

/** Daftar suntingan dari saran grammar yang belum di-dismiss/accept. */
export function editsFromSuggestions(suggestions: readonly EditorSuggestion[]): PendingEdit[] {
	return suggestions
		.filter((suggestion) => !suggestion.dismissed)
		.map((suggestion) => ({
			offset: suggestion.offset ?? 0,
			length: suggestion.length ?? suggestion.original.length,
			replacement: suggestion.replacement,
		}))
}

/**
 * Daftar suntingan dari kalimat AI Detector yang masih punya saran.
 *
 * `expected` tidak dipakai di sini: teks kalimat (`sentence.text`) sudah
 * berada di posisi `offset`, dan `synthesizeResultText` bekerja murni pada
 * teks polos, jadi kecocokan format tidak menjadi pertimbangan.
 */
export interface AiDetectorSentence {
	offset: number
	length: number
	text: string
	suggestion?: string | null
	applied?: boolean
	dismissed?: boolean
}

export function editsFromSentences(sentences: readonly AiDetectorSentence[]): PendingEdit[] {
	return sentences
		.filter((sentence) => sentence.suggestion && !sentence.applied && !sentence.dismissed)
		.map((sentence) => ({
			offset: sentence.offset,
			length: sentence.length,
			replacement: sentence.suggestion as string,
		}))
}

/**
 * Hitung rentang diff antara teks dasar (naskah saat ini) dan teks hasil
 * sintesis. Membungkus `computeVersionDiff` versi-riwayat supaya penyajian
 * diff analisis tetap satu mesin dengannya - kata yang sama ditegakkan dengan
 * cara yang sama, di editor utama maupun di pratinjau riwayat.
 *
 * Hasil berkoordinat `baseText` (yaitu koordinat teks polos editor), siap
 * dipetakan ke posisi ProseMirror oleh lapisan dekorasi.
 */
export function computeAnalysisDiff(baseText: string, resultText: string): VersionDiffRange[] {
	if (baseText === resultText) return []
	return computeVersionDiff(baseText, resultText)
}
