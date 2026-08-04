'use client'

import { useMemo } from 'react'
import { useSessions } from '@/features/sessions/session-context'
import { useDocument } from './document-context'
import { detectLanguage, languageLabel, requiresAiTier } from './language'

/** Cuplikan yang dipakai menebak bahasa. */
const SAMPLE_LENGTH = 2_000

export interface DocumentLanguage {
	code: string
	label: string
	/** Pengguna memilihnya sendiri, bukan hasil tebakan. */
	overridden: boolean
	/** Tebakannya lemah - UI menyarankan pengguna memilih sendiri. */
	uncertain: boolean
	/** Tier standard/advanced tidak mendukung bahasa ini. */
	needsAiTier: boolean
	setLanguage: (code: string | null) => void
}

/**
 * Bahasa yang berlaku untuk dokumen ini: pilihan pengguna kalau ada, tebakan
 * kalau tidak.
 *
 * Hanya cuplikan awal naskah yang diperiksa. Deteksi berjalan tiap kali teks
 * berubah, dan memindai seluruh dokumen pada tiap ketikan jauh lebih mahal
 * daripada nilainya - dua ribu karakter pertama sudah lebih dari cukup untuk
 * menebak bahasa, dan mengetik di halaman kesepuluh tidak lagi memicu apa pun.
 */
export function useDocumentLanguage(): DocumentLanguage {
	const { state } = useDocument()
	const { languageOverride, setLanguageOverride } = useSessions()

	const sample = state.text.slice(0, SAMPLE_LENGTH)
	const detected = useMemo(() => detectLanguage(sample), [sample])

	const code = languageOverride ?? detected.code

	return {
		code,
		label: languageOverride ? languageLabel(languageOverride) : detected.label,
		overridden: languageOverride !== null,
		uncertain: languageOverride === null && !detected.confident,
		needsAiTier: requiresAiTier(code),
		setLanguage: setLanguageOverride,
	}
}
