'use client'

import { useIsMutating, useMutation, useMutationState } from '@tanstack/react-query'
import { useDocument } from '@/features/document/document-context'
import { streamGrammarCheck, streamTimeoutFor, submitGrammarCheck } from './api'

const GRAMMAR_CHECK_KEY = ['grammar', 'check'] as const

/**
 * Menjalankan satu siklus grammar check: submit → ikuti SSE → tulis hasil ke
 * state dokumen.
 *
 * Dimodelkan sebagai mutation karena ini aksi yang dipicu pengguna, bukan data
 * yang bisa di-cache: hasilnya langsung menjadi milik dokumen dan pengguna
 * mengubahnya lewat accept/dismiss.
 *
 * Status dibaca lewat `useIsMutating`/`useMutationState`, bukan dari objek
 * mutation lokal, supaya setiap pemanggil hook ini melihat keadaan yang sama —
 * editor dan panel proofreader sama-sama menampilkan progres yang sedang jalan
 * meski tombolnya cuma ada di panel.
 */
export function useGrammarCheck() {
	const { state, dispatch, hasContent } = useDocument()

	const mutation = useMutation({
		mutationKey: GRAMMAR_CHECK_KEY,
		mutationFn: async () => {
			const { jobId } = await submitGrammarCheck({
				text: state.text,
				file: state.file,
				title: state.title,
				model: state.model,
			})

			return streamGrammarCheck(jobId, {
				timeoutMs: streamTimeoutFor(state.model),
				// Tampilkan suggestion sementara selagi checker masih berjalan.
				onCheckpoint: (event) => dispatch({ type: 'setSuggestions', suggestions: event.suggestions }),
			})
		},
		onSuccess: (result) => {
			dispatch({
				type: 'applyCheckResult',
				suggestions: result.suggestions,
				scores: result.scores,
				extractedText: state.file ? result.original_text : null,
			})
		},
	})

	const isRunning = useIsMutating({ mutationKey: GRAMMAR_CHECK_KEY }) > 0

	const errors = useMutationState({
		filters: { mutationKey: GRAMMAR_CHECK_KEY },
		select: (item) => item.state.error,
	})
	const error = (errors.at(-1) ?? null) as Error | null

	return {
		runCheck: mutation.mutate,
		isRunning,
		error: isRunning ? null : error,
		canRun: !isRunning && hasContent,
	}
}
