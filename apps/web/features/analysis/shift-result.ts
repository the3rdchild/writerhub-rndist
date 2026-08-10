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
	// Glosarium tidak menghasilkan rentang teks - hasilnya daftar istilah,
	// bukan sesuatu yang menunjuk posisi di naskah. `null` menandainya sebagai
	// "tidak ada yang perlu digeser", bukan sebagai kelalaian.
	glossary: null,
} as const satisfies Record<AnalysisFeature, string | null>

export function shiftAnalysisResult<F extends AnalysisFeature>(
	feature: F,
	result: AnalysisResultFor<F>,
	offset: number,
): AnalysisResultFor<F> {
	if (offset === 0) return result

	const field: string | null = RANGE_FIELDS[feature]
	if (field === null) return result

	const ranges = (result as unknown as Record<string, unknown>)[field]
	if (!Array.isArray(ranges)) return result

	return {
		...result,
		[field]: ranges.map((item: { offset: number }) => ({ ...item, offset: item.offset + offset })),
	}
}
