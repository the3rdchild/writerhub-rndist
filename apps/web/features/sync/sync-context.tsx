'use client'

import { useQueryClient } from '@tanstack/react-query'
import { IndexeddbPersistence } from 'y-indexeddb'
import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from 'react'
import {
	createDocument,
	getTab,
	updateDocument,
	updateTab as updateTabApi,
} from '@/features/documents/api'
import type { DocumentDetail } from '@/features/documents/types'
import { DOCUMENTS_QUERY_KEY } from '@/features/documents/use-documents'
import { useEditorInstance } from '@/features/editor/editor-context'
import { MAX_DOCUMENTS, useSessions } from '@/features/sessions/session-context'
import {
	createDocument as createLocalDocument,
	createTab as createLocalTab,
	findTabDoc,
	readDocs,
	readTabs,
	updateTab,
} from '@/features/sessions/ydoc'
import { deleteLocalVersionsExcept } from '@/features/versions/local-store'
import { usePersistentState } from '@/lib/use-persistent-state'
import { fragmentToJSON, jsonToFragment } from './serialize'

/**
 * Sinkronisasi "manual first" ke cloud.
 *
 * Naskah tetap lokal (Yjs → IndexedDB) sampai pemakai memilih "Simpan ke
 * cloud". Begitu terhubung, tiap suntingan lokal menandai tabnya kotor dan
 * autosave berjalan dengan debounce (3 detik diam / maksimal 30 detik) lewat
 * PUT /tabs/:tabId. Tidak ada merge - tulisan terakhir menang (§5.1 PRD).
 *
 * Sejak restrukturisasi dokumen/tab, kaitan tetap per tab (`serverId` = id tab
 * di server) tapi ikut mencatat `documentId` induknya: judul dokumen hidup di
 * tabel induk, jadi menyimpan sebuah tab kadang berarti juga memutakhirkan
 * judul induknya. Kaitan adalah milik pemakai, bukan milik naskah, jadi ia
 * tinggal di localStorage seperti `local-view.ts`, bukan di Y.Doc.
 */

const SYNC_STORAGE_KEY = 'writer-hub-sync'

/** Jeda setelah ketukan terakhir sebelum autosave berangkat. */
const IDLE_SAVE_MS = 3_000
/** Mengetik terus tidak boleh menunda autosave tanpa batas. */
const MAX_SAVE_MS = 30_000
/** Jeda pengetikan judul dokumen sebelum judulnya dikirim ke server. */
const TITLE_SYNC_MS = 1_200
/** Batas tab per dokumen, sama dengan pagar pembuatan tab di session-context. */
const MAX_SESSIONS = 50

/**
 * Asal transaksi untuk tulisan dari context ini sendiri (memuat naskah dari
 * server). Tanpa pembeda ini, membuka dokumen dari library langsung menandai
 * tabnya kotor dan memicu autosave atas naskah yang baru saja dibaca.
 */
export const SYNC_ORIGIN = 'sync'

export type SyncStatus = 'local' | 'synced' | 'dirty' | 'saving' | 'error'

export interface SyncLinkage {
	/** Id tab di server (baris `document_tabs`). */
	serverId: string
	/** Id dokumen induk tab itu di server. */
	documentId: string
	lastSyncedAt: number
	/**
	 * Judul dokumen lokal saat sinkronisasi terakhir; pembeda untuk tahu kapan
	 * judul induk perlu ikut di-PUT. `undefined` pada kaitan hasil migrasi -
	 * diisi dari judul lokal saat pertama kali terbaca, tanpa mengirim apa pun.
	 */
	lastDocTitle?: string
}

