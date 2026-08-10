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
			emptyTitle="Terjemahkan naskah"
			emptyDescription="Sorot bagian tertentu untuk menerjemahkan sebagian saja, atau jalankan tanpa seleksi untuk seluruh tab ini."
			runLabel="Terjemahkan"
			rerunLabel="Terjemahkan lagi"
			scopedLabel="Terjemahkan seleksi"
			runningLabel="Menerjemahkan…"
			noChangesLabel={(result) =>
				(result as TranslatorResult).detected_language
					? 'Naskah ini sudah dalam bahasa tujuan'
					: 'Tidak ada yang perlu diterjemahkan'
			}
		/>
	)
}
