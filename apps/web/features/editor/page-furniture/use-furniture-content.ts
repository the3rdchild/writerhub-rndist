'use client'

import { useCallback, useEffect, useState } from 'react'
import * as Y from 'yjs'
import { useSessions } from '@/features/sessions/session-context'
import { tabsRoot } from '@/features/sessions/ydoc'
import { fragmentToHtml } from './furniture-schema'
import type { FurnitureSlot, FurnitureVariant } from './model'
import { furnitureFragmentKey, PAGE_FURNITURE_FRAGMENTS_KEY } from './page-furniture-ydoc'

interface FurnitureContent {
	/** HTML per kunci fragmen; fragmen kosong sengaja tidak masuk. */
	html: Record<string, string>
	/** Kunci fragmen yang ada — termasuk yang kosong (hadir = varian aktif). */
	keys: string[]
}

const EMPTY: FurnitureContent = { html: {}, keys: [] }

/** Sama isinya? Kunci sudah terurut, jadi cukup dibandingkan berpasangan. */
function sameContent(a: FurnitureContent, b: FurnitureContent): boolean {
	if (a.keys.length !== b.keys.length) return false
	if (a.keys.some((key, index) => key !== b.keys[index])) return false
	const keys = Object.keys(a.html)
	if (keys.length !== Object.keys(b.html).length) return false
	return keys.every((key) => a.html[key] === b.html[key])
}

/**
 * Isi kaya header/footer tab aktif sebagai HTML statis (token {page}/{pages}
 * masih apa adanya). Berlangganan meta Y.Doc dengan pola yang sama seperti
 * usePageFurniture — observeDeep menjangkau Y.XmlFragment di dalamnya.
 */
export function useFurnitureContent(): {
	htmlOf: (slot: FurnitureSlot, variant: FurnitureVariant) => string | null
	/** Varian dengan fragmen — termasuk yang masih kosong (hadir = aktif). */
	hasVariant: (slot: FurnitureSlot, variant: FurnitureVariant) => boolean
} {
	const { doc, activeTabId } = useSessions()

	const read = useCallback((): FurnitureContent => {
		if (!activeTabId || typeof document === 'undefined') return EMPTY
		const entry = tabsRoot(doc).meta.get(activeTabId)
		const fragments = entry?.get(PAGE_FURNITURE_FRAGMENTS_KEY)
		if (!(fragments instanceof Y.Map)) return EMPTY

		const html: Record<string, string> = {}
		const keys: string[] = []
		for (const [key, value] of fragments.entries()) {
			if (!(value instanceof Y.XmlFragment)) continue
			keys.push(key)
			const serialized = fragmentToHtml(value)
			if (serialized.trim().length > 0) html[key] = serialized
		}
		keys.sort()
		return { html, keys }
	}, [doc, activeTabId])

	const [state, setState] = useState<FurnitureContent>(read)

	/*
	 * Penjaga identitas, bukan sekadar kerapian.
	 *
	 * `observeDeep` di bawah menyala untuk perubahan APA PUN di meta tab —
	 * pageSetup, tab lain, dan tiap ketukan tombol saat header disunting.
	 * Tanpa perbandingan ini, sekali menyala berarti seluruh fragmen
	 * diserialisasi ulang lalu state diganti objek beridentitas baru, sehingga
	 * perabot di SEMUA lembar ikut dirender ulang meski isinya sama persis —
	 * pada berkas 47 lembar, tiap ketukan tombol.
	 */
	const refresh = useCallback(() => {
		const next = read()
		setState((prev) => (sameContent(prev, next) ? prev : next))
	}, [read])

	useEffect(
		function recomputeOnTabChange() {
			refresh()
		},
		[refresh],
	)

	useEffect(
		function observeFragments() {
			if (!activeTabId) return
			const tabsMeta = tabsRoot(doc).meta
			tabsMeta.observeDeep(refresh)
			return () => {
				tabsMeta.unobserveDeep(refresh)
			}
		},
		[doc, activeTabId, refresh],
	)

	const htmlOf = useCallback(
		(slot: FurnitureSlot, variant: FurnitureVariant) =>
			state.html[furnitureFragmentKey({ slot, variant })] ?? null,
		[state.html],
	)
	const hasVariant = useCallback(
		(slot: FurnitureSlot, variant: FurnitureVariant) =>
			state.keys.includes(furnitureFragmentKey({ slot, variant })),
		[state.keys],
	)

	return { htmlOf, hasVariant }
}
