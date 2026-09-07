import type { JSONContent } from '@tiptap/core'
import { prosemirrorToYXmlFragment } from 'y-prosemirror'
import * as Y from 'yjs'
import { LOCAL_ORIGIN, tabsRoot } from '@/features/sessions/ydoc'
import { fragmentToJSON, furnitureSchema, lineToJSON } from './furniture-schema'
import {
	type FurnitureSlot,
	type FurnitureVariant,
	normalizePageFurniture,
	type PageFurniture,
} from './model'

/**
 * Persistensi perabot halaman pada meta tab — kunci sendiri di samping
 * `pageSetup`, supaya pembaca dan penulisnya tidak perlu menyentuh
 * fungsi tata letak yang sudah ada.
 */
const KEY = 'pageFurniture'

/** Diekspor agar penyusun/penerapan `TabLayout` tidak menduplikasi nama kuncinya. */
export const PAGE_FURNITURE_KEY = KEY

/* Isi kaya (T5): Y.Map berisi maksimal 6 Y.XmlFragment (2 slot × 3 varian),
 * dibuat saat pertama kali dipakai. Kunci `header:default` dst. */
const FRAGMENTS_KEY = 'pageFurnitureFragments'

/** Kunci meta tab tempat peta fragmen hidup — dipakai hook isi kaya juga. */
export const PAGE_FURNITURE_FRAGMENTS_KEY = FRAGMENTS_KEY

export const FURNITURE_SLOTS: FurnitureSlot[] = ['header', 'footer']
export const FURNITURE_VARIANTS: FurnitureVariant[] = ['default', 'first', 'even']

export interface FurnitureSlotVariant {
	slot: FurnitureSlot
	variant: FurnitureVariant
}

export function furnitureFragmentKey({ slot, variant }: FurnitureSlotVariant): string {
	return `${slot}:${variant}`
}

function fragmentsMap(doc: Y.Doc, tabId: string, create: false): Y.Map<unknown> | null
function fragmentsMap(doc: Y.Doc, tabId: string, create: true): Y.Map<unknown>
function fragmentsMap(doc: Y.Doc, tabId: string, create: boolean): Y.Map<unknown> | null {
	const entry = tabsRoot(doc).meta.get(tabId)
	if (!(entry instanceof Y.Map)) return null
	const existing = entry.get(FRAGMENTS_KEY)
	if (existing instanceof Y.Map) return existing
	if (!create) return null
	const map = new Y.Map()
	doc.transact(() => entry.set(FRAGMENTS_KEY, map), LOCAL_ORIGIN)
	return map
}

export function readFurnitureFragment(
	doc: Y.Doc,
	tabId: string,
	target: FurnitureSlotVariant,
): Y.XmlFragment | null {
	const map = fragmentsMap(doc, tabId, false)
	const fragment = map?.get(furnitureFragmentKey(target))
	return fragment instanceof Y.XmlFragment ? fragment : null
}

/** Varian yang punya fragmen isi kaya (kosong pun dihitung — hadir = aktif). */
export function readFurnitureFragmentVariants(doc: Y.Doc, tabId: string): FurnitureSlotVariant[] {
	const map = fragmentsMap(doc, tabId, false)
	if (!map) return []
	const out: FurnitureSlotVariant[] = []
	for (const slot of FURNITURE_SLOTS) {
		for (const variant of FURNITURE_VARIANTS) {
			if (map.get(furnitureFragmentKey({ slot, variant })) instanceof Y.XmlFragment) {
				out.push({ slot, variant })
			}
		}
	}
	return out
}

/** Isi kaya sebagai JSON — untuk ekspor DOCX. */
export function readFurnitureContentJson(
	doc: Y.Doc,
	tabId: string,
): Partial<Record<FurnitureSlot, Partial<Record<FurnitureVariant, JSONContent[]>>>> | null {
	const map = fragmentsMap(doc, tabId, false)
	if (!map) return null
	const out: Partial<Record<FurnitureSlot, Partial<Record<FurnitureVariant, JSONContent[]>>>> = {}
	let any = false
	for (const [key, value] of map.entries()) {
		if (!(value instanceof Y.XmlFragment)) continue
		const [slot, variant] = key.split(':')
		if (!FURNITURE_SLOTS.includes(slot as FurnitureSlot)) continue
		if (!FURNITURE_VARIANTS.includes(variant as FurnitureVariant)) continue
		const blocks = fragmentToJSON(value)
		if (blocks.length === 0) continue
		const slotMap = out[slot as FurnitureSlot] ?? {}
		slotMap[variant as FurnitureVariant] = blocks
		out[slot as FurnitureSlot] = slotMap
		any = true
	}
	return any ? out : null
}

/**
 * Ambil fragmen sebuah slot+varian, buat bila belum ada. Fragmen baru dari
 * dokumen lama diisi migrasi baris `pageFurniture` yang ada — jadi hasil impor
 * DOCX dan dokumen sebelum fitur ini langsung bisa disunting kaya.
 */
export function ensureFurnitureFragment(
	doc: Y.Doc,
	tabId: string,
	target: FurnitureSlotVariant,
): Y.XmlFragment {
	const map = fragmentsMap(doc, tabId, true)
	const key = furnitureFragmentKey(target)
	const existing = map.get(key)
	if (existing instanceof Y.XmlFragment) return existing

	const fragment = new Y.XmlFragment()
	const legacy = normalizePageFurniture(tabsRoot(doc).meta.get(tabId)?.get(KEY))?.[target.slot]?.[
		target.variant
	]
	doc.transact(() => {
		map.set(key, fragment)
		if (legacy) {
			const node = furnitureSchema().nodeFromJSON({
				type: 'doc',
				content: [lineToJSON(legacy)],
			})
			prosemirrorToYXmlFragment(node, fragment)
		}
	}, LOCAL_ORIGIN)
	return fragment
}

/** Tulis isi JSON ke fragmen (impor DOCX); membuat bila belum ada. */
export function setFurnitureFragment(
	doc: Y.Doc,
	tabId: string,
	target: FurnitureSlotVariant,
	content: JSONContent,
): void {
	const fragment = ensureFurnitureFragment(doc, tabId, target)
	const node = furnitureSchema().nodeFromJSON(content)
	doc.transact(() => {
		if (fragment.length > 0) fragment.delete(0, fragment.length)
		prosemirrorToYXmlFragment(node, fragment)
	}, LOCAL_ORIGIN)
}

/** Hapus fragmen beberapa slot+varian (mematikan varian itu). */
export function removeFurnitureFragments(doc: Y.Doc, tabId: string, targets: FurnitureSlotVariant[]): void {
	const map = fragmentsMap(doc, tabId, false)
	if (!map) return
	doc.transact(() => {
		for (const target of targets) {
			const key = furnitureFragmentKey(target)
			if (map.get(key) !== undefined) map.delete(key)
		}
	}, LOCAL_ORIGIN)
}

/** Buat fragmen kosong untuk beberapa varian (mengaktifkannya tanpa isi). */
export function createEmptyFurnitureFragments(
	doc: Y.Doc,
	tabId: string,
	targets: FurnitureSlotVariant[],
): void {
	for (const target of targets) ensureFurnitureFragment(doc, tabId, target)
}

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
