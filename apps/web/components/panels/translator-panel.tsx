'use client'

import type { TranslatorResult } from '@writer-hub/shared'
import { Languages } from 'lucide-react'
import { ChangeListPanel } from './change-list-panel'

/**
 * Translator: terjemahkan naskah ke bahasa pilihan lewat LLM.
 *
 * Alurnya sama persis dengan AI Rewriter - usulan per kalimat yang bisa
 * diterima satu-satu - jadi seluruh markup dan alur apply-nya dipakai ulang
 * lewat `ChangeListPanel`. Bedanya hanya kendali di kaki panel: bahasa tujuan,
 * bukan tone.
 *
 * Menerjemahkan per rentang teks, bukan menimpa seluruh naskah, membuat format
 * dokumen (heading, tabel, tebal) tetap utuh.
 */
export function TranslatorPanel() {
	return (
		<ChangeListPanel
			feature="translator"
			icon={Languages}
			emptyTitle="Translate your text"
			emptyDescription="Highlight a passage to translate only part of it, or run without a selection for this entire tab."
			runLabel="Translate Text"
			rerunLabel="Translate Again"
			scopedLabel="Translate Selection"
			runningLabel="Translating..."
			noChangesLabel={(result) =>
				(result as TranslatorResult).detected_language
					? 'This document is already in the target language'
					: 'Nothing to translate'
			}
		/>
	)
}
