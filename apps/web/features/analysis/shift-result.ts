import type { AnalysisFeature, AnalysisResultFor } from '@writer-hub/shared'

/**
 * Geser offset hasil analisis ke koordinat dokumen.
 *
 * Worker selalu menghitung offset terhadap teks yang ia terima. Saat sebuah
 * modul dijalankan hanya pada bagian yang disorot, teks itu adalah potongan -
 * dan setiap offset di hasilnya masih berpangkal nol. Menggesernya di satu
 * tempat ini membuat seluruh panel dan sorotan tetap memakai koordinat yang
 * sama seperti saat dijalankan atas seluruh naskah.
 */

/** Nama field pembawa rentang, per fitur. */
const RANGE_FIELDS = {
	ai_detector: 'sentences',
	ai_rewriter: 'changes',
	humanizer: 'changes',
	plagiarism: 'flagged_phrases',
	translator: 'changes',
} as const satisfies Record<AnalysisFeature, string>

export function shiftAnalysisResult<F extends AnalysisFeature>(
	feature: F,
	result: AnalysisResultFor<F>,
	offset: number,
): AnalysisResultFor<F> {
	if (offset === 0) return result

	const field = RANGE_FIELDS[feature]
	const ranges = (result as unknown as Record<string, unknown>)[field]
	if (!Array.isArray(ranges)) return result

	return {
		...result,
		[field]: ranges.map((item: { offset: number }) => ({ ...item, offset: item.offset + offset })),
	}
}
