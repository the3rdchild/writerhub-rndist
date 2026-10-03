'use client'

import { useQueryClient } from '@tanstack/react-query'
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
import { IndexeddbPersistence } from 'y-indexeddb'
import { briefSyncKey, readDocBrief, writeDocBrief } from '@/features/brief/brief-ydoc'
import { CollabProvider } from '@/features/collab/collab-context'
import { indexeddbCollabStore } from '@/features/collab/local-store'
import { COLLAB_MIRROR_ORIGIN } from '@/features/collab/origins'
import { backupComments, restoreComments } from '@/features/comments/comment-backup'
import {
	createDocument,
	createTabApi,
	getTab,
	updateDocument,
	updateTab as updateTabApi,
} from '@/features/documents/api'
import type { DocumentDetail, DocumentSummary } from '@/features/documents/types'
import { DOCUMENTS_QUERY_KEY, useDocuments } from '@/features/documents/use-documents'
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
import { ApiError } from '@/lib/api-client'
import { usePersistentState } from '@/lib/use-persistent-state'
import { planCloudSave, tabsAwaitingCloud } from './cloud-plan'
import {
	applyDocLayout,
	applyTabLayout,
	layoutSyncKey,
	readDocLayout,
	readTabLayoutOverride,
} from './layout-sync'
import { RetryScheduler } from './retry'
import { fragmentToJSON, jsonToFragment } from './serialize'
import { resolveTitle } from './title-sync'

const SYNC_STORAGE_KEY = 'writer-hub-sync'
const IDLE_SAVE_MS = 3_000
const MAX_SAVE_MS = 30_000
const TITLE_SYNC_MS = 1_200
const MAX_SESSIONS = 50
/**
 * Tab baru dokumen cloud yang ditautkan sekaligus (lihat
 * `linkNewTabsOfCloudDocuments`). Satu: server menghitung posisi tab baru
 * sebagai posisi terakhir + 1, dan dua pembuatan bersamaan bisa mendapat
 * posisi yang sama - urutannya jadi acak.
 */
const LINK_CONCURRENCY = 1
export const SYNC_ORIGIN = 'sync'

/**
 * `too-large`: server menolak naskahnya karena melewati batas ukuran (413).
 * Dipisah dari `error` supaya penulis tahu penyebabnya, dan tahu bahwa
 * mencoba lagi tanpa memperkecil naskah tidak akan berhasil.
 */
export type SyncStatus = 'local' | 'synced' | 'dirty' | 'saving' | 'error' | 'too-large'
type TransientStatus = Exclude<SyncStatus, 'local' | 'synced'>

export interface SyncLinkage {
	serverId: string
	documentId: string
	lastSyncedAt: number
	lastDocTitle?: string
	/** Kunci `layoutSyncKey` dari tata letak dasar dokumen yang terakhir terkirim. */
	lastDocLayoutKey?: string
	/** Kunci `briefSyncKey` dari brief penelitian yang terakhir terkirim. */
	lastDocBriefKey?: string
}

interface SyncContextValue {
	linkage: Record<string, SyncLinkage>
	syncStatus: (tabId: string) => SyncStatus
	saveToCloud: (tabId: string) => Promise<boolean>
	openFromLibrary: (serverDoc: DocumentDetail) => Promise<string | null>
	linkTab: (tabId: string, serverId: string) => Promise<void>
	serverDocId: (docId: string) => string | null
	saveDocumentToCloud: (docId: string) => Promise<boolean>
}

const SyncContext = createContext<SyncContextValue | null>(null)

/** Galat karena sumber daya di server sudah tidak ada (dihapus atau reset). */
function isGone(error: unknown): boolean {
	return error instanceof ApiError && error.status === 404
}

/** Ringkasan dokumen (bentuk entri daftar) dari jawaban detailnya. */
function documentSummaryOf({ tabs: _tabs, ...summary }: DocumentDetail): DocumentSummary {
	return summary
}

/** Status gagal simpan yang sesuai dengan penyebabnya. */
function failedStatus(error: unknown): TransientStatus {
	return error instanceof ApiError && error.status === 413 ? 'too-large' : 'error'
}

interface SaveTimers {
	idle?: ReturnType<typeof setTimeout>
	max?: ReturnType<typeof setTimeout>
}

