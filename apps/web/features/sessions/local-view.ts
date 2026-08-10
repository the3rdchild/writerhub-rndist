'use client'

import type { GrammarScores } from '@writer-hub/shared'
import type { EditorSuggestion } from '@/features/document/suggestions'

/**
 * Keadaan yang milik satu pemakai, bukan milik naskahnya.
 *
 * Dipisah dari Y.Doc dengan sengaja - lihat alasannya di `ydoc.ts`. Begitu
 * dokumen dibagikan, yang ada di sini tetap tinggal di peramban masing-masing:
 * tab yang saya buka tidak memindahkan layar Anda, dan hasil Proofreader yang
 * saya jalankan tidak muncul di naskah Anda sebagai coretan yang tak Anda minta.
 */

export const LOCAL_VIEW_STORAGE_KEY = 'writer-hub-view'

export interface TabViewState {
	/** Daftar isi tab ini sedang terbuka. */
	outlineExpanded: boolean
	suggestions: EditorSuggestion[]
	scores: GrammarScores | null
}

export interface LocalView {
	/** Dokumen yang sedang dibuka. */
	activeDocId: string | null
	/** Tab yang sedang dibuka. */
	activeTabId: string | null
	tabs: Record<string, TabViewState>
}

export const EMPTY_LOCAL_VIEW: LocalView = { activeDocId: null, activeTabId: null, tabs: {} }

export const EMPTY_TAB_VIEW: TabViewState = {
	outlineExpanded: false,
	suggestions: [],
	scores: null,
}

/**
 * Tab aktif menurut catatan tersimpan.
 *
 * Bentuk lama (sebelum tingkat dokumen ada) menyimpannya di field `activeId`;
 * field itu masih terbawa di localStorage pengguna lama, jadi dibaca sebagai
 * cadangan supaya mereka mendarat di naskah yang sama sesudah pembaruan.
 */
export function storedActiveTabId(view: LocalView): string | null {
	return view.activeTabId ?? (view as LocalView & { activeId?: string | null }).activeId ?? null
}

export function tabView(view: LocalView, id: string | null): TabViewState {
	if (!id) return EMPTY_TAB_VIEW
	return view.tabs[id] ?? EMPTY_TAB_VIEW
}

export function patchTabView(
	view: LocalView,
	id: string,
	patch: Partial<TabViewState>,
): LocalView {
	return {
		...view,
		tabs: { ...view.tabs, [id]: { ...tabView(view, id), ...patch } },
	}
}

/**
 * Buang catatan tab yang sudah tidak ada.
 *
 * Tanpa ini berkas penyimpanan hanya bertambah: hasil pemeriksaan tab yang
 * dihapus setahun lalu tetap ikut dimuat tiap kali aplikasi dibuka.
 */
export function pruneTabViews(view: LocalView, existingIds: string[]): LocalView {
	const keep = new Set(existingIds)
	const tabs: Record<string, TabViewState> = {}
	for (const [id, state] of Object.entries(view.tabs)) {
		if (keep.has(id)) tabs[id] = state
	}
	return { ...view, tabs }
}
