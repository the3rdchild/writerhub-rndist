'use client'

import type { GrammarModel, GrammarSuggestion } from '@writer-hub/shared'
import { useIsMutating, useMutation, useMutationState } from '@tanstack/react-query'
import { useCallback, useRef } from 'react'
import { cancelJob } from '@/lib/api-client'
import { useDocument } from '@/features/document/document-context'
import { useDocumentLanguage } from '@/features/document/use-language'
import { useSessions } from '@/features/sessions/session-context'
import { useSync } from '@/features/sync/sync-context'
import { streamGrammarCheck, streamTimeoutFor, submitGrammarCheck } from './api'

const GRAMMAR_CHECK_KEY = ['grammar', 'check'] as const
interface GrammarCheckVars {
	text: string
	file: File | null
	title: string
	model: GrammarModel
	selectionOffset: number
	language: string
	tabId?: string
}
export interface GrammarCheckScope {
	text: string
	offset: number
}
export function useGrammarCheck() {
	const { state, dispatch, hasContent } = useDocument()
	const language = useDocumentLanguage()
	const { linkage } = useSync()
	const { activeId } = useSessions()
	const abortRef = useRef<AbortController | null>(null)
	const jobIdRef = useRef<string | null>(null)

	const mutation = useMutation({
		mutationKey: GRAMMAR_CHECK_KEY,
		mutationFn: async (vars: GrammarCheckVars) => {
			const { jobId } = await submitGrammarCheck({
				text: vars.text,
				file: vars.selectionOffset > 0 ? null : vars.file,
				title: vars.title,
				model: vars.model,
				language: vars.language,
				tabId: vars.tabId,
			})
			jobIdRef.current = jobId
			const shift = (suggestion: GrammarSuggestion): GrammarSuggestion =>
				vars.selectionOffset > 0
					? { ...suggestion, offset: (suggestion.offset ?? 0) + vars.selectionOffset }
					: suggestion
			const controller = new AbortController()
			abortRef.current = controller
			try {
				return await streamGrammarCheck(jobId, {
					timeoutMs: streamTimeoutFor(vars.model),
					signal: controller.signal,
					onCheckpoint: (event) =>
						dispatch({ type: 'setSuggestions', suggestions: event.suggestions.map(shift) }),
				})
			} finally {
				if (abortRef.current === controller) abortRef.current = null
				jobIdRef.current = null
			}
		},
		onSuccess: (result, vars) => {
			const suggestions =
				vars.selectionOffset > 0
					? result.suggestions.map((s) => ({
							...s,
							offset: (s.offset ?? 0) + vars.selectionOffset,
						}))
					: result.suggestions
			dispatch({
				type: 'applyCheckResult',
				suggestions,
				scores: result.scores,
				extractedText: vars.selectionOffset > 0 ? null : state.file ? result.original_text : null,
			})
		},
	})
	const runCheck = useCallback(
		(scope?: GrammarCheckScope) => {
			const model = language.needsAiTier ? 'ai' : state.model
			const tabId = activeId ? linkage[activeId]?.serverId : undefined

			mutation.mutate(
				scope
					? {
							text: scope.text,
							file: null,
							title: state.title,
							model,
							selectionOffset: scope.offset,
							language: language.code,
							tabId,
						}
					: {
							text: state.text,
							file: state.file,
							title: state.title,
							model,
							selectionOffset: 0,
							language: language.code,
							tabId,
						},
			)
		},
		[
			mutation,
			state.text,
			state.file,
			state.title,
			state.model,
			language.needsAiTier,
			language.code,
			linkage,
			activeId,
		],
	)

	const isRunning = useIsMutating({ mutationKey: GRAMMAR_CHECK_KEY }) > 0

	const errors = useMutationState({
		filters: { mutationKey: GRAMMAR_CHECK_KEY },
		select: (item) => item.state.error,
	})
	const error = (errors.at(-1) ?? null) as Error | null
	const cancel = useCallback(() => {
		const jobId = jobIdRef.current
		if (jobId) {
			cancelJob(jobId)
			jobIdRef.current = null
		}
		abortRef.current?.abort()
		mutation.reset()
	}, [mutation])

	return {
		runCheck,
		cancel,
		isRunning,
		error: isRunning ? null : error,
		canRun: !isRunning && hasContent,
		forcedAiTier: language.needsAiTier && state.model !== 'ai',
	}
}
