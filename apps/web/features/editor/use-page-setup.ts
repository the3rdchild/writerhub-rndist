'use client'

import { useCallback, useEffect, useState } from 'react'
import * as Y from 'yjs'
import {
	DEFAULT_PAGE_SETUP,
	type PageMargins,
	type PageOrientation,
	type PageSizeId,
	type PageSetup,
} from '@/features/editor/page-geometry'
import { useSettings } from '@/features/settings/settings-context'
import {
	migratePageSetup,
	resolvePageSetup,
	setPageSetupForDoc,
	setPageSetupForTab,
} from '@/features/sessions/ydoc'
import { useSessions } from '@/features/sessions/session-context'

/**
 * Tata letak halaman yang berlaku untuk tab aktif.
 *
 * Sumbernya Y.Doc (milik naskah), bukan preferensi pemakai - keputusan §2.1
 * PRD EDITOR-AI-UPGRADE: dokumen yang dibagikan tidak boleh tampil beda ukuran
 * pada dua perangkat. Resolusi: `tab.pageSetup ?? doc.pageSetup ?? bawaan pemakai`.
 *
 * Migrasi: dokumen lama (sebelum fitur ini) belum punya `DocMeta.pageSetup`.
 * Begitu dimuat dan ternyata kosong, diisi sekali dari bawaan pemakai, supaya
 * tidak ada dokumen yang tiba-tiba berganti tata letak. check-then-set di dalam
 * satu transaksi menjaganya aman walau dua tab browser membuka dokumen yang sama.
 */
export function usePageSetup(): {
	setup: PageSetup
	/** Ganti tata letak. scope 'document' menyamaratak semua tab; 'tab' hanya aktif. */
	setPageSetup: (setup: PageSetup, scope: 'document' | 'tab') => void
} {
	const { doc, activeTabId, activeDocId, hydrated } = useSessions()
	const { settings } = useSettings()

	const compute = useCallback((): PageSetup => {
		if (!activeTabId) return settings.defaultPageSetup
		return resolvePageSetup(doc, activeTabId, settings.defaultPageSetup)
	}, [doc, activeTabId, settings.defaultPageSetup])

	const [setup, setSetup] = useState<PageSetup>(compute)

	// Hitung ulang tiap kali tab/dokumen/bawaan berganti.
	useEffect(() => {
		setSetup(compute())
	}, [compute])

	// Migrasi sekali jalan untuk dokumen lama (field pageSetup belum ada).
	useEffect(() => {
		if (!hydrated || !activeDocId) return
		migratePageSetup(doc, activeDocId, settings.defaultPageSetup)
	}, [hydrated, activeDocId, doc, settings.defaultPageSetup])

	// Reaktif terhadap perubahan tata letak dari sumber lain (ruler, tab lain,
	// tab browser kedua lewat BroadcastChannel). Wadah meta diamati langsung.
	useEffect(() => {
		if (!activeTabId) return
		const tabsMeta = doc.getMap('tabs').get('meta') as Y.Map<Y.Map<unknown>> | undefined
		const docsMeta = doc.getMap('docs').get('meta') as Y.Map<Y.Map<unknown>> | undefined

		const observe = () => setSetup(compute())
		tabsMeta?.observeDeep(observe)
		docsMeta?.observeDeep(observe)
		return () => {
			tabsMeta?.unobserveDeep(observe)
			docsMeta?.unobserveDeep(observe)
		}
	}, [doc, activeTabId, compute])

	const setPageSetup = useCallback(
		(next: PageSetup, scope: 'document' | 'tab') => {
			if (scope === 'document' && activeDocId) setPageSetupForDoc(doc, activeDocId, next)
			else if (scope === 'tab' && activeTabId) setPageSetupForTab(doc, activeTabId, next)
		},
		[doc, activeDocId, activeTabId],
	)

	return { setup, setPageSetup }
}

/**
 * Bentuk ringkas tata letak dari field Settings lama - dipakai migrasi awal
 * agar dokumen lama mewarisi apa yang dulu dipakai pengguna secara global.
 */
export function pageSetupFromLegacy(
	size: PageSizeId,
	orientation: PageOrientation,
	margins: PageMargins,
): PageSetup {
	return { ...DEFAULT_PAGE_SETUP, size, orientation, margins }
}
