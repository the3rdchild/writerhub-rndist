'use client'

import * as Y from 'yjs'
import type { CommentThread } from './types'

/**
 * Bentuk dokumen di dalam Y.Doc.
 *
 * ```
 * Y.Doc
 * ├── Y.Map('docs')
 * │   ├── 'order': Y.Array<docId>        urutan tampil dokumen
 * │   └── 'meta':  Y.Map<docId, Y.Map>   judul dokumen + tabOrder + updatedAt
 * ├── Y.Map('tabs')
 * │   └── 'meta':  Y.Map<tabId, Y.Map>   judul, ikon, bahasa, komentar
 * └── Y.XmlFragment(tabId)               naskah tiap tab
 * ```
 *
 * Urutan tab TIDAK lagi global: ia tinggal di `tabOrder` milik masing-masing
 * dokumen. Naskahnya tidak berpindah sama sekali - fragmen tetap bernama id
 * tab, jadi serialisasi, riwayat versi lokal, dan kaitan sync yang bekerja
 * atas tabId tidak perlu tahu bahwa dokumen ada.
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
const DOCS = 'docs'
const ORDER = 'order'
const META = 'meta'
const TAB_ORDER = 'tabOrder'

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

export interface DocMeta {
	id: string
	title: string
	/** Id tab milik dokumen ini, menurut urutan tampilnya. */
	tabOrder: string[]
	updatedAt: number
}

export function createTabId(): string {
	if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
	return `t_${Date.now()}_${Math.random().toString(36).slice(2)}`
}

/** Id dokumen dan tab ditarik dari ruang yang sama - keduanya kunci Y.Map. */
export function createDocId(): string {
	return createTabId()
}

interface TabsRoot {
	root: Y.Map<unknown>
	meta: Y.Map<Y.Map<unknown>>
}

interface DocsRoot {
	root: Y.Map<unknown>
	order: Y.Array<string>
	meta: Y.Map<Y.Map<unknown>>
}

/**
 * Wadah meta tab, dibuat kalau belum ada.
 *
 * Selalu lewat sini, jangan `doc.getMap('tabs').get('meta')` langsung: Yjs
 * membuat tipe berbeda untuk nama yang sama kalau dua tempat menebak beda,
 * dan dokumennya baru pecah belakangan saat sudah berisi naskah.
 *
 * Kunci 'order' yang dulu tinggal di sini sudah pensiun - urutan tab kini
 * milik dokumennya. Sisa lamanya hanya dibaca migrasi (`migrate-to-docs.ts`)
 * lewat `legacyTabOrder`.
 */
export function tabsRoot(doc: Y.Doc): TabsRoot {
	const root = doc.getMap<unknown>(TABS)

	let meta = root.get(META) as Y.Map<Y.Map<unknown>> | undefined

	if (!meta) {
		doc.transact(() => {
			if (!root.has(META)) root.set(META, new Y.Map<Y.Map<unknown>>())
		}, LOCAL_ORIGIN)
		meta = root.get(META) as Y.Map<Y.Map<unknown>>
	}

	return { root, meta }
}

/**
 * Wadah dokumen, dibuat kalau belum ada. Aturan yang sama dengan `tabsRoot`
 * berlaku: selalu lewat sini supaya tidak ada dua tebakan tipe untuk nama
 * yang sama.
 */
