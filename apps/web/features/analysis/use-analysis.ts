'use client'

import type { AnalysisFeature, AnalysisResultFor } from '@writer-hub/shared'
import { useQuery } from '@tanstack/react-query'
import { useCallback } from 'react'
import { useDocument } from '@/features/document/document-context'
import { fingerprint } from '@/lib/utils'
import { runAnalysis } from './api'
import { usePanels } from './panel-context'

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
	run: () => void
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
	const { lastRunText, markRun } = usePanels()

	const currentText = state.text
	const requestedText = lastRunText[feature]
	const requestedKey = requestedText === undefined ? null : fingerprint(requestedText)

	const query = useQuery({
		queryKey: ['analysis', feature, requestedKey],
		queryFn: ({ signal }) => runAnalysis(feature, requestedText as string, signal),
		enabled: requestedText !== undefined,
		staleTime: Number.POSITIVE_INFINITY,
		gcTime: RESULT_GC_TIME_MS,
		retry: false,
		refetchOnWindowFocus: false,
	})

	const run = useCallback(() => {
		markRun(feature, currentText)
		// Teks belum berubah sejak eksekusi terakhir: kunci query tetap sama,
		// jadi minta ulang secara eksplisit agar tombol "Run Again" tetap bekerja.
		if (requestedText === currentText) void query.refetch()
	}, [markRun, feature, currentText, requestedText, query])

	return {
		result: query.data,
		isRunning: query.isFetching,
		error: query.error,
		isStale: query.data !== undefined && requestedText !== currentText,
		canRun: !query.isFetching && currentText.trim().length >= MIN_TEXT_LENGTH,
		run,
	}
}
