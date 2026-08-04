'use client'

import type { AnalysisFeature, AnalysisResultFor } from '@writer-hub/shared'
import { useQuery } from '@tanstack/react-query'
import { useCallback } from 'react'
import { useDocument } from '@/features/document/document-context'
import { fingerprint } from '@/lib/utils'
import { runAnalysis } from './api'
import { type AnalysisRun, usePanels } from './panel-context'
import { shiftAnalysisResult } from './shift-result'

const MIN_TEXT_LENGTH = 10
/** Simpan hasil selama sesi berlangsung; berpindah panel tidak menghilangkannya. */
const RESULT_GC_TIME_MS = 30 * 60_000

export interface AnalysisController<F extends AnalysisFeature> {
	result: AnalysisResultFor<F> | undefined
	isRunning: boolean
	error: Error | null
	/** Ada hasil, tapi dokumen sudah berubah sejak hasil itu dibuat. */
	isStale: boolean
	canRun: boolean
	/** Hasil yang ditampilkan berasal dari bagian yang disorot, bukan seluruh naskah. */
	isScoped: boolean
	/** Tanpa argumen berarti seluruh dokumen. */
	run: (scope?: AnalysisRun) => void
}

/**
 * Satu fitur analisis sebagai query TanStack.
 *
 * Kunci query memuat sidik jari teks yang diperiksa, jadi "hasil sudah basi"
 * jatuh sendirinya dari perbandingan kunci — versi lama harus memanggil
 * `markOthersStale()` secara manual di setiap handler accept, dan itu gampang
 * terlewat. Menjalankan ulang pada teks yang sama juga langsung memakai cache.
 */
export function useAnalysis<F extends AnalysisFeature>(feature: F): AnalysisController<F> {
	const { state } = useDocument()
	const { lastRun, markRun } = usePanels()

	const currentText = state.text
	const requested = lastRun[feature]
	const requestedKey = requested?.text != null ? fingerprint(requested.text) : null

	const query = useQuery({
		queryKey: ['analysis', feature, requestedKey, requested?.offset ?? 0],
		queryFn: async ({ signal }) => {
			const raw = await runAnalysis(feature, (requested as AnalysisRun).text, signal)
			// Digeser di sini, sekali, supaya seluruh pemakainya tidak perlu tahu
			// apakah hasil ini datang dari potongan atau dari naskah penuh.
			return shiftAnalysisResult(feature, raw, (requested as AnalysisRun).offset)
		},
		enabled: requested !== undefined,
		staleTime: Number.POSITIVE_INFINITY,
		gcTime: RESULT_GC_TIME_MS,
		retry: false,
		refetchOnWindowFocus: false,
	})

	const run = useCallback(
		(scope?: AnalysisRun) => {
			const next: AnalysisRun = scope ?? { text: currentText, offset: 0, scoped: false }
			markRun(feature, next)

			// Permintaan identik dengan yang terakhir: kunci query tidak berubah,
			// jadi minta ulang eksplisit agar tombol "Run Again" tetap bekerja.
			if (requested?.text === next.text && requested?.offset === next.offset) {
				void query.refetch()
			}
		},
		[markRun, feature, currentText, requested, query],
	)

	return {
		result: query.data,
		isRunning: query.isFetching,
		error: query.error,
		// Hasil per-seleksi tidak dianggap basi hanya karena bagian lain dokumen
		// disunting — yang diperiksa memang bukan seluruh naskah.
		isStale:
			query.data !== undefined && !requested?.scoped && requested?.text !== currentText,
		canRun: !query.isFetching && currentText.trim().length >= MIN_TEXT_LENGTH,
		isScoped: requested?.scoped ?? false,
		run,
	}
}