export function docsRoot(doc: Y.Doc): DocsRoot {
	const root = doc.getMap<unknown>(DOCS)

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

/**
 * Sisa struktur sebelum dokumen ada: urutan tab global di Y.Map('tabs').
 * Hanya `migrate-to-docs.ts` yang boleh menyentuhnya.
 */
export function legacyTabOrder(doc: Y.Doc): Y.Array<string> | undefined {
	return doc.getMap<unknown>(TABS).get(ORDER) as Y.Array<string> | undefined
}

/**
 * Hapus sisa struktur lama. Dipanggil migrasi SETELAH struktur baru terbaca
 * benar - tidak pernah sebelumnya.
 */
export function clearLegacyTabOrder(doc: Y.Doc): void {
	doc.transact(() => {
		doc.getMap<unknown>(TABS).delete(ORDER)
	}, LOCAL_ORIGIN)
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

function readDocMeta(meta: Y.Map<Y.Map<unknown>>, id: string): DocMeta {
	const entry = meta.get(id)
	const tabOrder = entry?.get(TAB_ORDER) as Y.Array<string> | undefined
	return {
		id,
		title: (entry?.get('title') as string) ?? 'Untitled document',
		tabOrder: tabOrder?.toArray() ?? [],
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

/**
 * Tandai tab baru saja disunting. Dipakai daftar "dokumen terakhir" - waktu
 * sunting dokumen induknya ikut diperbarui, karena daftar itu membaca waktu
 * dari dokumen, bukan dari tab.
 */
export function touchTab(doc: Y.Doc, id: string): void {
	const parentId = findTabDoc(doc, id)
	doc.transact(() => {
		tabsRoot(doc).meta.get(id)?.set('updatedAt', Date.now())
		if (parentId) docsRoot(doc).meta.get(parentId)?.set('updatedAt', Date.now())
	}, LOCAL_ORIGIN)
}

/**
 * Semua tab menurut urutan tampilnya. Dengan `docId`, hanya tab milik dokumen
 * itu. Tanpa `docId`, semua tab lintas dokumen (urutan dokumen, lalu urutan
 * tab di dalamnya); tab yatim yang belum terdaftar di dokumen mana pun ikut
 * dibaca di ujung supaya naskahnya tidak hilang diam-diam dari daftar.
 */
export function readTabs(doc: Y.Doc, docId?: string): TabMeta[] {
	const { meta } = tabsRoot(doc)

	if (docId !== undefined) {
		const entry = docsRoot(doc).meta.get(docId)
		const tabOrder = (entry?.get(TAB_ORDER) as Y.Array<string> | undefined)?.toArray() ?? []
		return tabOrder.filter((id) => meta.has(id)).map((id) => readMeta(meta, id))
	}

	const ordered = readDocs(doc).flatMap((dok) => dok.tabOrder)
	const listed = new Set(ordered)
	const orphans = [...meta.keys()].filter((id) => !listed.has(id))
	return [...ordered, ...orphans]
		.filter((id) => meta.has(id))
		.map((id) => readMeta(meta, id))
}

/** Semua dokumen menurut urutan tampilnya. */
export function readDocs(doc: Y.Doc): DocMeta[] {
	const { order, meta } = docsRoot(doc)
	return order
		.toArray()
		.filter((id) => meta.has(id))
		.map((id) => readDocMeta(meta, id))
}

/** Dokumen yang memiliki tab ini; null bila tabnya yatim. */
export function findTabDoc(doc: Y.Doc, tabId: string): string | null {
	const { order, meta } = docsRoot(doc)
	for (const docId of order.toArray()) {
		const tabOrder = meta.get(docId)?.get(TAB_ORDER) as Y.Array<string> | undefined
		if (tabOrder?.toArray().includes(tabId)) return docId
	}
	return null
}

// ── penulis tingkat rendah; harus dipanggil dari dalam transaksi ────────────

/** Catat meta tab baru dan daftarkan fragmennya. */
function writeTabEntry(doc: Y.Doc, tabId: string, title: string): void {
	const entry = new Y.Map<unknown>()
	entry.set('title', title)
	entry.set('emoji', null)
	entry.set('language', null)
	entry.set('comments', [])
	entry.set('updatedAt', Date.now())
	tabsRoot(doc).meta.set(tabId, entry)
	// Fragmennya didaftarkan sekarang juga supaya tab kosong tetap ada
	// wujudnya di dokumen, bukan baru lahir saat huruf pertama diketik.
	doc.getXmlFragment(tabId)
}

/** Catat meta dokumen baru beserta urutan tab awalnya. */
function writeDocEntry(doc: Y.Doc, docId: string, title: string, tabIds: string[]): void {
	const tabOrder = new Y.Array<string>()
	tabOrder.push(tabIds)
	const entry = new Y.Map<unknown>()
	entry.set('title', title)
	entry.set(TAB_ORDER, tabOrder)
	entry.set('updatedAt', Date.now())
	docsRoot(doc).meta.set(docId, entry)
}

/** Hapus naskah sebuah fragmen; meta dan fragmen kosong dibiarkan tercatat. */
function clearFragment(doc: Y.Doc, tabId: string): void {
	const fragment = doc.getXmlFragment(tabId)
	if (fragment.length > 0) fragment.delete(0, fragment.length)
}

// ── dokumen ──────────────────────────────────────────────────────────────────

/**
 * Dokumen baru, langsung berisi satu tab berjudul sama.
 *
 * Dokumen tidak pernah boleh kosong (lihat `deleteTab`), jadi pembuatannya
 * sekaligus membuat tab pertamanya - dengan begini dokumen kosong tidak
 * pernah ada wujudnya, bahkan sesaat.
 */
export function createDocument(doc: Y.Doc, title = 'Untitled document', atIndex?: number): string {
	const { order } = docsRoot(doc)
	const id = createDocId()

	doc.transact(() => {
		const tabId = createTabId()
		writeDocEntry(doc, id, title, [tabId])
		writeTabEntry(doc, tabId, title)
		order.insert(atIndex ?? order.length, [id])
	}, LOCAL_ORIGIN)

	return id
}

/**
 * Dokumen dihapus beserta seluruh tab dan naskahnya.
 *
 * Catatan tentang soft-delete di `deleteTab` berlaku juga di sini, lebih kuat
 * malah: satu dokumen bisa memuat banyak naskah sekaligus.
 */
export function deleteDocument(doc: Y.Doc, id: string): void {
	doc.transact(() => {
		const docs = docsRoot(doc)
		const entry = docs.meta.get(id)
		if (!entry) return

		const tabOrder = (entry.get(TAB_ORDER) as Y.Array<string> | undefined)?.toArray() ?? []
		const tabs = tabsRoot(doc).meta
		for (const tabId of tabOrder) {
			tabs.delete(tabId)
			clearFragment(doc, tabId)
		}

		docs.meta.delete(id)
		const at = docs.order.toArray().indexOf(id)
		if (at !== -1) docs.order.delete(at, 1)
	}, LOCAL_ORIGIN)
}

export function renameDocument(doc: Y.Doc, id: string, title: string): void {
	const entry = docsRoot(doc).meta.get(id)
	if (!entry) return

	doc.transact(() => {
		entry.set('title', title)
		entry.set('updatedAt', Date.now())
	}, LOCAL_ORIGIN)
}

/** Pindahkan dokumen ke posisi dokumen lain; sisanya bergeser. */
export function moveDocument(doc: Y.Doc, movedId: string, destId: string): void {
	if (movedId === destId) return
	const { order } = docsRoot(doc)

	doc.transact(() => {
		const ids = order.toArray()
		const from = ids.indexOf(movedId)
		const to = ids.indexOf(destId)
		if (from === -1 || to === -1) return

		order.delete(from, 1)
		order.insert(to, [movedId])
	}, LOCAL_ORIGIN)
}

// ── tab ──────────────────────────────────────────────────────────────────────

/** Tab baru di dalam dokumen `docId`; dokumennya harus ada. */
export function createTab(doc: Y.Doc, docId: string, title = 'Untitled document', atIndex?: number): string {
	const entry = docsRoot(doc).meta.get(docId)
	if (!entry) throw new Error(`createTab: dokumen "${docId}" tidak ada`)

	const id = createTabId()

	doc.transact(() => {
		writeTabEntry(doc, id, title)
		const tabOrder = entry.get(TAB_ORDER) as Y.Array<string>
		tabOrder.insert(atIndex ?? tabOrder.length, [id])
		entry.set('updatedAt', Date.now())
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
 *
 * Dokumen tidak boleh kosong: menghapus tab terakhir sebuah dokumen sekaligus
 * menghapus dokumennya.
 */
export function deleteTab(doc: Y.Doc, id: string): void {
	doc.transact(() => {
		const { meta } = tabsRoot(doc)
		meta.delete(id)
		clearFragment(doc, id)

		const parentId = findTabDoc(doc, id)
		if (!parentId) return
		const docs = docsRoot(doc)
		const entry = docs.meta.get(parentId)
		const tabOrder = entry?.get(TAB_ORDER) as Y.Array<string> | undefined
		if (!entry || !tabOrder) return

		const at = tabOrder.toArray().indexOf(id)
		if (at !== -1) tabOrder.delete(at, 1)

		if (tabOrder.length === 0) {
			docs.meta.delete(parentId)
			const docAt = docs.order.toArray().indexOf(parentId)
			if (docAt !== -1) docs.order.delete(docAt, 1)
		} else {
			entry.set('updatedAt', Date.now())
		}
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

/**
 * Pindahkan tab ke posisi tab lain DI DALAM DOKUMEN YANG SAMA; sisanya
 * bergeser. Memindahkan tab antar dokumen sengaja tidak didukung (§11 rencana
 * restrukturisasi) - pemanggil dengan tab beda dokumen diabaikan.
 */
export function moveTab(doc: Y.Doc, movedId: string, destId: string): void {
	if (movedId === destId) return
	const parentId = findTabDoc(doc, destId)
	if (!parentId || findTabDoc(doc, movedId) !== parentId) return

	doc.transact(() => {
		const tabOrder = docsRoot(doc).meta.get(parentId)?.get(TAB_ORDER) as
			| Y.Array<string>
			| undefined
		if (!tabOrder) return
		const ids = tabOrder.toArray()
		const from = ids.indexOf(movedId)
		const to = ids.indexOf(destId)
		if (from === -1 || to === -1) return

		tabOrder.delete(from, 1)
		tabOrder.insert(to, [movedId])
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

/** Salinan duduk tepat setelah aslinya, di dalam dokumen yang sama. */
export function duplicateTab(doc: Y.Doc, id: string): string | null {
	const { meta } = tabsRoot(doc)
	const source = meta.get(id)
	if (!source) return null

	const parentId = findTabDoc(doc, id)
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

		if (parentId) {
			const tabOrder = docsRoot(doc).meta.get(parentId)?.get(TAB_ORDER) as
				| Y.Array<string>
				| undefined
			if (tabOrder) {
				const at = tabOrder.toArray().indexOf(id)
				tabOrder.insert(at === -1 ? tabOrder.length : at + 1, [copyId])
			}
		}
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
