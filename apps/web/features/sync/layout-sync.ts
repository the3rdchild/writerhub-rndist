/**
 * Jembatan antara tata letak di Y.Doc lokal dan kolom `layout` di server
 * (`documents.layout` sebagai dasar, `document_tabs.layout` sebagai penimpa
 * per tab). Semua fungsi di sini murni terhadap Y.Doc yang diberikan supaya
 * putar-baliknya bisa diuji tanpa jaringan - lihat
 * `docs/TEMPLATE-GALLERY-PLAN.md` §7 P1.
 *
 * Perabot halaman hanya punya representasi per tab di Y.Doc - tidak ada
 * pembaca untuk perabot tingkat dokumen - jadi `applyDocLayout` sengaja tidak
 * menerapkannya. Perabot bawaan template karena itu dikirim server sebagai
 * penimpa tab (`apps/api/src/services/templates/layout.ts`), bukan sebagai
 * bagian dasar dokumen.
 *
 * Tipografi tidak begitu: ia punya pembaca di kedua tingkat (`resolveTypography`
 * di `ydoc.ts`), jadi ia ikut di dasar dokumen maupun di penimpa tab.
 */

import type { TabLayout, TabLayoutOverride } from '@writer-hub/shared'
import type * as Y from 'yjs'
import { PAGE_FURNITURE_KEY } from '@/features/editor/page-furniture/page-furniture-ydoc'
import { docsRoot, LOCAL_ORIGIN, readDocs, readTabs, TYPOGRAPHY, tabsRoot } from '@/features/sessions/ydoc'

/** Penimpa yang tersimpan di meta tab: pageSetup milik tab + perabotnya. */
export function readTabLayoutOverride(doc: Y.Doc, tabId: string): TabLayoutOverride | null {
	const meta = readTabs(doc).find((tab) => tab.id === tabId)
	if (!meta) return null

	const entry = tabsRoot(doc).meta.get(tabId)
	const furniture = entry?.get(PAGE_FURNITURE_KEY) as TabLayoutOverride['furniture'] | undefined

	const layout: TabLayoutOverride = {}
	if (meta.pageSetup) layout.pageSetup = meta.pageSetup
	if (furniture) layout.furniture = furniture
	if (meta.typography) layout.typography = meta.typography
	return layout.pageSetup || layout.furniture || layout.typography ? layout : null
}

/** Tata letak dasar dokumen: pageSetup dan tipografi di meta dokumen. */
export function readDocLayout(doc: Y.Doc, docId: string): TabLayout | null {
	const meta = readDocs(doc).find((dok) => dok.id === docId)
	if (!meta?.pageSetup) return null
	return {
		pageSetup: meta.pageSetup,
		...(meta.typography ? { typography: meta.typography } : {}),
	}
}

export function applyDocLayout(
	doc: Y.Doc,
	docId: string,
	layout: TabLayout | null,
	origin: unknown = LOCAL_ORIGIN,
): void {
	doc.transact(() => {
		const entry = docsRoot(doc).meta.get(docId)
		if (!entry) return
		if (layout?.pageSetup) entry.set('pageSetup', layout.pageSetup)
		else if (entry.get('pageSetup') !== undefined) entry.delete('pageSetup')
		if (layout?.typography) entry.set(TYPOGRAPHY, layout.typography)
		else if (entry.get(TYPOGRAPHY) !== undefined) entry.delete(TYPOGRAPHY)
	}, origin)
}

export function applyTabLayout(
	doc: Y.Doc,
	tabId: string,
	layout: TabLayoutOverride | null,
	origin: unknown = LOCAL_ORIGIN,
): void {
	doc.transact(() => {
		const entry = tabsRoot(doc).meta.get(tabId)
		if (!entry) return
		if (layout?.pageSetup) entry.set('pageSetup', layout.pageSetup)
		else if (entry.get('pageSetup') !== undefined) entry.delete('pageSetup')
		if (layout?.furniture) entry.set(PAGE_FURNITURE_KEY, layout.furniture)
		else if (entry.get(PAGE_FURNITURE_KEY) !== undefined) entry.delete(PAGE_FURNITURE_KEY)
		if (layout?.typography) entry.set(TYPOGRAPHY, layout.typography)
		else if (entry.get(TYPOGRAPHY) !== undefined) entry.delete(TYPOGRAPHY)
	}, origin)
}

function stable(value: unknown): string {
	if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? ''
	if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`
	const entries = Object.entries(value as Record<string, unknown>)
		.filter(([, field]) => field !== undefined)
		.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
		.map(([key, field]) => `${JSON.stringify(key)}:${stable(field)}`)
	return `{${entries.join(',')}}`
}

/**
 * Kunci perbandingan yang stabil terhadap urutan properti, untuk mendeteksi
 * perubahan tata letak tanpa peduli bagaimana objeknya dibangun.
 */
export function layoutSyncKey(layout: TabLayout | TabLayoutOverride | null): string {
	return layout ? stable(layout) : ''
}
