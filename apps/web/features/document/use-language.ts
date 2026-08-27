'use client'

import { useMemo } from 'react'
import { useSessions } from '@/features/sessions/session-context'
import { useDocument } from './document-context'
import { detectLanguage, languageLabel, requiresAiTier } from './language'

const SAMPLE_LENGTH = 2_000

export interface DocumentLanguage {
	code: string
	label: string
	overridden: boolean
	uncertain: boolean
	needsAiTier: boolean
	setLanguage: (code: string | null) => void
}

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
