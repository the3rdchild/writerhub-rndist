'use client'

import type { AnalysisFeature, AnalysisResultFor, RewriterTone } from '@writer-hub/shared'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef } from 'react'
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
const RESULT_GC_TIME_MS = 30 * 60_000

export interface AnalysisController<F extends AnalysisFeature> {
	result: AnalysisResultFor<F> | undefined
	isRunning: boolean
	error: Error | null
	isStale: boolean
	canRun: boolean
	isScoped: boolean
	run: (
		scope?: { text: string; offset: number },
		options?: { tone?: RewriterTone; targetLang?: string },
	) => void
	cancel: () => void
	clear: () => void
}
export function useAnalysis<F extends AnalysisFeature>(
	feature: F,
	scope?: { text: string } | null,
): AnalysisController<F> {
	const { state } = useDocument()
	const { lastRun, markRun, clearRun } = usePanels()
	const language = useDocumentLanguage()
	const { linkage } = useSync()
	const { activeId } = useSessions()
	const queryClient = useQueryClient()
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
				(jobId) => {
					jobIdRef.current = jobId
				},
			)
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
	const clear = useCallback(() => {
		clearRun(feature)
	}, [clearRun, feature])
	useEffect(() => {
		if (requested === undefined) {
			queryClient.removeQueries({ queryKey: ['analysis', feature], exact: false })
		}
	}, [requested, queryClient, feature])

	return {
		result: query.data,
		isRunning: query.isFetching,
		error: query.error,
		isStale:
			query.data !== undefined && !requested?.scoped && requested?.text !== currentText,
		canRun:
			!query.isFetching &&
			(scope ? scope.text : currentText).trim().length >= MIN_TEXT_LENGTH,
		isScoped: requested?.scoped ?? false,
		run,
		cancel,
		clear,
	}
}
