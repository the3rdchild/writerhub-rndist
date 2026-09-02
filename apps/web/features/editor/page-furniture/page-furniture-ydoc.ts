import * as Y from 'yjs'
import { LOCAL_ORIGIN, tabsRoot } from '@/features/sessions/ydoc'
import { normalizePageFurniture, type PageFurniture } from './model'

/**
 * Persistensi perabot halaman pada meta tab — kunci sendiri di samping
 * `pageSetup`, supaya pembaca dan penulisnya tidak perlu menyentuh
 * fungsi tata letak yang sudah ada.
 */
const KEY = 'pageFurniture'

/** Diekspor agar penyusun/penerapan `TabLayout` tidak menduplikasi nama kuncinya. */
export const PAGE_FURNITURE_KEY = KEY

export function readPageFurniture(doc: Y.Doc, tabId: string): PageFurniture | null {
	const entry = tabsRoot(doc).meta.get(tabId)
	if (!(entry instanceof Y.Map)) return null
	return normalizePageFurniture(entry.get(KEY))
}

export function setPageFurnitureForTab(doc: Y.Doc, tabId: string, furniture: PageFurniture): void {
	doc.transact(() => {
		tabsRoot(doc).meta.get(tabId)?.set(KEY, furniture)
	}, LOCAL_ORIGIN)
}

export function clearPageFurnitureForTab(doc: Y.Doc, tabId: string): void {
	doc.transact(() => {
		const entry = tabsRoot(doc).meta.get(tabId)
		if (entry instanceof Y.Map && entry.get(KEY) !== undefined) entry.delete(KEY)
	}, LOCAL_ORIGIN)
}
