'use client'

import * as Y from 'yjs'
import type { CommentThread } from './types'

/**
 * Bentuk dokumen di dalam Y.Doc.
 *
 * ```
 * Y.Doc
 * ├── Y.Map('tabs')
 * │   ├── 'order': Y.Array<string>          urutan tampil
 * │   └── 'meta':  Y.Map<tabId, Y.Map>      judul, ikon, bahasa, komentar
 * └── Y.XmlFragment(tabId)                  naskah tiap tab
 * ```
 *
 * Id tab sekaligus jadi nama fragmennya - tidak ada field penunjuk terpisah,
 * jadi tidak ada kemungkinan keduanya berselisih.
 *
 * Yang TIDAK ada di sini sama pentingnya dengan yang ada. Tab yang sedang
 * dibuka, daftar isi yang sedang terbuka, dan hasil pemeriksaan AI adalah milik
 * satu pemakai, bukan milik naskahnya: begitu dokumen ini dibagikan, menaruhnya
 * di sini berarti Proofreader yang dijalankan satu orang muncul di layar semua
 * orang, dan tab yang dia buka ikut memindahkan layar temannya. Semua itu
 * disimpan terpisah - lihat `local-view.ts`.
 */

const TABS = 'tabs'
const ORDER = 'order'
const META = 'meta'

/** Asal transaksi untuk perubahan dari sesi ini sendiri. */
export const LOCAL_ORIGIN = 'local'

export interface TabMeta {
	id: string
	title: string
	emoji: string | null
	/** Bahasa pilihan pengguna; null berarti ikut hasil deteksi. */
	language: string | null
	comments: CommentThread[]
	updatedAt: number
}

export function createTabId(): string {
	if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
	return `t_${Date.now()}_${Math.random().toString(36).slice(2)}`
}

interface TabsRoot {
	root: Y.Map<unknown>
	order: Y.Array<string>
	meta: Y.Map<Y.Map<unknown>>
}

/**
 * Wadah tab, dibuat kalau belum ada.
 *
 * Selalu lewat sini, jangan `doc.getMap('tabs').get('order')` langsung: Yjs
 * membuat tipe berbeda untuk nama yang sama kalau dua tempat menebak beda,
 * dan dokumennya baru pecah belakangan saat sudah berisi naskah.
 */
export function tabsRoot(doc: Y.Doc): TabsRoot {
	const root = doc.getMap<unknown>(TABS)

	let order = root.get(ORDER) as Y.Array<string> | undefined
	let meta = root.get(META) as Y.Map<Y.Map<unknown>> | undefined

	if (!order || !meta) {
		doc.transact(() => {
			if (!root.has(ORDER)) root.set(ORDER, new Y.Array<string>())
			if (!root.has(META)) root.set(META, new Y.Map<Y.Map<unknown>>())
		}, LOCAL_ORIGIN)
		order = root.get(ORDER) as Y.Array<string>
		meta = root.get(META) as Y.Map<Y.Map<unknown>>
	}

	return { root, order, meta }
}

/** Naskah satu tab. Id tab adalah nama fragmennya. */
export function tabFragment(doc: Y.Doc, id: string): Y.XmlFragment {
	return doc.getXmlFragment(id)
}

function readMeta(meta: Y.Map<Y.Map<unknown>>, id: string): TabMeta {
	const entry = meta.get(id)
	return {
		id,
		title: (entry?.get('title') as string) ?? 'Untitled document',
		emoji: (entry?.get('emoji') as string | null) ?? null,
		language: (entry?.get('language') as string | null) ?? null,
		comments: (entry?.get('comments') as CommentThread[]) ?? [],
		updatedAt: (entry?.get('updatedAt') as number) ?? 0,
	}
}

/**
 * Beberapa kata pertama naskah, untuk menamai tab yang belum diberi judul.
 *
 * Dibaca dari delta-nya, bukan `toString()`: yang terakhir mengembalikan XML
 * lengkap dengan tag penanda tebal dan miring, dan nama tab bukan tempat untuk
 * `<strong>`.
 */
export function tabPreview(doc: Y.Doc, id: string, limit = 64): string {
	const pieces: string[] = []
	let total = 0

	const walk = (node: Y.XmlElement | Y.XmlText | Y.XmlHook | Y.XmlFragment): void => {
		if (total >= limit) return

		if (node instanceof Y.XmlText) {
			for (const part of node.toDelta() as Array<{ insert?: unknown }>) {
				if (typeof part.insert !== 'string') continue
				pieces.push(part.insert)
				total += part.insert.length
				if (total >= limit) return
			}
			return
		}

		if (node instanceof Y.XmlElement || node instanceof Y.XmlFragment) {
			for (const child of node.toArray()) {
				walk(child)
				if (total >= limit) return
			}
			// Batas blok jadi spasi supaya dua paragraf tidak menyatu jadi satu kata.
			pieces.push(' ')
		}
	}

	walk(doc.getXmlFragment(id))
	return pieces.join('').replace(/\s+/g, ' ').trim().slice(0, limit)
}

