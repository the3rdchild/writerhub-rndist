'use client'

import type { AnalysisFeature, AnalysisResultFor, RewriterTone } from '@writer-hub/shared'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useRef } from 'react'
import { cancelJob } from '@/lib/api-client'
import { useDocument } from '@/features/document/document-context'
import { useDocumentLanguage } from '@/features/document/use-language'
import { useSessions } from '@/features/sessions/session-context'
import { useSync } from '@/features/sync/sync-context'
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
	/**
	 * `options` membawa parameter khusus fitur: `tone` untuk AI Rewriter,
	 * `targetLang` untuk Translator. Keduanya ikut ke kunci query, jadi
	 * mengganti salah satunya menghasilkan hasil baru, bukan hasil lama.
	 */
	run: (
		scope?: { text: string; offset: number },
		options?: { tone?: RewriterTone; targetLang?: string },
	) => void
	/** Batalkan analisis yang sedang berjalan (§P7 lapis A): UI bebas seketika. */
	cancel: () => void
}

/**
 * Satu fitur analisis sebagai query TanStack.
 *
 * Kunci query memuat sidik jari teks yang diperiksa, jadi "hasil sudah basi"
 * jatuh sendirinya dari perbandingan kunci - versi lama harus memanggil
 * `markOthersStale()` secara manual di setiap handler accept, dan itu gampang
 * terlewat. Menjalankan ulang pada teks yang sama juga langsung memakai cache.
 */
export function useAnalysis<F extends AnalysisFeature>(feature: F): AnalysisController<F> {
	const { state } = useDocument()
	const { lastRun, markRun } = usePanels()
	const language = useDocumentLanguage()
	const { linkage } = useSync()
	const { activeId } = useSessions()
	const queryClient = useQueryClient()

	/** jobId analisis yang sedang berjalan - dipakai untuk membatalkan di server (§P7 lapis B). */
	const jobIdRef = useRef<string | null>(null)

	const currentText = state.text
	const requested = lastRun[feature]
	const requestedKey = requested?.text != null ? fingerprint(requested.text) : null

	const query = useQuery({
		queryKey: [
			'analysis',
			feature,
			requestedKey,
			requested?.offset ?? 0,
			requested?.language,
			requested?.tone ?? null,
			requested?.targetLang ?? null,
		],
		queryFn: async ({ signal }) => {
			const run = requested as AnalysisRun
			const raw = await runAnalysis(
				feature,
				run.text,
				run.language,
				signal,
				run.tabId,
				run.tone,
				run.targetLang,
				// Catat jobId seketika setelah submit supaya cancel() bisa menyasar server.
				(jobId) => {
					jobIdRef.current = jobId
				},
			)
			// Digeser di sini, sekali, supaya seluruh pemakainya tidak perlu tahu
			// apakah hasil ini datang dari potongan atau dari naskah penuh.
			return shiftAnalysisResult(feature, raw, run.offset)
		},
		enabled: requested !== undefined,
		staleTime: Number.POSITIVE_INFINITY,
		gcTime: RESULT_GC_TIME_MS,
		retry: false,
		refetchOnWindowFocus: false,
	})

	const run = useCallback(
		(
			scope?: { text: string; offset: number },
			options?: { tone?: RewriterTone; targetLang?: string },
		) => {
			// Tautan tab cloud ikut dicatat supaya job ini muncul di Aktivitas
			// AI dengan tautannya; tab lokal-saja mengirim undefined.
			const tabId = activeId ? linkage[activeId]?.serverId : undefined
			const common = {
				language: language.code,
				tabId,
				tone: options?.tone,
				targetLang: options?.targetLang,
			}
			const next: AnalysisRun = scope
				? { text: scope.text, offset: scope.offset, scoped: true, ...common }
				: { text: currentText, offset: 0, scoped: false, ...common }
			markRun(feature, next)

			// Permintaan identik dengan yang terakhir: kunci query tidak berubah,
			// jadi minta ulang eksplisit agar tombol "Run Again" tetap bekerja.
			if (
				requested?.text === next.text &&
				requested?.offset === next.offset &&
				requested?.tone === next.tone &&
				requested?.targetLang === next.targetLang
			) {
				void query.refetch()
			}
		},
		[markRun, feature, currentText, requested, query, language.code, linkage, activeId],
	)

	/** Batalkan analisis berjalan (§P7 lapis A+B). cancelQueries membatalkan queryFn
	     yang sedang menunggu SSE; panel kembali ke keadaan sebelum Run, tanpa
	     dianggap error. Bendera cancel juga dikirim ke server (best effort). */
	const cancel = useCallback(() => {
		const jobId = jobIdRef.current
		if (jobId) {
			cancelJob(jobId)
			jobIdRef.current = null
		}
		void queryClient.cancelQueries({ queryKey: ['analysis', feature], exact: false })
	}, [queryClient, feature])

	return {
		result: query.data,
		isRunning: query.isFetching,
		error: query.error,
		// Hasil per-seleksi tidak dianggap basi hanya karena bagian lain dokumen
		// disunting - yang diperiksa memang bukan seluruh naskah.
		isStale:
			query.data !== undefined && !requested?.scoped && requested?.text !== currentText,
		canRun: !query.isFetching && currentText.trim().length >= MIN_TEXT_LENGTH,
		isScoped: requested?.scoped ?? false,
		run,
		cancel,
	}
}
