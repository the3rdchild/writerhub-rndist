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

/**
 * Input mutation grammar check. `selectionOffset` = 0 berarti seluruh dokumen;
 * > 0 berarti `text` adalah potongan yang terseleksi, dimulai pada offset itu
 * di dalam dokumen penuh - offset setiap suggestion digeser dengannya.
 */
interface GrammarCheckVars {
	text: string
	file: File | null
	title: string
	model: GrammarModel
	selectionOffset: number
	language: string
	/** Tautan tab cloud untuk Aktivitas AI; tab lokal-saja: undefined. */
	tabId?: string
}

/** Seleksi sebagai input grammar check: teks potongan + posisinya di dokumen. */
export interface GrammarCheckScope {
	text: string
	offset: number
}

/**
 * Menjalankan satu siklus grammar check: submit → ikuti SSE → tulis hasil ke
 * state dokumen.
 *
 * Dimodelkan sebagai mutation karena ini aksi yang dipicu pengguna, bukan data
 * yang bisa di-cache: hasilnya langsung menjadi milik dokumen dan pengguna
 * mengubahnya lewat accept/dismiss.
 *
 * Status dibaca lewat `useIsMutating`/`useMutationState`, bukan dari objek
 * mutation lokal, supaya setiap pemanggil hook ini melihat keadaan yang sama -
 * editor dan panel proofreader sama-sama menampilkan progres yang sedang jalan
 * meski tombolnya cuma ada di panel.
 */
export function useGrammarCheck() {
	const { state, dispatch, hasContent } = useDocument()
	const language = useDocumentLanguage()
	const { linkage } = useSync()
	const { activeId } = useSessions()

	/** AbortController untuk pemeriksaan yang sedang berjalan (§P7 lapis A).
	 *  Mutation TanStack tidak menyodorkan signal sendiri, jadi ia dikelola di sini. */
	const abortRef = useRef<AbortController | null>(null)

	/** jobId pemeriksaan berjalan - untuk membatalkan di server (§P7 lapis B). */
	const jobIdRef = useRef<string | null>(null)

	const mutation = useMutation({
		mutationKey: GRAMMAR_CHECK_KEY,
		mutationFn: async (vars: GrammarCheckVars) => {
			// Mode seleksi: potongan teks, tanpa file - file berlaku hanya untuk
			// seluruh dokumen.
			const { jobId } = await submitGrammarCheck({
				text: vars.text,
				file: vars.selectionOffset > 0 ? null : vars.file,
				title: vars.title,
				model: vars.model,
				language: vars.language,
				tabId: vars.tabId,
			})
			jobIdRef.current = jobId

			// Offset suggestion dari worker relatif terhadap teks yang diperiksa;
			// geser ke posisinya di dokumen penuh kalau ini hanya sebuah potongan.
			const shift = (suggestion: GrammarSuggestion): GrammarSuggestion =>
				vars.selectionOffset > 0
					? { ...suggestion, offset: (suggestion.offset ?? 0) + vars.selectionOffset }
					: suggestion

			// Satu controller per pemeriksaan; disimpan di ref supaya cancel()
			// bisa membatalkannya (§P7 lapis A).
			const controller = new AbortController()
			abortRef.current = controller
			try {
				return await streamGrammarCheck(jobId, {
					timeoutMs: streamTimeoutFor(vars.model),
					signal: controller.signal,
					// Tampilkan suggestion sementara selagi checker masih berjalan.
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
				// extractedText menggantikan seluruh teks (mode unggah). Mode seleksi
				// memeriksa bagian saja, jadi tidak boleh menggantikan apa pun.
				extractedText: vars.selectionOffset > 0 ? null : state.file ? result.original_text : null,
			})
		},
	})

	/**
	 * Jalankan pemeriksaan. Tanpa argumen: seluruh dokumen. Dengan `scope`:
	 * hanya teks terseleksi, dan offset setiap suggestion digeser supaya
	 * mendarat di posisi aslinya di dokumen.
	 */
	const runCheck = useCallback(
		(scope?: GrammarCheckScope) => {
			// Tier standard/advanced berdiri di atas model POS dan daftar kata bahasa
			// Inggris, jadi naskah bahasa lain harus lewat tier AI - kalau tidak,
			// hasilnya bukan sekadar sedikit, melainkan menyesatkan.
			const model = language.needsAiTier ? 'ai' : state.model

			// Tautan tab cloud untuk Aktivitas AI; tab lokal-saja: undefined.
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
		[mutation, state.text, state.file, state.title, state.model, language.needsAiTier, language.code, linkage, activeId],
	)

	const isRunning = useIsMutating({ mutationKey: GRAMMAR_CHECK_KEY }) > 0

	const errors = useMutationState({
		filters: { mutationKey: GRAMMAR_CHECK_KEY },
		select: (item) => item.state.error,
	})
	const error = (errors.at(-1) ?? null) as Error | null

	/**
	 * Batalkan pemeriksaan yang sedang berjalan (§P7 lapis A). Memutus stream
	 * SSE dan mengatur ulang mutation, jadi panel kembali ke keadaan siap tanpa
	 * menampilkan error - pembatalan bukan kegagalan.
	 */
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
		/** Tier yang dipilih pengguna diabaikan karena bahasanya bukan Inggris. */
		forcedAiTier: language.needsAiTier && state.model !== 'ai',
	}
}