interface SyncContextValue {
	/** Kaitan tab → tab+dokumen server; tab tanpa entri berarti lokal saja. */
	linkage: Record<string, SyncLinkage>
	syncStatus: (tabId: string) => SyncStatus
	/**
	 * Simpan sekarang: POST /documents bila belum terhubung, PUT /tabs/:tabId
	 * bila sudah (plus PUT judul dokumen bila berubah). Mengembalikan `true`
	 * bila berhasil - alur restore versi bergantung pada kepastian ini sebelum
	 * membiarkan server membekukan versi pre-restore.
	 */
	saveToCloud: (tabId: string) => Promise<boolean>
	/**
	 * Buat dokumen lokal baru dari dokumen server - satu tab lokal per tab
	 * server, masing-masing dengan kaitannya - lalu jadikan ia aktif.
	 * Mengembalikan id tab pertama, atau null bila pagar jumlah terlampaui.
	 */
	openFromLibrary: (serverDoc: DocumentDetail) => Promise<string | null>
	/**
	 * Catat kaitan tab → tab server yang dibuat di luar context ini. Dipakai
	 * dialog bagikan: server membuatkan dokumen+tab untuk tab yang masih lokal,
	 * dan tanpa dicatat di sini tiap pembagian berikutnya akan membuat dokumen
	 * baru lagi. Id dokumen induk diambil dari server (respons share hanya
	 * membawa id tab).
	 */
	linkTab: (tabId: string, serverId: string) => Promise<void>
}

const SyncContext = createContext<SyncContextValue | null>(null)

interface SaveTimers {
	idle?: ReturnType<typeof setTimeout>
	max?: ReturnType<typeof setTimeout>
}

