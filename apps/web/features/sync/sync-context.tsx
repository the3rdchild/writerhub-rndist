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
import { backupComments, restoreComments } from '@/features/comments/comment-backup'
import {
	createDocument,
	createTabApi,
	getTab,
	updateDocument,
	updateTab as updateTabApi,
} from '@/features/documents/api'
import type { DocumentDetail } from '@/features/documents/types'
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
import { usePersistentState } from '@/lib/use-persistent-state'
import {
	applyDocLayout,
	applyTabLayout,
	layoutSyncKey,
	readDocLayout,
	readTabLayoutOverride,
} from './layout-sync'
import { fragmentToJSON, jsonToFragment } from './serialize'
import { resolveTitle } from './title-sync'

const SYNC_STORAGE_KEY = 'writer-hub-sync'
const IDLE_SAVE_MS = 3_000
const MAX_SAVE_MS = 30_000
const TITLE_SYNC_MS = 1_200
const MAX_SESSIONS = 50
export const SYNC_ORIGIN = 'sync'

export type SyncStatus = 'local' | 'synced' | 'dirty' | 'saving' | 'error'

export interface SyncLinkage {
	serverId: string
	documentId: string
	lastSyncedAt: number
	lastDocTitle?: string
	/** Kunci `layoutSyncKey` dari tata letak dasar dokumen yang terakhir terkirim. */
	lastDocLayoutKey?: string
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

interface SaveTimers {
	idle?: ReturnType<typeof setTimeout>
	max?: ReturnType<typeof setTimeout>
}

export function SyncProvider({ children }: { children: ReactNode }) {
	const { doc, documents, activeId, selectSession, renameDocument } = useSessions()
	const { editor } = useEditorInstance()
	const queryClient = useQueryClient()
	const serverDocuments = useDocuments()

	const [store, setStore, storeHydrated] = usePersistentState<{
		linkage: Record<string, SyncLinkage>
	}>(SYNC_STORAGE_KEY, { linkage: {} })
	const [transient, setTransient] = useState<Record<string, 'dirty' | 'saving' | 'error'>>({})

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
			setStatus(tabId, 'saving')
			try {
				await updateTabApi(linkage.serverId, {
					title: meta.title,
					content: serializeTab(tabId),
					emoji: meta.emoji,
					language: meta.language,
					layout: readTabLayoutOverride(doc, tabId),
				})
				backupComments(linkage.serverId, meta.comments)
				if (
					docTitle !== undefined &&
					linkage.lastDocTitle !== undefined &&
					docTitle !== linkage.lastDocTitle
				) {
					await updateDocument(linkage.documentId, { title: docTitle })
				}
				const docLayout = parentId ? readDocLayout(doc, parentId) : null
				const docLayoutKey = layoutSyncKey(docLayout)
				if (parentId && docLayoutKey !== (linkage.lastDocLayoutKey ?? '')) {
					await updateDocument(linkage.documentId, { layout: docLayout })
				}
				const synced: SyncLinkage = {
					...linkage,
					lastSyncedAt: Date.now(),
					lastDocLayoutKey: docLayoutKey,
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
							.catch(() => {})
					}, TITLE_SYNC_MS),
				)
			}
		},
		[storeHydrated, documents, store.linkage, setStore, invalidateDocuments],
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
		}
	}, [])

	const saveToCloud = useCallback(
		async (tabId: string): Promise<boolean> => {
			const meta = readTabs(doc).find((tab) => tab.id === tabId)
			if (!meta) return false

			const existing = linkageRef.current[tabId]
			if (existing) {
				clearTimers(tabId)
				return pushToServer(tabId, existing)
			}
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
					layout: parentId ? readDocLayout(doc, parentId) : null,
					tabLayout: readTabLayoutOverride(doc, tabId),
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
							lastDocLayoutKey: layoutSyncKey(parentId ? readDocLayout(doc, parentId) : null),
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
					}
				}
				return { ...current, linkage: next }
			})
			for (const pair of pairs) setStatus(pair.localTabId, null)
			selectSession(firstTabId)
			return firstTabId
		},
		[doc, selectSession, setStatus, setStore],
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

					setStatus(tabId, 'saving')
					if (!parentId) {
						const created = await createDocument({
							title: dok.title,
							content: serializeTab(tabId),
							emoji: meta.emoji,
							language: meta.language,
							layout: readDocLayout(doc, docId),
							tabLayout: readTabLayoutOverride(doc, tabId),
						})
						const serverTabId = created.tabs[0]?.id
						if (!serverTabId) throw new Error('Respons dokumen tanpa tab')
						parentId = created.id
						setStore((current) => ({
							...current,
							linkage: {
								...current.linkage,
								[tabId]: {
									serverId: serverTabId,
									documentId: created.id,
									lastSyncedAt: Date.now(),
									lastDocTitle: dok.title,
									lastDocLayoutKey: layoutSyncKey(readDocLayout(doc, docId)),
								},
							},
						}))
					} else {
						const tab = await createTabApi(parentId, {
							title: meta.title,
							content: serializeTab(tabId),
							emoji: meta.emoji,
							language: meta.language,
							layout: readTabLayoutOverride(doc, tabId),
						})
						const serverDocId = parentId
						setStore((current) => ({
							...current,
							linkage: {
								...current.linkage,
								[tabId]: {
									serverId: tab.id,
									documentId: serverDocId,
									lastSyncedAt: Date.now(),
								},
							},
						}))
					}
					setStatus(tabId, null)
				}
				void invalidateDocuments()
				return true
			} catch {
				for (const tabId of dok.tabOrder) {
					if (!linkageRef.current[tabId]) setStatus(tabId, 'error')
				}
				return false
			}
		},
		[doc, clearTimers, pushToServer, serializeTab, setStatus, setStore, invalidateDocuments],
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

	return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>
}

export function useSync(): SyncContextValue {
	const context = useContext(SyncContext)
	if (!context) throw new Error('useSync harus dipakai di dalam <SyncProvider>')
	return context
}
