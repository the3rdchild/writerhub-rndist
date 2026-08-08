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
import { createDocument, updateDocument } from '@/features/documents/api'
import type { DocumentDetail } from '@/features/documents/types'
import { DOCUMENTS_QUERY_KEY } from '@/features/documents/use-documents'
import { useEditorInstance } from '@/features/editor/editor-context'
import { useSessions } from '@/features/sessions/session-context'
import { createTab, readTabs, updateTab } from '@/features/sessions/ydoc'
import { usePersistentState } from '@/lib/use-persistent-state'
import { fragmentToJSON, jsonToFragment } from './serialize'

/**
 * Sinkronisasi "manual first" ke cloud.
 *
 * Naskah tetap lokal (Yjs → IndexedDB) sampai pemakai memilih "Simpan ke
 * cloud". Begitu terhubung, tiap suntingan lokal menandai tabnya kotor dan
 * autosave berjalan dengan debounce (3 detik diam / maksimal 30 detik) lewat
 * PUT. Tidak ada merge - tulisan terakhir menang (§5.1 PRD).
 *
 * Kaitan tab → dokumen server adalah milik pemakai, bukan milik naskah, jadi
 * ia tinggal di localStorage seperti `local-view.ts`, bukan di Y.Doc.
 */

const SYNC_STORAGE_KEY = 'writer-hub-sync'

/** Jeda setelah ketukan terakhir sebelum autosave berangkat. */
const IDLE_SAVE_MS = 3_000
/** Mengetik terus tidak boleh menunda autosave tanpa batas. */
const MAX_SAVE_MS = 30_000

/**
 * Asal transaksi untuk tulisan dari context ini sendiri (memuat naskah dari
 * server). Tanpa pembeda ini, membuka dokumen dari library langsung menandai
 * tabnya kotor dan memicu autosave atas naskah yang baru saja dibaca.
 */
const SYNC_ORIGIN = 'sync'

export type SyncStatus = 'local' | 'synced' | 'dirty' | 'saving' | 'error'

export interface SyncLinkage {
	serverId: string
	lastSyncedAt: number
}

interface SyncContextValue {
	/** Kaitan tab → dokumen server; tab tanpa entri berarti lokal saja. */
	linkage: Record<string, SyncLinkage>
	syncStatus: (tabId: string) => SyncStatus
	/** Simpan sekarang: POST bila belum terhubung, PUT bila sudah. */
	saveToCloud: (tabId: string) => Promise<void>
	/** Buat tab baru dari dokumen server dan jadikan ia aktif. */
	openFromLibrary: (serverDoc: DocumentDetail) => string | null
	/**
	 * Catat kaitan tab → dokumen server yang dibuat di luar context ini.
	 * Dipakai dialog bagikan: server membuatkan dokumen untuk tab yang masih
	 * lokal, dan tanpa dicatat di sini tiap pembagian berikutnya akan membuat
	 * dokumen baru lagi.
	 */
	linkTab: (tabId: string, serverId: string) => void
}

const SyncContext = createContext<SyncContextValue | null>(null)

interface SaveTimers {
	idle?: ReturnType<typeof setTimeout>
	max?: ReturnType<typeof setTimeout>
}

