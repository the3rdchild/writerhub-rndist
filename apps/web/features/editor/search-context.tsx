'use client'

import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { usePanels } from '@/features/analysis/panel-context'
import { useEditorInstance } from '@/features/editor/editor-context'
import { type SearchControls, useSearchControls } from '@/features/editor/use-search-controls'
import { useVersionMode } from '@/features/versions/version-context'

/**
 * Satu pencarian, dua wajah.
 *
 * Bilah ringkas melayang di atas naskah - cepat, tapi ia menutupi teks, dan itu
 * hanya sepadan untuk "cari, Enter beberapa kali, Esc". Wajah lengkapnya adalah
 * panel di rail kanan: panel tidak pernah menimpa naskah karena ia menyempitkan
 * kertas, dan di sana muat daftar hasil beserta nomor halamannya.
 *
 * Keduanya tidak pernah hidup bersamaan, dan yang menentukan panelnya terbuka
 * bukan state di sini melainkan `activePanel === 'search'` - satu sumber
 * kebenaran, jadi menutup panel lewat tombol X-nya, lewat ikon rail, atau
 * dengan membuka panel lain semuanya bermuara ke tempat yang sama tanpa perlu
 * disalin ulang.
 */
interface SearchContextValue {
	/** Bilah ringkasnya sedang tampil. */
	barOpen: boolean
	/** Panel rail-nya sedang tampil. */
	panelOpen: boolean
	/** Pencarian sedang hidup - dipakai rail untuk memunculkan pulau kontekstualnya. */
	live: boolean
	/* Naik tiap kali pencarian dibuka - termasuk saat sudah terbuka, supaya
	   menekan pintasannya lagi mengembalikan kursor ke kolom carinya. */
	focusTick: number
	controls: SearchControls
	openSearch: () => void
	openPanelSearch: () => void
	closeSearch: () => void
}

const SearchContext = createContext<SearchContextValue | null>(null)

export function SearchProvider({ children }: { children: ReactNode }) {
	const { activePanel, setActivePanel } = usePanels()
	const { editor } = useEditorInstance()
	const { versionMode } = useVersionMode()
	const [barOpen, setBarOpen] = useState(false)
	const [focusTick, setFocusTick] = useState(0)

	const panelOpen = activePanel === 'search'
	/* Riwayat versi memakai tampilannya sendiri dan tidak ada yang bisa disunting
	 * di sana - pencariannya ikut mati, bukan mengambang di atas naskah beku. */
	const live = (barOpen || panelOpen) && versionMode === null && editor !== null
	const controls = useSearchControls(editor, live)

	const openSearch = useCallback(() => {
		/* Panelnya sudah terbuka: pintasan yang sama cukup mengembalikan fokus ke
		 * sana, bukan menumpuk bilah di atasnya. */
		if (!panelOpen) setBarOpen(true)
		setFocusTick((tick) => tick + 1)
	}, [panelOpen])

	const openPanelSearch = useCallback(() => {
		setActivePanel('search')
		setBarOpen(false)
		setFocusTick((tick) => tick + 1)
	}, [setActivePanel])

	const closeSearch = useCallback(() => {
		setBarOpen(false)
		if (panelOpen) setActivePanel(null)
	}, [panelOpen, setActivePanel])

	useEffect(
		function keepOneFaceAtATime() {
			/* Panel bisa dibuka dari luar konteks ini juga - ikon rail dan menu
			 * Tools memanggil `setActivePanel` langsung - jadi bilahnya ditutup di
			 * sini, bukan di tiap pemanggil. */
			if (panelOpen && barOpen) setBarOpen(false)
		},
		[panelOpen, barOpen],
	)

	useEffect(
		function closeInVersionMode() {
			if (versionMode === null) return
			if (barOpen) setBarOpen(false)
			if (panelOpen) setActivePanel(null)
		},
		[versionMode, barOpen, panelOpen, setActivePanel],
	)

	const value = useMemo<SearchContextValue>(
		() => ({
			barOpen: barOpen && live,
			panelOpen,
			live,
			focusTick,
			controls,
			openSearch,
			openPanelSearch,
			closeSearch,
		}),
		[barOpen, live, panelOpen, focusTick, controls, openSearch, openPanelSearch, closeSearch],
	)

	return <SearchContext.Provider value={value}>{children}</SearchContext.Provider>
}

export function useSearch(): SearchContextValue {
	const context = useContext(SearchContext)
	if (!context) throw new Error('useSearch harus dipakai di dalam <SearchProvider>')
	return context
}
