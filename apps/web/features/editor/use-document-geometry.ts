'use client'

import type { Editor } from '@tiptap/react'
import { useEffect } from 'react'
import type { PageGeometry, PageSetup } from './page-geometry'
import { paginationKey } from './pagination'

/**
 * Mendorong geometri halaman yang berubah ke paginasi.
 *
 * Separuh kedua dari kontrak yang dipegang `DocumentPaper`: kertas mengurus
 * DOM, hook ini mengurus sisi editor. Perlu terpisah karena `extensions` hanya
 * dibangun sekali - geometri yang diberikan saat itu adalah yang pertama, dan
 * setiap perubahan sesudahnya harus lewat meta. Tanpa hook ini tiap pemakai
 * menulis efeknya sendiri, dan yang lupa menulisnya akan memakai lembar milik
 * tab sebelumnya tanpa gejala yang jelas.
 */
export function useDocumentGeometry(
	editor: Editor | null,
	{
		geometry,
		setup,
		pageless,
		breakBeforeLevels,
	}: {
		geometry: PageGeometry
		setup?: PageSetup
		pageless?: boolean
		breakBeforeLevels?: number[]
	},
): void {
	useEffect(
		function pushPageGeometry() {
			if (!editor) return
			const transaction = editor.state.tr.setMeta(paginationKey, {
				geometry,
				setup,
				pageless: pageless ?? setup?.pageless ?? false,
				breakBeforeLevels,
			})
			transaction.setMeta('addToHistory', false)
			editor.view.dispatch(transaction)
		},
		[editor, geometry, setup, pageless, breakBeforeLevels],
	)
}