export function SyncProvider({ children }: { children: ReactNode }) {
	const { doc, sessions, activeId, selectSession } = useSessions()
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
	/** Hitungan suntingan per tab; dipakai agar status 'dirty' tidak hilang
	    saat PUT yang berangkat lebih awal selesai. */
	const revisions = useRef(new Map<string, number>())
	// Handler Yjs didaftarkan sekali; nilai terkini dibaca lewat ref.
	const sessionsRef = useRef(sessions)
	sessionsRef.current = sessions
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

	/** PUT ke dokumen yang sudah terhubung. Dipakai autosave dan Simpan ulang. */
	const pushToServer = useCallback(
		async (tabId: string, linkage: SyncLinkage) => {
			const meta = sessionsRef.current.find((tab) => tab.id === tabId)
			if (!meta) return

			const sentAtRevision = revisions.current.get(tabId) ?? 0
			setStatus(tabId, 'saving')
			try {
				await updateDocument(linkage.serverId, {
					title: meta.title,
					content: serializeTab(tabId),
					emoji: meta.emoji,
					language: meta.language,
				})
				const synced: SyncLinkage = { ...linkage, lastSyncedAt: Date.now() }
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
			} catch {
				setStatus(tabId, 'error')
			}
		},
		[serializeTab, setStatus, setStore, invalidateDocuments],
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

	// Catatan kaitan tab yang sudah dihapus tidak perlu ikut dimuat selamanya.
	useEffect(() => {
		if (!storeHydrated || sessions.length === 0) return
		const keep = new Set(sessions.map((tab) => tab.id))
		setStore((current) => {
			const pruned: Record<string, SyncLinkage> = {}
			for (const [id, linkage] of Object.entries(current.linkage)) {
				if (keep.has(id)) pruned[id] = linkage
			}
			return Object.keys(pruned).length === Object.keys(current.linkage).length
				? current
				: { ...current, linkage: pruned }
		})
	}, [storeHydrated, sessions, setStore])

	// Timer yang masih menggantung dibersihkan saat provider bubar.
	useEffect(() => {
		const map = timers.current
		return () => {
			for (const entry of map.values()) {
				if (entry.idle) clearTimeout(entry.idle)
				if (entry.max) clearTimeout(entry.max)
			}
			map.clear()
		}
	}, [])

	const saveToCloud = useCallback(
		async (tabId: string) => {
			const meta = sessionsRef.current.find((tab) => tab.id === tabId)
			if (!meta) return

			const existing = linkageRef.current[tabId]
			if (existing) {
				clearTimers(tabId)
				await pushToServer(tabId, existing)
				return
			}

			setStatus(tabId, 'saving')
			try {
				const created = await createDocument({
					title: meta.title,
					content: serializeTab(tabId),
					emoji: meta.emoji,
					language: meta.language,
				})
				setStore((current) => ({
					...current,
					linkage: {
						...current.linkage,
						[tabId]: { serverId: created.id, lastSyncedAt: Date.now() },
					},
				}))
				setStatus(tabId, null)
				void invalidateDocuments()
			} catch {
				setStatus(tabId, 'error')
			}
		},
		[clearTimers, pushToServer, serializeTab, setStatus, setStore, invalidateDocuments],
	)

	const openFromLibrary = useCallback(
		(serverDoc: DocumentDetail): string | null => {
			// Dokumen yang sama sudah terbuka di tab lain: aktifkan tab itu saja,
			// jangan buat tab kedua yang autosave-nya saling menimpa.
			const opened = Object.entries(linkageRef.current).find(
				([, linkage]) => linkage.serverId === serverDoc.id,
			)
			if (opened) {
				selectSession(opened[0])
				return opened[0]
			}

			// Batas tab yang sama dengan tombol "Tab baru" di session-context.
			if (sessionsRef.current.length >= 50) return null

			// `createTab` ikut masuk ke dalam transaksi ini. Di luarnya ia menulis
			// dengan LOCAL_ORIGIN, dan update itu akan terbaca sebagai suntingan
			// pemakai atas tab yang sedang aktif - menandainya kotor lalu memicu
			// PUT atas naskah yang tidak berubah sama sekali.
			let tabId = ''
			doc.transact(() => {
				tabId = createTab(doc, serverDoc.title)
				jsonToFragment(doc, tabId, serverDoc.content)
				updateTab(doc, tabId, {
					title: serverDoc.title,
					emoji: serverDoc.emoji,
					language: serverDoc.language,
					updatedAt: Date.now(),
				})
			}, SYNC_ORIGIN)

			setStore((current) => ({
				...current,
				linkage: {
					...current.linkage,
					[tabId]: { serverId: serverDoc.id, lastSyncedAt: Date.now() },
				},
			}))
			setStatus(tabId, null)
			selectSession(tabId)
			return tabId
		},
		[doc, selectSession, setStatus, setStore],
	)

	const linkTab = useCallback(
		(tabId: string, serverId: string) => {
			// Kaitan yang sudah ada tidak ditimpa: tab hanya boleh menunjuk satu
			// dokumen server seumur hidupnya.
			if (linkageRef.current[tabId]) return
			setStore((current) => ({
				...current,
				linkage: {
					...current.linkage,
					[tabId]: { serverId, lastSyncedAt: Date.now() },
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