export function SyncProvider({ children }: { children: ReactNode }) {
	const { doc, documents, activeId, selectSession } = useSessions()
	const { editor } = useEditorInstance()
	const queryClient = useQueryClient()

	const [store, setStore, storeHydrated] = usePersistentState<{
		linkage: Record<string, SyncLinkage>
	}>(SYNC_STORAGE_KEY, { linkage: {} })

	/** Keadaan sesaat; sisanya diturunkan dari ada/tidaknya kaitan. */
	const [transient, setTransient] = useState<
		Record<string, 'dirty' | 'saving' | 'error'>
	>({})

	const timers = useRef(new Map<string, SaveTimers>())
	/** Timer debounce judul dokumen, per documentId server. */
	const titleTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>())
	/** Hitungan suntingan per tab; dipakai agar status 'dirty' tidak hilang
	    saat PUT yang berangkat lebih awal selesai. */
	const revisions = useRef(new Map<string, number>())
	// Handler Yjs didaftarkan sekali; nilai terkini dibaca lewat ref.
	const activeIdRef = useRef(activeId)
	activeIdRef.current = activeId
	const editorRef = useRef(editor)
	editorRef.current = editor
	const linkageRef = useRef(store.linkage)
	linkageRef.current = store.linkage

	const setStatus = useCallback((tabId: string, status: 'dirty' | 'saving' | 'error' | null) => {
		setTransient((current) => {
			const next = { ...current }
			if (status === null) delete next[tabId]
			else next[tabId] = status
			return next
		})
	}, [])

	const clearTimers = useCallback((tabId: string) => {
		const entry = timers.current.get(tabId)
		if (!entry) return
		if (entry.idle) clearTimeout(entry.idle)
		if (entry.max) clearTimeout(entry.max)
		timers.current.delete(tabId)
	}, [])

	const invalidateDocuments = useCallback(
		() => queryClient.invalidateQueries({ queryKey: DOCUMENTS_QUERY_KEY }),
		[queryClient],
	)

	/**
	 * Naskah dibaca dari instance editor untuk tab yang sedang dibuka - isinya
	 * paling baru. Tab lain dibaca langsung dari fragmennya, karena editor hanya
	 * terikat ke satu fragmen pada satu waktu.
	 */
	const serializeTab = useCallback(
		(tabId: string) => {
			const current = editorRef.current
			if (tabId === activeIdRef.current && current && !current.isDestroyed) {
				return current.getJSON()
			}
			return fragmentToJSON(doc, tabId)
		},
		[doc],
	)

	// Migrasi penyimpanan lokal: entri kaitan lama hanya punya `serverId`.
	// Setelah migrasi server 0009, id dokumen lama = id tab-nya, jadi induk
	// entri lama adalah serverId itu sendiri. `lastDocTitle` sengaja tidak
	// diisi di sini - judul lokal dan judul server sama persis pada titik
	// migrasi, jadi nilainya diambil dari judul lokal saat pertama dibaca
	// (lihat efek sinkron judul di bawah) tanpa memicu PUT yang tidak perlu.
	useEffect(() => {
		if (!storeHydrated) return
		setStore((current) => {
			let changed = false
			const migrated: Record<string, SyncLinkage> = {}
			for (const [id, linkage] of Object.entries(current.linkage)) {
				if (linkage.documentId) {
					migrated[id] = linkage
				} else {
					migrated[id] = { ...linkage, documentId: linkage.serverId }
					changed = true
				}
			}
			return changed ? { ...current, linkage: migrated } : current
		})
	}, [storeHydrated, setStore])

	/**
	 * PUT konten ke tab yang sudah terhubung. Dipakai autosave dan Simpan
	 * ulang. Judul dokumen induk ikut di-PUT bila berubah sejak sinkronisasi
	 * terakhir - judul tinggal di tabel induk, bukan di tab.
	 */
	const pushToServer = useCallback(
		async (tabId: string, linkage: SyncLinkage): Promise<boolean> => {
			// Meta dibaca dari SELURUH tab (semua dokumen), bukan hanya dokumen
			// aktif: autosave sebuah tab tidak boleh gagal karena pemakai sedang
			// membuka dokumen lain.
			const meta = readTabs(doc).find((tab) => tab.id === tabId)
			if (!meta) return false

			const parentId = findTabDoc(doc, tabId)
			const docTitle = parentId
				? readDocs(doc).find((dok) => dok.id === parentId)?.title
				: undefined

			const sentAtRevision = revisions.current.get(tabId) ?? 0
			setStatus(tabId, 'saving')
			try {
				await updateTabApi(linkage.serverId, {
					title: meta.title,
					content: serializeTab(tabId),
					emoji: meta.emoji,
					language: meta.language,
				})
				// `lastDocTitle` kosong = kaitan hasil migrasi; judulnya sudah sama
				// di kedua sisi, jadi cukup dicatat tanpa mengirim apa pun.
				if (
					docTitle !== undefined &&
					linkage.lastDocTitle !== undefined &&
					docTitle !== linkage.lastDocTitle
				) {
					await updateDocument(linkage.documentId, { title: docTitle })
				}
				const synced: SyncLinkage = {
					...linkage,
					lastSyncedAt: Date.now(),
					...(docTitle !== undefined ? { lastDocTitle: docTitle } : {}),
				}
				setStore((current) => ({
					...current,
					linkage: { ...current.linkage, [tabId]: synced },
				}))
				// Pemakai bisa menyunting selagi PUT berjalan; status hanya dibersihkan
				// bila tidak ada suntingan baru sejak PUT ini berangkat.
				if ((revisions.current.get(tabId) ?? 0) === sentAtRevision) {
					setStatus(tabId, null)
				} else {
					setStatus(tabId, 'dirty')
				}
				void invalidateDocuments()
				return true
			} catch {
				setStatus(tabId, 'error')
				return false
			}
		},
		[doc, serializeTab, setStatus, setStore, invalidateDocuments],
	)

	const pushRef = useRef(pushToServer)
	pushRef.current = pushToServer

	const scheduleSave = useCallback(
		(tabId: string) => {
			const entry = timers.current.get(tabId) ?? {}
			if (entry.idle) clearTimeout(entry.idle)
			entry.idle = setTimeout(() => {
				clearTimers(tabId)
				const linkage = linkageRef.current[tabId]
				if (linkage) void pushRef.current(tabId, linkage)
			}, IDLE_SAVE_MS)
			// Timer maksimal dipasang sekali per rangkaian suntingan: mengetik
			// terus menggeser timer diam, tapi tidak yang ini.
			if (!entry.max) {
				entry.max = setTimeout(() => {
					clearTimers(tabId)
					const linkage = linkageRef.current[tabId]
					if (linkage) void pushRef.current(tabId, linkage)
				}, MAX_SAVE_MS)
			}
			timers.current.set(tabId, entry)
		},
		[clearTimers],
	)

	// Suntingan pada tab terhubung menandainya kotor dan memuat ulang hitungan
	// autosave. Origin yang diabaikan hanya dua: tulisan context ini sendiri
	// (memuat naskah dari server) dan hidrasi IndexedDB - ketikan editor datang
	// dengan origin ySyncPluginKey, jadi whitelist ke LOCAL_ORIGIN akan
	// melewatkan suntingan format yang tidak mengubah teks polos.
	useEffect(() => {
		const onUpdate = (_update: Uint8Array, origin: unknown) => {
			if (origin === SYNC_ORIGIN || origin instanceof IndexeddbPersistence) return
			const tabId = activeIdRef.current
			if (!tabId || !linkageRef.current[tabId]) return
			revisions.current.set(tabId, (revisions.current.get(tabId) ?? 0) + 1)
			setStatus(tabId, 'dirty')
			scheduleSave(tabId)
		}

		doc.on('update', onUpdate)
		return () => {
			doc.off('update', onUpdate)
		}
	}, [doc, setStatus, scheduleSave])

	// Sinkron judul dokumen dua arah: renameDocument lokal pada dokumen yang
	// punya tab terhubung dikirim ke server dengan debounce ringan. Efek ini
	// juga yang mengisi `lastDocTitle` kaitan hasil migrasi (lihat di atas) -
	// dari judul lokal, tanpa PUT.
	useEffect(() => {
		if (!storeHydrated || documents.length === 0) return

		for (const dok of documents) {
			// Satu dokumen bisa punya beberapa tab terhubung; judulnya satu,
			// jadi cukup dibaca dari kaitan pertama yang ditemukan.
			const entry = Object.entries(store.linkage).find(
				([tabId, linkage]) => dok.tabOrder.includes(tabId) && linkage.documentId,
			)
			if (!entry) continue
			const [linkedTabId, linkage] = entry

			if (linkage.lastDocTitle === undefined) {
				setStore((current) => {
					const found = current.linkage[linkedTabId]
					if (!found || found.lastDocTitle !== undefined) return current
					return {
						...current,
						linkage: {
							...current.linkage,
							[linkedTabId]: { ...found, lastDocTitle: dok.title },
						},
					}
				})
				continue
			}

			if (linkage.lastDocTitle === dok.title) continue

			const serverDocId = linkage.documentId
			const pending = titleTimers.current.get(serverDocId)
			if (pending) clearTimeout(pending)
			const title = dok.title
			titleTimers.current.set(
				serverDocId,
				setTimeout(() => {
					titleTimers.current.delete(serverDocId)
					updateDocument(serverDocId, { title })
						.then(() => {
							// Catat judul yang baru terkirim di SEMUA kaitan dokumen ini.
							setStore((current) => {
								const next = { ...current.linkage }
								for (const [tabId, linked] of Object.entries(next)) {
									if (linked.documentId === serverDocId) {
										next[tabId] = { ...linked, lastDocTitle: title }
									}
								}
								return { ...current, linkage: next }
							})
							void invalidateDocuments()
						})
						.catch(() => {
							// Gagal mengirim judul tidak mengubah status tab - judul akan
							// ikut terkirim pada autosave berikutnya lewat pushToServer.
						})
				}, TITLE_SYNC_MS),
			)
		}
	}, [storeHydrated, documents, store.linkage, setStore, invalidateDocuments])

	// Catatan kaitan tab yang sudah dihapus tidak perlu ikut dimuat selamanya.
	// Versi lokalnya ikut dibersihkan (fire-and-forget): tab lokal tidak punya
	// catatan linkage, jadi yang dibaca adalah tabId yang benar-benar tersimpan
	// di store versi. Kegagalan IDB diabaikan - sisa versi yatim tidak mengganggu
	// apa pun dan akan tersapu pada kesempatan berikutnya.
	useEffect(() => {
		// Yang dipertahankan adalah kaitan milik tab yang masih ada di SELURUH
		// dokumen, bukan hanya dokumen aktif. Dependensinya `documents` (bukan
		// `sessions`) supaya efek ini juga berjalan saat dokumen non-aktif
		// dihapus - daftar tab aktif tidak berubah pada kasus itu.
		const all = readTabs(doc)
		if (!storeHydrated || all.length === 0) return
		const keep = new Set(all.map((tab) => tab.id))
		void deleteLocalVersionsExcept(keep).catch(() => {})
		setStore((current) => {
			const pruned: Record<string, SyncLinkage> = {}
			for (const [id, linkage] of Object.entries(current.linkage)) {
				if (keep.has(id)) pruned[id] = linkage
			}
			return Object.keys(pruned).length === Object.keys(current.linkage).length
				? current
				: { ...current, linkage: pruned }
		})
	}, [storeHydrated, documents, doc, setStore])

	// Timer yang masih menggantung dibersihkan saat provider bubar.
	useEffect(() => {
		const map = timers.current
		const titles = titleTimers.current
		return () => {
			for (const entry of map.values()) {
				if (entry.idle) clearTimeout(entry.idle)
				if (entry.max) clearTimeout(entry.max)
			}
			map.clear()
			for (const timer of titles.values()) clearTimeout(timer)
			titles.clear()
		}
	}, [])

	const saveToCloud = useCallback(
		async (tabId: string): Promise<boolean> => {
			// Sama seperti pushToServer: meta dibaca dari seluruh tab.
			const meta = readTabs(doc).find((tab) => tab.id === tabId)
			if (!meta) return false

			const existing = linkageRef.current[tabId]
			if (existing) {
				clearTimers(tabId)
				return pushToServer(tabId, existing)
			}

			// Belum terhubung: dokumen induk dibuat dulu di server, judulnya judul
			// DOKUMEN lokal (bukan judul tab), dan konten/emoji/bahasa menjadi milik
			// tab pertama yang dibuatkan server.
			const parentId = findTabDoc(doc, tabId)
			const docTitle = parentId
				? (readDocs(doc).find((dok) => dok.id === parentId)?.title ?? meta.title)
				: meta.title

			setStatus(tabId, 'saving')
			try {
				const created = await createDocument({
					title: docTitle,
					content: serializeTab(tabId),
					emoji: meta.emoji,
					language: meta.language,
				})
				const serverTabId = created.tabs[0]?.id
				if (!serverTabId) throw new Error('Respons dokumen tanpa tab')
				setStore((current) => ({
					...current,
					linkage: {
						...current.linkage,
						[tabId]: {
							serverId: serverTabId,
							documentId: created.id,
							lastSyncedAt: Date.now(),
							lastDocTitle: docTitle,
						},
					},
				}))
				setStatus(tabId, null)
				void invalidateDocuments()
				return true
			} catch {
				setStatus(tabId, 'error')
				return false
			}
		},
		[doc, clearTimers, pushToServer, serializeTab, setStatus, setStore, invalidateDocuments],
	)

	const openFromLibrary = useCallback(
		async (serverDoc: DocumentDetail): Promise<string | null> => {
			// Dokumen yang sama sudah terbuka: aktifkan lagi tabnya, jangan buat
			// salinan kedua yang autosave-nya saling menimpa.
			const opened = Object.entries(linkageRef.current).find(
				([, linkage]) => linkage.documentId === serverDoc.id,
			)
			if (opened) {
				selectSession(opened[0])
				return opened[0]
			}

			// Pagar jumlah: satu dokumen lokal baru per berkas server, dan tab
			// di dalamnya dibatasi sama seperti pembuatan tab biasa.
			if (readDocs(doc).length >= MAX_DOCUMENTS) return null
			if (serverDoc.tabs.length === 0 || serverDoc.tabs.length > MAX_SESSIONS) return null

			// Konten tiap tab diambil terpisah (ringkasan di DocumentDetail tidak
			// membawanya), lalu seluruh penulisan lokal terjadi dalam SATU
			// transaksi SYNC_ORIGIN: tanpa bungkusan ini, createLocalDocument
			// menulis dengan LOCAL_ORIGIN dan update-nya terbaca sebagai suntingan
			// pemakai atas tab yang sedang aktif - menandainya kotor lalu memicu
			// PUT atas naskah yang tidak berubah sama sekali.
			const contents = await Promise.all(serverDoc.tabs.map((tab) => getTab(tab.id)))

			let firstTabId = ''
			const pairs: Array<{ localTabId: string; serverTabId: string }> = []
			doc.transact(() => {
				const docId = createLocalDocument(doc, serverDoc.title)
				firstTabId = readTabs(doc, docId)[0]?.id ?? ''
				if (!firstTabId) return
				pairs.push({ localTabId: firstTabId, serverTabId: serverDoc.tabs[0].id })
				for (const serverTab of serverDoc.tabs.slice(1)) {
					pairs.push({
						localTabId: createLocalTab(doc, docId, serverTab.title),
						serverTabId: serverTab.id,
					})
				}
				for (const [index, pair] of pairs.entries()) {
					const serverTab = serverDoc.tabs[index]
					jsonToFragment(doc, pair.localTabId, contents[index].content)
					updateTab(doc, pair.localTabId, {
						title: serverTab.title,
						emoji: serverTab.emoji,
						language: serverTab.language,
						updatedAt: Date.now(),
					})
				}
			}, SYNC_ORIGIN)
			if (!firstTabId) return null

			const now = Date.now()
			setStore((current) => {
				const next = { ...current.linkage }
				for (const pair of pairs) {
					next[pair.localTabId] = {
						serverId: pair.serverTabId,
						documentId: serverDoc.id,
						lastSyncedAt: now,
						lastDocTitle: serverDoc.title,
					}
				}
				return { ...current, linkage: next }
			})
			for (const pair of pairs) setStatus(pair.localTabId, null)
			// selectSession ikut mengaktifkan dokumen pemilik tabnya.
			selectSession(firstTabId)
			return firstTabId
		},
		[doc, selectSession, setStatus, setStore],
	)

	const linkTab = useCallback(
		async (tabId: string, serverId: string) => {
			// Kaitan yang sudah ada tidak ditimpa: tab hanya boleh menunjuk satu
			// tab server seumur hidupnya.
			if (linkageRef.current[tabId]) return
			// Respons share hanya membawa id tab; induknya diambil dari server.
			const serverTab = await getTab(serverId)
			setStore((current) => ({
				...current,
				linkage: {
					...current.linkage,
					[tabId]: { serverId, documentId: serverTab.documentId, lastSyncedAt: Date.now() },
				},
			}))
			setStatus(tabId, null)
		},
		[setStatus, setStore],
	)

	const syncStatus = useCallback(
		(tabId: string): SyncStatus =>
			transient[tabId] ?? (store.linkage[tabId] ? 'synced' : 'local'),
		[transient, store.linkage],
	)

	const value = useMemo<SyncContextValue>(
		() => ({
			linkage: store.linkage,
			syncStatus,
			saveToCloud,
			openFromLibrary,
			linkTab,
		}),
		[store.linkage, syncStatus, saveToCloud, openFromLibrary, linkTab],
	)

	return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>
}

export function useSync(): SyncContextValue {
	const context = useContext(SyncContext)
	if (!context) throw new Error('useSync harus dipakai di dalam <SyncProvider>')
	return context
}