/** Tandai tab baru saja disunting. Dipakai daftar "dokumen terakhir". */
export function touchTab(doc: Y.Doc, id: string): void {
	updateTab(doc, id, { updatedAt: Date.now() })
}

/** Semua tab menurut urutan tampilnya. */
export function readTabs(doc: Y.Doc): TabMeta[] {
	const { order, meta } = tabsRoot(doc)
	return order
		.toArray()
		.filter((id) => meta.has(id))
		.map((id) => readMeta(meta, id))
}

export function createTab(doc: Y.Doc, title = 'Untitled document', atIndex?: number): string {
	const { order, meta } = tabsRoot(doc)
	const id = createTabId()

	doc.transact(() => {
		const entry = new Y.Map<unknown>()
		entry.set('title', title)
		entry.set('emoji', null)
		entry.set('language', null)
		entry.set('comments', [])
		entry.set('updatedAt', Date.now())
		meta.set(id, entry)
		order.insert(atIndex ?? order.length, [id])
		// Fragmennya didaftarkan sekarang juga supaya tab kosong tetap ada
		// wujudnya di dokumen, bukan baru lahir saat huruf pertama diketik.
		doc.getXmlFragment(id)
	}, LOCAL_ORIGIN)

	return id
}

/**
 * Isi tab dihapus bersama metanya.
 *
 * ferdocs menyimpan naskahnya (soft-delete) untuk undo yang belum ada. Di sini
 * dialog konfirmasi sudah berdiri di depan tombolnya, jadi menyimpan naskah
 * yang tidak bisa dipanggil kembali hanya berarti berkas yang membengkak diam-
 * diam.
 */
export function deleteTab(doc: Y.Doc, id: string): void {
	const { order, meta } = tabsRoot(doc)

	doc.transact(() => {
		const at = order.toArray().indexOf(id)
		if (at !== -1) order.delete(at, 1)
		meta.delete(id)

		const fragment = doc.getXmlFragment(id)
		if (fragment.length > 0) fragment.delete(0, fragment.length)
	}, LOCAL_ORIGIN)
}

export function updateTab(
	doc: Y.Doc,
	id: string,
	patch: Partial<Omit<TabMeta, 'id'>>,
): void {
	const { meta } = tabsRoot(doc)

	doc.transact(() => {
		const entry = meta.get(id)
		if (!entry) return
		for (const [key, value] of Object.entries(patch)) entry.set(key, value)
	}, LOCAL_ORIGIN)
}

/** Pindahkan tab ke posisi tab lain; sisanya bergeser. */
export function moveTab(doc: Y.Doc, movedId: string, destId: string): void {
	if (movedId === destId) return
	const { order } = tabsRoot(doc)

	doc.transact(() => {
		const ids = order.toArray()
		const from = ids.indexOf(movedId)
		const to = ids.indexOf(destId)
		if (from === -1 || to === -1) return

		order.delete(from, 1)
		order.insert(to, [movedId])
	}, LOCAL_ORIGIN)
}

/**
 * Salin isi satu fragmen ke fragmen lain.
 *
 * Lewat `clone()` milik Yjs, bukan lewat HTML: memutar naskah melalui teks
 * berarti menyerahkannya pada parser sekali lagi, dan yang tidak terbaca di
 * situ hilang tanpa suara.
 */
function cloneFragment(source: Y.XmlFragment, target: Y.XmlFragment): void {
	// XmlHook tidak ikut: TipTap tidak pernah membuatnya, dan fragmen memang
	// tidak menerimanya sebagai anak.
	const copies = source
		.toArray()
		.map((node) =>
			node instanceof Y.XmlElement || node instanceof Y.XmlText ? node.clone() : null,
		)
		.filter((node): node is Y.XmlElement | Y.XmlText => node !== null)

	target.insert(target.length, copies)
}

export function duplicateTab(doc: Y.Doc, id: string): string | null {
	const { order, meta } = tabsRoot(doc)
	const source = meta.get(id)
	if (!source) return null

	const at = order.toArray().indexOf(id)
	const copyId = createTabId()

	doc.transact(() => {
		const entry = new Y.Map<unknown>()
		entry.set('title', `${(source.get('title') as string) ?? 'Untitled document'} (salinan)`)
		entry.set('emoji', source.get('emoji') ?? null)
		entry.set('language', source.get('language') ?? null)
		// Komentar tidak ikut: jangkarnya adalah mark bernama sama di dalam
		// naskah, dan dua tab yang memakai id jangkar yang sama membuat satu
		// utas muncul di dua naskah sekaligus.
		entry.set('comments', [])
		entry.set('updatedAt', Date.now())
		meta.set(copyId, entry)
		order.insert(at === -1 ? order.length : at + 1, [copyId])
		cloneFragment(doc.getXmlFragment(id), doc.getXmlFragment(copyId))
	}, LOCAL_ORIGIN)

	return copyId
}

export function readComments(doc: Y.Doc, id: string): CommentThread[] {
	const { meta } = tabsRoot(doc)
	return (meta.get(id)?.get('comments') as CommentThread[]) ?? []
}

export function writeComments(doc: Y.Doc, id: string, comments: CommentThread[]): void {
	updateTab(doc, id, { comments })
}
