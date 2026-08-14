'use client'

import { useEffect, useMemo } from 'react'
import { useDocument } from '@/features/document/document-context'
import type { VersionDiffRange } from '@/features/versions/diff'
import {
	type AnalysisDiffFeature,
	computeAnalysisDiff,
	type PendingEdit,
	synthesizeResultText,
} from './analysis-diff'
import { useAnalysisDiffContext } from './analysis-diff-context'

// Re-export pembantu suntingan supaya panel cukup mengimpor dari satu modul.
export {
	computeAnalysisDiff,
	editsFromChanges,
	editsFromSentences,
	editsFromSuggestions,
	synthesizeResultText,
} from './analysis-diff'
export type { AnalysisDiffFeature, PendingEdit }

/**
 * Hitung rentang diff "accept-all virtual" untuk sebuah fitur dan, bila mode
 * Compare aktif untuk fitur itu, terbitkan rentangnya ke editor utama lewat
 * context.
 *
 * `edits` adalah suntingan tertunda dalam koordinat teks polos dokumen - tiap
 * panel menyusunnya dari sumber datanya sendiri (saran grammar, changes
 * analisis, kalimat AI Detector) lewat pembantu di `analysis-diff.ts`.
 *
 * Menghitung ulang tiap render adalah sengaja: menerima/menolak satu saran
 * mengubah suntingan tertunda, sehingga teks hasil sintesis - dan karenanya
 * rentang diff - ikut berubah. Diff menyusut selangkah demi selangkah saat
 * pemakai menerima satu per satu, persis seperti yang diharapkan.
 */
export function useAnalysisDiff(
	feature: AnalysisDiffFeature,
	edits: readonly PendingEdit[],
): {
	isEnabled: boolean
	enable: () => void
	disable: () => void
	/** Benar bila ada setidaknya satu suntingan untuk di-diff. */
	hasEdits: boolean
} {
	const { state } = useDocument()
	const { enable: enableCtx, disable: disableCtx, publish, isEnabled } = useAnalysisDiffContext()

	const baseText = state.text

	// Sintesis di-memo menurut inputnya. `edits` sudah di-memo di sisi panel
	// (lihat `diffEdits` di tiap panel), jadi rentang hanya dihitung ulang saat
	// suntingan tertunda benar-benar berubah - mis. satu saran diterima.
	const ranges = useMemo<VersionDiffRange[]>(() => {
		if (edits.length === 0) return []
		const resultText = synthesizeResultText(baseText, edits)
		return computeAnalysisDiff(baseText, resultText)
	}, [baseText, edits])

	const enabled = isEnabled(feature)

	// Terbitkan rentang ke editor hanya saat fitur INI yang aktif. Panel
	// non-aktif tidak boleh menimpa rentang milik panel yang sedang ditampilkan.
	useEffect(() => {
		if (enabled) publish(feature, ranges)
	}, [enabled, feature, ranges, publish])

	// Saat panel dilepas (pengguna beralih panel/tab), matikan mode Compare
	// untuk fitur ini bila ia sedang aktif. Tanpa ini, dekorasi diff fitur lama
	// menetap di editor padahal panelnya sudah tidak terlihat - menyesatkan.
	useEffect(
		() => () => {
			disableCtx(feature)
		},
		[disableCtx, feature],
	)

	return {
		isEnabled: enabled,
		enable: () => enableCtx(feature),
		disable: () => disableCtx(feature),
		hasEdits: edits.length > 0,
	}
}