export function SyncProvider({ children }: { children: ReactNode }) {
	const { doc, documents, activeId, selectSession, renameDocument, whenLoaded } = useSessions()
	const { editor } = useEditorInstance()
	const queryClient = useQueryClient()
	const serverDocuments = useDocuments()

	const [store, setStore, storeHydrated] = usePersistentState<{
		linkage: Record<string, SyncLinkage>
	}>(SYNC_STORAGE_KEY, { linkage: {} })
	const [transient, setTransient] = useState<Record<string, TransientStatus>>({})

	const timers = useRef(new Map<string, SaveTimers>())
	const titleTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>())
	/** Hitungan suntingan per tab; dipakai agar status 'dirty' tidak hilang
	    saat PUT yang berangkat lebih awal selesai. */
	const revisions = useRef(new Map<string, number>())
	const activeIdRef = useRef(activeId)
	activeIdRef.current = activeId
	const editorRef = useRef(editor)
	editorRef.current = editor
	const linkageRef = useRef(store.linkage)
	linkageRef.current = store.linkage
	/** Tab yang sedang dibuatkan tab server; mencegah dua jalur membuat dua tab server untuk satu tab. */
	const linking = useRef(new Map<string, Promise<boolean>>())
	/**
	 * Tab yang penautannya ditolak permanen (naskah melewati batas ukuran).
	 * Penautan otomatis melewatinya - tanpa ini setiap perubahan daftar
	 * dokumen mengirim ulang naskah raksasa yang pasti ditolak lagi. Simpan ke
	 * cloud manual tetap mencobanya.
	 */
	const rejectedLinks = useRef(new Set<string>())
	/** Naik setiap peramban kembali online, supaya penautan yang tertunda dicoba lagi. */
	const [onlineTick, setOnlineTick] = useState(0)
	/*
	 * Coba ulang simpanan yang gagal (SHL-7). Penjadwalnya dibuat sekali; yang
	 * dijalankannya dibaca lewat ref supaya selalu memakai closure terbaru.
	 */
	/*
	 * Tab yang isinya disunting bersama lewat websocket (SHL-5). Naskahnya
	 * tidak di-PUT lagi: server menurunkannya sendiri dari state Yjs dan
	 * membuang naskah dari PUT. Yang tetap dikirim hanya judul, ikon, bahasa,
	 * dan tata letak.
	 */
	const collabTabs = useRef(new Set<string>())
	const markCollabTab = useCallback((tabId: string, collaborative: boolean) => {
		if (collaborative) collabTabs.current.add(tabId)
		else collabTabs.current.delete(tabId)
	}, [])
	const retryTabRef = useRef<(tabId: string) => void>(() => {})
	const retries = useRef<RetryScheduler | null>(null)
	if (!retries.current) retries.current = new RetryScheduler((tabId) => retryTabRef.current(tabId))
	const retry = retries.current

	const setStatus = useCallback((tabId: string, status: TransientStatus | null) => {
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
	 * Memperbarui satu dokumen di cache daftar tanpa mengambil ulang seluruh
	 * daftar. Dipakai autosave: yang berubah di daftar hanya `updatedAt` (dan
	 * judul/tata letak/brief bila ikut dikirim), dan semuanya sudah diketahui
	 * dari jawaban simpanannya. Sebelumnya setiap autosave mengambil ulang
	 * seluruh daftar dokumen: pada uji beban 30 Sep, 420 KB per simpanan untuk
	 * pengguna dengan 1.000 dokumen. Dokumen yang tidak ada di cache (belum
	 * pernah dimuat) jatuh ke pengambilan ulang biasa.
	 */
	const patchCachedDocument = useCallback(
		(documentId: string, patch: Partial<DocumentSummary>) => {
			let found = false
			queryClient.setQueryData<DocumentSummary[]>(DOCUMENTS_QUERY_KEY, (list) => {
				const index = list?.findIndex((entry) => entry.id === documentId) ?? -1
				if (!list || index < 0) return list
				found = true
				const next = [...list]
				next[index] = { ...list[index], ...patch }
				return next.sort((a, b) => b.updatedAt - a.updatedAt)
			})
			if (!found) void invalidateDocuments()
		},
		[queryClient, invalidateDocuments],
	)
	/** Melepas tautan satu tab; tab lain dari dokumen yang sama tetap terhubung. */
	const unlinkTab = useCallback(
		(tabId: string) => {
			clearTimers(tabId)
			setStatus(tabId, null)
			setStore((current) => {
				if (!current.linkage[tabId]) return current
				const next = { ...current.linkage }
				delete next[tabId]
				return { ...current, linkage: next }
			})
		},
		[clearTimers, setStatus, setStore],
	)
	/**
	 * Melepas tautan semua tab milik satu dokumen server. Dipakai saat dokumen
	 * itu sudah tidak ada, sehingga penyimpanan otomatis berhenti mengirim
	 * permintaan yang pasti ditolak 404 selamanya.
	 */
	const unlinkDocument = useCallback(
		(serverDocumentId: string) => {
			const tabIds = Object.entries(linkageRef.current)
				.filter(([, linkage]) => linkage.documentId === serverDocumentId)
				.map(([tabId]) => tabId)
			if (tabIds.length === 0) return
			for (const tabId of tabIds) {
				clearTimers(tabId)
				setStatus(tabId, null)
			}
			setStore((current) => {
				const next = { ...current.linkage }
				for (const tabId of tabIds) delete next[tabId]
				return { ...current, linkage: next }
			})
			void invalidateDocuments()
		},
		[clearTimers, setStatus, setStore, invalidateDocuments],
	)
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
	useEffect(
		function migrateStoredLinkage() {
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
		},
		[storeHydrated, setStore],
	)
	const pushToServer = useCallback(
		async (tabId: string, linkage: SyncLinkage): Promise<boolean> => {
			const meta = readTabs(doc).find((tab) => tab.id === tabId)
			if (!meta) return false

			const parentId = findTabDoc(doc, tabId)
			const docTitle = parentId ? readDocs(doc).find((dok) => dok.id === parentId)?.title : undefined

			const sentAtRevision = revisions.current.get(tabId) ?? 0
			// Menulis ke sumber daya yang sudah dihapus di server hanya akan 404
			// selamanya - lepas tautannya alih-alih mencoba ulang tanpa akhir.
			const write = async <T,>(work: Promise<T>, onGone: () => void): Promise<T | null> => {
				try {
					return await work
				} catch (error) {
					if (!isGone(error)) throw error
					onGone()
					return null
				}
			}
			setStatus(tabId, 'saving')
			try {
				const collaborative =
					collabTabs.current.has(tabId) || indexeddbCollabStore.storedEpoch(linkage.serverId) !== null
				const savedTab = await write(
					updateTabApi(linkage.serverId, {
						title: meta.title,
						...(collaborative ? {} : { content: serializeTab(tabId) }),
						emoji: meta.emoji,
						language: meta.language,
						layout: readTabLayoutOverride(doc, tabId),
					}),
					() => unlinkTab(tabId),
				)
				if (!savedTab) return false
				backupComments(linkage.serverId, meta.comments)
				/** Jawaban PUT dokumen terakhir; ringkasannya menggantikan entri di cache daftar. */
				let savedDocument: DocumentDetail | null = null
				if (
					docTitle !== undefined &&
					linkage.lastDocTitle !== undefined &&
					docTitle !== linkage.lastDocTitle
				) {
					const savedTitle = await write(updateDocument(linkage.documentId, { title: docTitle }), () =>
						unlinkDocument(linkage.documentId),
					)
					if (!savedTitle) return false
					savedDocument = savedTitle
				}
				const docLayout = parentId ? readDocLayout(doc, parentId) : null
				const docLayoutKey = layoutSyncKey(docLayout)
				if (parentId && docLayoutKey !== (linkage.lastDocLayoutKey ?? '')) {
					const savedLayout = await write(updateDocument(linkage.documentId, { layout: docLayout }), () =>
						unlinkDocument(linkage.documentId),
					)
					if (!savedLayout) return false
					savedDocument = savedLayout
				}
				const docBrief = parentId ? readDocBrief(doc, parentId) : null
				const docBriefKey = briefSyncKey(docBrief)
				if (parentId && docBriefKey !== (linkage.lastDocBriefKey ?? '')) {
					const savedBrief = await write(updateDocument(linkage.documentId, { brief: docBrief }), () =>
						unlinkDocument(linkage.documentId),
					)
					if (!savedBrief) return false
					savedDocument = savedBrief
				}
				const synced: SyncLinkage = {
					...linkage,
					lastSyncedAt: Date.now(),
					lastDocLayoutKey: docLayoutKey,
					lastDocBriefKey: docBriefKey,
					...(docTitle !== undefined ? { lastDocTitle: docTitle } : {}),
				}
				setStore((current) => ({
					...current,
					linkage: { ...current.linkage, [tabId]: synced },
				}))
				if ((revisions.current.get(tabId) ?? 0) === sentAtRevision) {
					setStatus(tabId, null)
				} else {
					setStatus(tabId, 'dirty')
				}
				retry.clear(tabId)
				patchCachedDocument(
					linkage.documentId,
					savedDocument ? documentSummaryOf(savedDocument) : { updatedAt: savedTab.updatedAt },
				)
				return true
			} catch (error) {
				const status = failedStatus(error)
				setStatus(tabId, status)
				// Naskah kebesaran tidak akan lolos walau dicoba seribu kali.
				if (status === 'error') retry.schedule(tabId)
				return false
			}
		},
		[doc, serializeTab, setStatus, setStore, patchCachedDocument, unlinkTab, unlinkDocument, retry],
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
	useEffect(
		function scheduleSaveOnEdit() {
			const onUpdate = (_update: Uint8Array, origin: unknown) => {
				// Cermin tab kolaboratif: isinya sudah di server lewat websocket.
				if (
					origin === SYNC_ORIGIN ||
					origin === COLLAB_MIRROR_ORIGIN ||
					origin instanceof IndexeddbPersistence
				)
					return
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
		},
		[doc, setStatus, scheduleSave],
	)
	useEffect(
		function adoptLinkageForNewDocuments() {
			if (!storeHydrated || documents.length === 0) return

			for (const dok of documents) {
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
							.catch((error: unknown) => {
								// Dokumen yang sudah tidak ada tidak akan pernah menerima
								// judul ini - lepas tautannya supaya efek di atas berhenti
								// menjadwalkan PUT yang pasti ditolak 404.
								if (isGone(error)) unlinkDocument(serverDocId)
							})
					}, TITLE_SYNC_MS),
				)
			}
		},
		[storeHydrated, documents, store.linkage, setStore, invalidateDocuments, unlinkDocument],
	)
	useEffect(
		function syncTitlesFromServer() {
			if (!storeHydrated || !serverDocuments.data) return

			const byServerId = new Map(serverDocuments.data.map((entry) => [entry.id, entry]))

			for (const dok of documents) {
				const linked = Object.entries(store.linkage).find(
					([tabId, linkage]) => dok.tabOrder.includes(tabId) && linkage.documentId,
				)
				if (!linked) continue

				const serverId = linked[1].documentId
				if (!serverId) continue
				const server = byServerId.get(serverId)
				if (!server) continue

				const verdict = resolveTitle(
					{ title: dok.title, titleUpdatedAt: dok.titleUpdatedAt },
					{ title: server.title, titleUpdatedAt: server.updatedAt },
					linked[1].lastDocTitle,
				)
				if (verdict !== 'adopt-server') continue
				renameDocument(dok.id, server.title, SYNC_ORIGIN)
				setStore((current) => {
					const next = { ...current.linkage }
					for (const [tabId, entry] of Object.entries(next)) {
						if (entry.documentId === serverId) {
							next[tabId] = { ...entry, lastDocTitle: server.title }
						}
					}
					return { ...current, linkage: next }
				})
			}
		},
		[storeHydrated, serverDocuments.data, documents, store.linkage, renameDocument, setStore],
	)
	useEffect(
		function pruneLinkageForRemovedTabs() {
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
		},
		[storeHydrated, documents, doc, setStore],
	)
	useEffect(function clearTimersOnUnmount() {
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
			retries.current?.dispose()
		}
	}, [])

	/**
	 * Membuat tab server untuk `tabId` di dokumen server `documentId`, lalu
	 * menautkannya (SHL-6). Satu tab hanya pernah punya satu pembuatan yang
	 * berjalan: penyimpanan dokumen, simpan per tab, dan penautan otomatis
	 * bisa memanggilnya bersamaan, dan tanpa penjaga ini masing-masing
	 * membuat tab server sendiri.
	 */
	const linkTabToServerDocument = useCallback(
		(tabId: string, documentId: string): Promise<boolean> => {
			const running = linking.current.get(tabId)
			if (running) return running
			const work = (async (): Promise<boolean> => {
				if (linkageRef.current[tabId]) return true
				const meta = readTabs(doc).find((tab) => tab.id === tabId)
				if (!meta) return false
				setStatus(tabId, 'saving')
				try {
					const tab = await createTabApi(documentId, {
						title: meta.title,
						content: serializeTab(tabId),
						emoji: meta.emoji,
						language: meta.language,
						layout: readTabLayoutOverride(doc, tabId),
					})
					const linked: SyncLinkage = { serverId: tab.id, documentId, lastSyncedAt: Date.now() }
					// Langsung terlihat oleh jalur lain sebelum render berikutnya.
					linkageRef.current = { ...linkageRef.current, [tabId]: linked }
					setStore((current) => ({ ...current, linkage: { ...current.linkage, [tabId]: linked } }))
					setStatus(tabId, null)
					retry.clear(tabId)
					return true
				} catch (error) {
					// Dokumen servernya sudah dihapus: lepas tautan seluruh dokumennya.
					if (isGone(error)) {
						unlinkDocument(documentId)
						setStatus(tabId, null)
						return false
					}
					const status = failedStatus(error)
					setStatus(tabId, status)
					if (status === 'error') retry.schedule(tabId)
					else rejectedLinks.current.add(tabId)
					return false
				} finally {
					linking.current.delete(tabId)
				}
			})()
			linking.current.set(tabId, work)
			return work
		},
		[doc, serializeTab, setStatus, setStore, unlinkDocument, retry],
	)

	/* Percobaan ulang memakai jalur yang sama dengan simpanan biasa. */
	retryTabRef.current = (tabId: string) => {
		const linkage = linkageRef.current[tabId]
		if (linkage) {
			void pushRef.current(tabId, linkage)
			return
		}
		const plan = planCloudSave(tabId, readDocs(doc), linkageRef.current)
		if (plan.kind === 'add-tab') void linkTabToServerDocument(tabId, plan.documentId)
		else retry.clear(tabId)
	}

	// biome-ignore lint/correctness/useExhaustiveDependencies: onlineTick memang cuma pemicu - naiknya angka itulah sinyal "jaringan kembali, coba tautkan lagi"
	useEffect(
		function linkNewTabsOfCloudDocuments() {
			/*
			 * Dokumen yang satu tabnya sudah di cloud adalah dokumen cloud: tab
			 * baru, duplikat, dan tab yang dulu tidak ikut disimpan masuk ke
			 * dokumen server yang sama (SHL-6). Dikerjakan bertahap - selesainya
			 * satu penautan mengubah `store.linkage` dan menjalankan efek ini lagi.
			 */
			if (!storeHydrated) return
			const busy = new Set(linking.current.keys())
			const room = LINK_CONCURRENCY - busy.size
			if (room <= 0) return
			// Yang menunggu giliran coba ulang tidak didahului, dan yang ditolak
			// permanen tidak dikirim ulang.
			for (const tabId of rejectedLinks.current) busy.add(tabId)
			const awaiting = tabsAwaitingCloud(documents, store.linkage, busy).filter(
				({ tabId }) => !retry.has(tabId),
			)
			for (const { tabId, documentId } of awaiting.slice(0, room)) {
				void linkTabToServerDocument(tabId, documentId)
			}
		},
		[storeHydrated, documents, store.linkage, linkTabToServerDocument, retry, onlineTick],
	)

	useEffect(
		function retrySavesWhenOnline() {
			const onOnline = () => {
				retry.retryAllNow()
				setOnlineTick((tick) => tick + 1)
			}
			window.addEventListener('online', onOnline)
			return () => window.removeEventListener('online', onOnline)
		},
		[retry],
	)

	const saveToCloud = useCallback(
		async (tabId: string): Promise<boolean> => {
			const meta = readTabs(doc).find((tab) => tab.id === tabId)
			if (!meta) return false

			const plan = planCloudSave(tabId, readDocs(doc), linkageRef.current)
			const existing = linkageRef.current[tabId]
			if (plan.kind === 'push' && existing) {
				clearTimers(tabId)
				return pushToServer(tabId, existing)
			}
			// Dokumennya sudah di cloud lewat tab lain: tab ini masuk ke dokumen
			// server yang sama, bukan menjadi dokumen baru (SHL-6).
			if (plan.kind === 'add-tab') {
				rejectedLinks.current.delete(tabId)
				const linked = await linkTabToServerDocument(tabId, plan.documentId)
				if (linked) void invalidateDocuments()
				return linked
			}
			const parentId = findTabDoc(doc, tabId)
			const docTitle = parentId
				? (readDocs(doc).find((dok) => dok.id === parentId)?.title ?? meta.title)
				: meta.title

			setStatus(tabId, 'saving')
			try {
				const docBrief = parentId ? readDocBrief(doc, parentId) : null
				const created = await createDocument({
					title: docTitle,
					content: serializeTab(tabId),
					emoji: meta.emoji,
					language: meta.language,
					layout: parentId ? readDocLayout(doc, parentId) : null,
					tabLayout: readTabLayoutOverride(doc, tabId),
					...(docBrief ? { brief: docBrief } : {}),
				})
				const serverTabId = created.tabs[0]?.id
				if (!serverTabId) throw new Error('Respons dokumen tanpa tab')
				const linked: SyncLinkage = {
					serverId: serverTabId,
					documentId: created.id,
					lastSyncedAt: Date.now(),
					lastDocTitle: docTitle,
					lastDocLayoutKey: layoutSyncKey(parentId ? readDocLayout(doc, parentId) : null),
					lastDocBriefKey: briefSyncKey(docBrief),
				}
				// Tab lain dokumen ini menyusul ke dokumen server yang sama lewat
				// `linkNewTabsOfCloudDocuments`; tautan ini harus sudah terlihat.
				linkageRef.current = { ...linkageRef.current, [tabId]: linked }
				setStore((current) => ({ ...current, linkage: { ...current.linkage, [tabId]: linked } }))
				setStatus(tabId, null)
				void invalidateDocuments()
				return true
			} catch (error) {
				setStatus(tabId, failedStatus(error))
				return false
			}
		},
		[
			doc,
			clearTimers,
			pushToServer,
			serializeTab,
			setStatus,
			setStore,
			invalidateDocuments,
			linkTabToServerDocument,
		],
	)

	const openFromLibrary = useCallback(
		async (serverDoc: DocumentDetail): Promise<string | null> => {
			/* Halaman /d/<id> bisa sampai di sini sebelum simpanan lokal terbaca;
			 * dokumen yang ditulis saat itu hilang (lihat `whenLoaded`). */
			await whenLoaded()
			const opened = Object.entries(linkageRef.current).find(
				([, linkage]) => linkage.documentId === serverDoc.id,
			)
			if (opened) {
				selectSession(opened[0])
				return opened[0]
			}
			if (readDocs(doc).length >= MAX_DOCUMENTS) return null
			if (serverDoc.tabs.length === 0 || serverDoc.tabs.length > MAX_SESSIONS) return null
			const contents = await Promise.all(serverDoc.tabs.map((tab) => getTab(tab.id)))

			let firstTabId = ''
			const pairs: Array<{ localTabId: string; serverTabId: string }> = []
			doc.transact(() => {
				const docId = createLocalDocument(doc, serverDoc.title)
				firstTabId = readTabs(doc, docId)[0]?.id ?? ''
				if (!firstTabId) return
				applyDocLayout(doc, docId, serverDoc.layout)
				writeDocBrief(doc, docId, serverDoc.brief ?? null, SYNC_ORIGIN)
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
					applyTabLayout(doc, pair.localTabId, serverTab.layout ?? null)
					updateTab(doc, pair.localTabId, {
						title: serverTab.title,
						emoji: serverTab.emoji,
						language: serverTab.language,
						comments: restoreComments(serverTab.id),
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
						lastDocLayoutKey: layoutSyncKey(serverDoc.layout),
						lastDocBriefKey: briefSyncKey(serverDoc.brief ?? null),
					}
				}
				return { ...current, linkage: next }
			})
			for (const pair of pairs) setStatus(pair.localTabId, null)
			selectSession(firstTabId)
			return firstTabId
		},
		[doc, selectSession, setStatus, setStore, whenLoaded],
	)

	const linkTab = useCallback(
		async (tabId: string, serverId: string) => {
			if (linkageRef.current[tabId]) return
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
	const saveDocumentToCloud = useCallback(
		async (docId: string): Promise<boolean> => {
			const dok = readDocs(doc).find((entry) => entry.id === docId)
			if (!dok) return false
			let parentId: string | null = null
			for (const tabId of dok.tabOrder) {
				const documentId = linkageRef.current[tabId]?.documentId
				if (documentId) {
					parentId = documentId
					break
				}
			}

			try {
				for (const tabId of dok.tabOrder) {
					const meta = readTabs(doc).find((tab) => tab.id === tabId)
					if (!meta) continue

					const existing = linkageRef.current[tabId]
					if (existing) {
						clearTimers(tabId)
						await pushToServer(tabId, existing)
						continue
					}
					if (parentId) {
						// Lewat jalur yang sama dengan penautan otomatis, jadi tab ini
						// tidak pernah dibuatkan dua tab server.
						if (!(await linkTabToServerDocument(tabId, parentId))) return false
						continue
					}

					setStatus(tabId, 'saving')
					const docBrief = readDocBrief(doc, docId)
					const created = await createDocument({
						title: dok.title,
						content: serializeTab(tabId),
						emoji: meta.emoji,
						language: meta.language,
						layout: readDocLayout(doc, docId),
						tabLayout: readTabLayoutOverride(doc, tabId),
						...(docBrief ? { brief: docBrief } : {}),
					})
					const serverTabId = created.tabs[0]?.id
					if (!serverTabId) throw new Error('Respons dokumen tanpa tab')
					parentId = created.id
					const linked: SyncLinkage = {
						serverId: serverTabId,
						documentId: created.id,
						lastSyncedAt: Date.now(),
						lastDocTitle: dok.title,
						lastDocLayoutKey: layoutSyncKey(readDocLayout(doc, docId)),
						lastDocBriefKey: briefSyncKey(docBrief),
					}
					linkageRef.current = { ...linkageRef.current, [tabId]: linked }
					setStore((current) => ({ ...current, linkage: { ...current.linkage, [tabId]: linked } }))
					setStatus(tabId, null)
				}
				void invalidateDocuments()
				return true
			} catch (error) {
				// Hanya pembuatan dokumen server yang sampai di sini; tab berikutnya
				// mengurus kegagalannya sendiri di `linkTabToServerDocument`.
				for (const tabId of dok.tabOrder) {
					if (!linkageRef.current[tabId]) setStatus(tabId, failedStatus(error))
				}
				return false
			}
		},
		[
			doc,
			clearTimers,
			pushToServer,
			serializeTab,
			setStatus,
			setStore,
			invalidateDocuments,
			linkTabToServerDocument,
		],
	)

	const syncStatus = useCallback(
		(tabId: string): SyncStatus => transient[tabId] ?? (store.linkage[tabId] ? 'synced' : 'local'),
		[transient, store.linkage],
	)

	const serverDocId = useCallback(
		(docId: string): string | null => {
			const dok = documents.find((entry) => entry.id === docId)
			if (!dok) return null
			for (const tabId of dok.tabOrder) {
				const documentId = store.linkage[tabId]?.documentId
				if (documentId) return documentId
			}
			return null
		},
		[documents, store.linkage],
	)

	const value = useMemo<SyncContextValue>(
		() => ({
			linkage: store.linkage,
			syncStatus,
			saveToCloud,
			openFromLibrary,
			linkTab,
			serverDocId,
			saveDocumentToCloud,
		}),
		[store.linkage, syncStatus, saveToCloud, openFromLibrary, linkTab, serverDocId, saveDocumentToCloud],
	)

	return (
		<SyncContext.Provider value={value}>
			{/* Kolaborasi butuh tautan tab → tab server dari sini, dan memberi tahu
			    tab mana yang isinya mengalir lewat websocket (bukan PUT naskah). */}
			<CollabProvider linkage={store.linkage} onCollabTab={markCollabTab}>
				{children}
			</CollabProvider>
		</SyncContext.Provider>
	)
}

export function useSync(): SyncContextValue {
	const context = useContext(SyncContext)
	if (!context) throw new Error('useSync must be used inside <SyncProvider>')
	return context
}
