'use client'

import type { Editor } from '@tiptap/react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
	DEFAULT_SEARCH_MODIFIERS,
	type SearchAndReplaceStorage,
	type SearchModifiers,
	type SearchResult,
} from '@/features/editor/search-replace'

export interface SearchControls {
	search: string
	setSearch: (value: string) => void
	replace: string
	setReplace: (value: string) => void
	modifiers: SearchModifiers
	toggleModifier: (key: keyof SearchModifiers) => void
	results: readonly SearchResult[]
	/** Indeks hasil aktif, 0-based - `-1` kalau belum ada hasil sama sekali. */
	activeIndex: number
	invalidRegex: boolean
	goNext: () => void
	goPrevious: () => void
	goToResult: (index: number) => void
	runReplace: () => void
	runReplaceAll: () => void
}

const EMPTY: readonly SearchResult[] = []

/**
 * Kata kunci dan saklarnya hidup di React, hasilnya hidup di storage ekstensi.
 * Hook ini yang menjaga keduanya sejalan - dan ia sengaja dipakai satu kali
 * saja, di provider, supaya bilah ringkas dan panel rail membaca pencarian yang
 * sama persis alih-alih dua pencarian yang kebetulan mirip.
 */
export function useSearchControls(editor: Editor | null, active: boolean): SearchControls {
	const [search, setSearch] = useState('')
	const [replace, setReplace] = useState('')
	const [modifiers, setModifiers] = useState<SearchModifiers>(DEFAULT_SEARCH_MODIFIERS)
	const [results, setResults] = useState<readonly SearchResult[]>(EMPTY)
	const [activeIndex, setActiveIndex] = useState(-1)
	const [invalidRegex, setInvalidRegex] = useState(false)

	useEffect(
		function pushSearchTerm() {
			if (!editor) return
			/* Pencarian yang tertutup tidak boleh meninggalkan sorotan di naskah -
			 * kata kuncinya tetap disimpan di React supaya kembali utuh saat dibuka. */
			if (!active) {
				editor.commands.setSearchTerm('')
				return
			}
			/* Satu rantai, satu transaksi: tiap transaksi memicu satu penyisiran
			 * dokumen, dan tiap ketikan tidak perlu tiga kali.
			 * Kata kunci atau saklarnya berubah berarti daftar hasilnya lain sama
			 * sekali - mulai lagi dari hasil pertama, bukan dari indeks lama. */
			editor.chain().resetIndex().setSearchOptions(modifiers).setSearchTerm(search).run()
		},
		[editor, active, search, modifiers],
	)

	useEffect(
		function pushReplaceTerm() {
			editor?.commands.setReplaceTerm(replace)
		},
		[editor, replace],
	)

	useEffect(
		function readStorage() {
			if (!editor) return
			const read = () => {
				const storage = (editor.storage as { searchAndReplace?: SearchAndReplaceStorage }).searchAndReplace
				if (!storage) return
				/* Daftar hasil hanya dibuat ulang saat pencariannya benar-benar
				 * dihitung ulang, jadi membandingkan acuannya sudah cukup untuk
				 * menahan render ulang pada tiap transaksi editor. */
				setResults((previous) => (previous === storage.results ? previous : storage.results))
				setActiveIndex(storage.results.length ? storage.resultIndex : -1)
				setInvalidRegex(storage.invalidRegex)
			}
			read()
			editor.on('transaction', read)
			return () => {
				editor.off('transaction', read)
			}
		},
		[editor],
	)

	const toggleModifier = useCallback((key: keyof SearchModifiers) => {
		setModifiers((current) => ({ ...current, [key]: !current[key] }))
	}, [])

	const goNext = useCallback(() => {
		editor?.chain().nextSearchResult().scrollToSearchResult().run()
	}, [editor])

	const goPrevious = useCallback(() => {
		editor?.chain().previousSearchResult().scrollToSearchResult().run()
	}, [editor])

	const goToResult = useCallback(
		(index: number) => {
			editor?.chain().setResultIndex(index).scrollToSearchResult().run()
		},
		[editor],
	)

	const runReplace = useCallback(() => {
		editor?.chain().replace().scrollToSearchResult().run()
	}, [editor])

	const runReplaceAll = useCallback(() => {
		editor?.commands.replaceAll()
	}, [editor])

	return useMemo(
		() => ({
			search,
			setSearch,
			replace,
			setReplace,
			modifiers,
			toggleModifier,
			results,
			activeIndex,
			invalidRegex,
			goNext,
			goPrevious,
			goToResult,
			runReplace,
			runReplaceAll,
		}),
		[
			search,
			replace,
			modifiers,
			toggleModifier,
			results,
			activeIndex,
			invalidRegex,
			goNext,
			goPrevious,
			goToResult,
			runReplace,
			runReplaceAll,
		],
	)
}
