'use client'

import type { GrammarScores } from '@writer-hub/shared'
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
import * as Y from 'yjs'
import { useDocument } from '@/features/document/document-context'
import type { EditorSuggestion } from '@/features/document/suggestions'
import { useEditorInstance } from '@/features/editor/editor-context'
import { editorPlainText } from '@/features/editor/text-content'
import { usePersistentState } from '@/lib/use-persistent-state'
import { watchPersistence } from './local-persistence'
import {
	EMPTY_LOCAL_VIEW,
	LOCAL_VIEW_STORAGE_KEY,
	type LocalView,
	patchTabView,
	pruneTabViews,
	storedActiveTabId,
	tabView,
} from './local-view'
import { migrateLegacySessions } from './migrate-legacy'
import { migrateTabsToDocs } from './migrate-to-docs'
import type { CommentReply, CommentThread } from './types'
import {
	createDocument,
	createTab,
	type DocMeta,
	deleteTab,
	docsRoot,
	duplicateDocument,
	duplicateTab,
	findTabDoc,
	holdRootsUntilLoaded,
	moveTab,
	readDocs,
	readTabs,
	releaseRoots,
	type TabMeta,
	tabPreview,
	tabsRoot,
	touchTab,
	updateTab,
	deleteDocument as ydocDeleteDocument,
	moveDocument as ydocMoveDocument,
	renameDocument as ydocRenameDocument,
} from './ydoc'

export type { CommentReply, CommentThread } from './types'

const YDOC_NAME = 'writer-hub-doc'
export const MAX_SESSIONS = 50
export const MAX_DOCUMENTS = 100
const TOUCH_DEBOUNCE_MS = 600

export interface Session extends TabMeta {
	outlineExpanded: boolean
	preview: string
}

export function sessionLabel(session: Session): string {
	const title = session.title?.trim()
	if (title && title !== 'Untitled document') return title
	return session.preview?.slice(0, 48) || 'Untitled document'
}

interface SessionContextValue {
	doc: Y.Doc
	documents: DocMeta[]
	activeDocId: string | null
	activeTabId: string | null
	sessions: Session[]
	activeId: string | null
	hydrated: boolean
	/** Simpanan lokal tidak bisa dipakai: suntingan hanya hidup di tab ini. */
	persistenceFailed: boolean
	/**
	 * Selesai setelah simpanan lokal terbaca dan `boot()` jalan. Apa pun yang
	 * MENULIS dokumen baru ke Y.Doc dan bisa terpanggil sebelum itu (galeri
	 * /new, membuka dokumen server) harus menunggunya: sebelum itu wadah
	 * dokumen masih ditahan (`holdRootsUntilLoaded`) dan tulisannya hilang.
	 */
	whenLoaded: () => Promise<void>
	newSession: () => void
	newDocument: () => void
	selectSession: (id: string) => void
	selectDocument: (id: string) => void
	deleteSession: (id: string) => void
	deleteDocument: (id: string) => void
	renameSession: (id: string, title: string) => void
	renameDocument: (id: string, title: string, origin?: unknown) => void
	duplicateSession: (id: string) => void
	/** Salin dokumen (atau dokumen pemilik tab ini); kembali id salinannya. */
	duplicateDocument: (idOrTabId: string) => string | null
	setSessionEmoji: (id: string, emoji: string | null) => void
	moveSession: (movedId: string, destId: string) => void
	moveDocument: (movedId: string, destId: string) => void
	setSessionOutlineExpanded: (id: string, expanded: boolean) => void
	languageOverride: string | null
	setLanguageOverride: (language: string | null) => void
	setTabResults: (
		id: string,
		results: { suggestions: EditorSuggestion[]; scores: GrammarScores | null },
	) => void
	comments: CommentThread[]
	addComment: (thread: CommentThread) => void
	replyToComment: (id: string, reply: CommentReply) => void
	setCommentResolved: (id: string, resolved: boolean) => void
	updateComment: (id: string, patch: Partial<Omit<CommentThread, 'id'>>) => void
	removeComment: (id: string) => void
}

const SessionContext = createContext<SessionContextValue | null>(null)

export function SessionProvider({ children }: { children: ReactNode }) {
	const [doc] = useState(() => {
		const fresh = new Y.Doc()
		/* Pembaca yang berjalan saat render pertama pun tidak boleh membuat
		 * wadah sebelum simpanan IndexedDB terbaca - lihat `holdRootsUntilLoaded`. */
		holdRootsUntilLoaded(fresh)
		return fresh
	})
	const [documents, setDocuments] = useState<DocMeta[]>([])
	const [tabs, setTabs] = useState<Array<TabMeta & { preview: string }>>([])
	const [loaded, setLoaded] = useState(false)
	const loadedRef = useRef(false)
	const loadWaiters = useRef<Array<() => void>>([])
	const whenLoaded = useCallback(
		(): Promise<void> =>
			loadedRef.current
				? Promise.resolve()
				: new Promise((resolve) => {
						loadWaiters.current.push(resolve)
					}),
		[],
	)
	const [persistenceFailed, setPersistenceFailed] = useState(false)
	const [view, setView, viewHydrated] = usePersistentState<LocalView>(
		LOCAL_VIEW_STORAGE_KEY,
		EMPTY_LOCAL_VIEW,
	)
	const { state, dispatch } = useDocument()
	const { editor } = useEditorInstance()

	useEffect(
		function hydrateFromIndexeddb() {
			const provider = new IndexeddbPersistence(YDOC_NAME, doc)

			/*
			 * Jalur bootnya sama persis, entah simpanannya terbaca atau tidak: yang
			 * membedakan hanya ada-tidaknya isi yang lebih dulu dituang ke `doc`.
			 * Dokumen kosong dibuat di sini, jadi ia HANYA boleh dipanggil setelah
			 * provider dipastikan tidak akan menempel lagi belakangan.
			 */
			const boot = () => {
				releaseRoots(doc)
				const migrated = migrateLegacySessions(doc)
				migrateTabsToDocs(doc)
				if (readDocs(doc).length === 0) createDocument(doc)
				const migratedTabId = migrated?.activeId ?? null
				if (migratedTabId) {
					setView((current) =>
						storedActiveTabId(current)
							? current
							: {
									...current,
									activeTabId: migratedTabId,
									activeDocId: findTabDoc(doc, migratedTabId),
								},
					)
				}
				setLoaded(true)
				loadedRef.current = true
				for (const resolve of loadWaiters.current.splice(0)) resolve()
			}

			const stopWatching = watchPersistence(provider, {
				onReady: () => {
					setPersistenceFailed(false)
					boot()
				},
				/* Peramban yang menolak IndexedDB tetap dapat editor yang jalan -
				 * hanya tanpa simpanan, dan pengguna diberi tahu lewat spanduknya. */
				onUnavailable: () => {
					setPersistenceFailed(true)
					boot()
				},
			})

			return () => {
				stopWatching()
				/* Penolakannya ditelan: `destroy()` meneruskan promise pembukaan DB
				 * yang gagal, dan itu bukan kabar baru di titik ini. */
				Promise.resolve(provider.destroy()).catch(() => {})
			}
		},
		[doc, setView],
	)
	useEffect(
		function rebuildOnYdocChange() {
			const docs = docsRoot(doc)
			const tabsRoot_ = tabsRoot(doc)
			const rebuild = () => {
				setDocuments(readDocs(doc))
				setTabs(readTabs(doc).map((meta) => ({ ...meta, preview: tabPreview(doc, meta.id) })))
			}

			rebuild()
			docs.root.observeDeep(rebuild)
			tabsRoot_.root.observeDeep(rebuild)
			return () => {
				docs.root.unobserveDeep(rebuild)
				tabsRoot_.root.unobserveDeep(rebuild)
			}
		},
		[doc],
	)
	const storedTabId = storedActiveTabId(view)

	const activeDocId = useMemo(() => {
		if (documents.length === 0) return null
		const stored = view.activeDocId
		if (stored && documents.some((dok) => dok.id === stored)) return stored
		if (storedTabId) {
			const owner = documents.find((dok) => dok.tabOrder.includes(storedTabId))
			if (owner) return owner.id
		}
		return documents[0].id
	}, [documents, view.activeDocId, storedTabId])

	const activeId = useMemo(() => {
		const owner = documents.find((dok) => dok.id === activeDocId)
		if (!owner || owner.tabOrder.length === 0) return null
		return storedTabId && owner.tabOrder.includes(storedTabId) ? storedTabId : owner.tabOrder[0]
	}, [documents, activeDocId, storedTabId])

	const sessions = useMemo<Session[]>(() => {
		const owner = documents.find((dok) => dok.id === activeDocId)
		if (!owner) return []
		const byId = new Map(tabs.map((tab) => [tab.id, tab]))
		return owner.tabOrder
			.map((id) => byId.get(id))
			.filter((tab): tab is TabMeta & { preview: string } => tab !== undefined)
			.map((tab) => ({ ...tab, outlineExpanded: tabView(view, tab.id).outlineExpanded }))
	}, [documents, activeDocId, tabs, view])
	const touchedText = useRef<string | null>(null)
	/* State reducer dari sebelum `load` terakhir: selama itu yang masih
	 * tampil, saran dan skor di dalamnya milik tab sebelumnya. */
	const preLoadState = useRef<typeof state | null>(null)
	const stateRef = useRef(state)
	stateRef.current = state
	useEffect(
		function loadActiveTabIntoEditor() {
			if (!loaded || !editor || editor.isDestroyed || !activeId) return
			const text = editorPlainText(editor)
			const title = readDocs(doc).find((dok) => dok.id === activeDocId)?.title ?? 'Untitled document'
			const local = tabView(view, activeId)

			touchedText.current = text
			preLoadState.current = stateRef.current

			dispatch({
				type: 'load',
				document: { title, text, suggestions: local.suggestions, scores: local.scores },
			})
		},
		[loaded, editor, activeId, activeDocId, doc, dispatch],
	)
	/*
	 * Judul mengalir SATU arah: Y.Doc → state. Penyuntingnya (kolom judul di
	 * bilah atas, panel tab, sinkron server) menulis lewat `renameDocument`.
	 *
	 * Dulu ada efek yang menulis balik `state.title` ke Y.Doc bila berbeda.
	 * Saat halaman dimuat sebelum editor siap, judul bawaan reducer ("Untitled
	 * document") ikut ditulis balik dan menimpa judul tersimpan - juga di
	 * server; dan pada dokumen baru penandanya tidak pernah bersih sehingga
	 * semua ganti judul dibuang (uji editor 2 Okt, SHL-2).
	 */
	const activeTitle = documents.find((dok) => dok.id === activeDocId)?.title
	useEffect(
		function followStoredTitle() {
			if (activeTitle !== undefined) dispatch({ type: 'setTitle', title: activeTitle })
		},
		[activeTitle, dispatch],
	)
	useEffect(
		function touchTabAfterEdit() {
			if (!loaded || !activeId) return
			if (state.text === touchedText.current) return

			const timer = setTimeout(() => {
				touchedText.current = state.text
				touchTab(doc, activeId)
			}, TOUCH_DEBOUNCE_MS)

			return () => clearTimeout(timer)
		},
		[loaded, activeId, doc, state.text],
	)
	useEffect(
		function storeSuggestionsAndScores() {
			if (!loaded || !activeId || state === preLoadState.current) return
			setView((current) =>
				patchTabView(current, activeId, { suggestions: state.suggestions, scores: state.scores }),
			)
		},
		[loaded, activeId, setView, state, state.suggestions, state.scores],
	)
	useEffect(
		function pruneViewsForRemovedTabs() {
			if (!loaded || tabs.length === 0) return
			const ids = tabs.map((tab) => tab.id)
			setView((current) => {
				const pruned = pruneTabViews(current, ids)
				return Object.keys(pruned.tabs).length === Object.keys(current.tabs).length ? current : pruned
			})
		},
		[loaded, tabs, setView],
	)

	const newSession = useCallback(() => {
		if (!activeDocId) return
		if (readTabs(doc, activeDocId).length >= MAX_SESSIONS) return
		const id = createTab(doc, activeDocId)
		setView((current) => ({ ...current, activeTabId: id }))
	}, [doc, activeDocId, setView])

	const newDocument = useCallback(() => {
		const create = () => {
			if (readDocs(doc).length >= MAX_DOCUMENTS) return
			const docId = createDocument(doc)
			const tabId = readTabs(doc, docId)[0]?.id ?? null
			setView((current) => ({ ...current, activeDocId: docId, activeTabId: tabId }))
		}
		/* Kartu "Dokumen kosong" di /new bisa diklik sebelum simpanan terbaca. */
		if (loadedRef.current) create()
		else void whenLoaded().then(create)
	}, [doc, setView, whenLoaded])
	const selectSession = useCallback(
		(id: string) => {
			setView((current) => {
				if (storedActiveTabId(current) === id) return current
				const next = { ...current, activeTabId: id }
				const owner = findTabDoc(doc, id)
				if (owner) next.activeDocId = owner
				return patchTabView(next, id, { outlineExpanded: false })
			})
		},
		[doc, setView],
	)

	const selectDocument = useCallback(
		(id: string) => {
			setView((current) => {
				if (current.activeDocId === id) return current
				const target = readDocs(doc).find((dok) => dok.id === id)
				if (!target) return current
				const currentTab = storedActiveTabId(current)
				const tabId =
					currentTab && target.tabOrder.includes(currentTab) ? currentTab : (target.tabOrder[0] ?? null)
				const next = { ...current, activeDocId: id, activeTabId: tabId }
				return tabId ? patchTabView(next, tabId, { outlineExpanded: false }) : next
			})
		},
		[doc, setView],
	)

	const deleteSession = useCallback(
		(id: string) => {
			const ownerId = findTabDoc(doc, id)
			if (!ownerId) return
			const docTabs = readTabs(doc, ownerId)
			const at = docTabs.findIndex((tab) => tab.id === id)
			if (at === -1) return
			const docAt = readDocs(doc).findIndex((dok) => dok.id === ownerId)
			const remaining = docTabs.filter((tab) => tab.id !== id)
			deleteTab(doc, id)

			let fallbackDoc = ownerId
			let fallbackTab = remaining[at]?.id ?? remaining[remaining.length - 1]?.id
			if (!fallbackTab) {
				const docsLeft = readDocs(doc)
				const neighbor = docsLeft[docAt] ?? docsLeft[docsLeft.length - 1]
				if (neighbor) {
					fallbackDoc = neighbor.id
					fallbackTab = neighbor.tabOrder[0]
				} else {
					fallbackDoc = createDocument(doc)
					fallbackTab = readTabs(doc, fallbackDoc)[0]?.id
				}
			}

			setView((view) => {
				if (storedActiveTabId(view) !== id) return view
				const next = { ...view, activeDocId: fallbackDoc, activeTabId: fallbackTab ?? null }
				return fallbackTab ? patchTabView(next, fallbackTab, { outlineExpanded: false }) : next
			})
		},
		[doc, setView],
	)

	const deleteDocumentAction = useCallback(
		(id: string) => {
			const docs = readDocs(doc)
			const at = docs.findIndex((dok) => dok.id === id)
			if (at === -1) return

			ydocDeleteDocument(doc, id)
			const docsLeft = readDocs(doc)
			const fallbackDoc =
				docsLeft.length > 0 ? (docsLeft[at] ?? docsLeft[docsLeft.length - 1]).id : createDocument(doc)
			const fallbackTab = readTabs(doc, fallbackDoc)[0]?.id ?? null

			setView((view) =>
				view.activeDocId === id ? { ...view, activeDocId: fallbackDoc, activeTabId: fallbackTab } : view,
			)
		},
		[doc, setView],
	)

	const renameSession = useCallback(
		(id: string, title: string) => {
			updateTab(doc, id, { title, updatedAt: Date.now() })
		},
		[doc],
	)

	const renameDocumentAction = useCallback(
		(id: string, title: string, origin?: unknown) => {
			ydocRenameDocument(doc, id, title, origin)
			if (id === activeDocId) dispatch({ type: 'setTitle', title })
		},
		[doc, activeDocId, dispatch],
	)

	const duplicateSession = useCallback((id: string) => void duplicateTab(doc, id), [doc])
	const duplicateDocumentAction = useCallback(
		(idOrTabId: string) => duplicateDocument(doc, findTabDoc(doc, idOrTabId) ?? idOrTabId),
		[doc],
	)

	const setSessionEmoji = useCallback(
		(id: string, emoji: string | null) => updateTab(doc, id, { emoji }),
		[doc],
	)

	const moveSession = useCallback((movedId: string, destId: string) => moveTab(doc, movedId, destId), [doc])

	const moveDocumentAction = useCallback(
		(movedId: string, destId: string) => ydocMoveDocument(doc, movedId, destId),
		[doc],
	)

	const setSessionOutlineExpanded = useCallback(
		(id: string, expanded: boolean) => {
			setView((current) => patchTabView(current, id, { outlineExpanded: expanded }))
		},
		[setView],
	)

	const setTabResults = useCallback(
		(id: string, results: { suggestions: EditorSuggestion[]; scores: GrammarScores | null }) => {
			setView((current) => patchTabView(current, id, results))
		},
		[setView],
	)

	const setLanguageOverride = useCallback(
		(language: string | null) => {
			if (activeId) updateTab(doc, activeId, { language })
		},
		[doc, activeId],
	)
	const updateComments = useCallback(
		(change: (threads: CommentThread[]) => CommentThread[]) => {
			if (!activeId) return
			const current = readTabs(doc).find((tab) => tab.id === activeId)?.comments ?? []
			updateTab(doc, activeId, { comments: change(current) })
		},
		[doc, activeId],
	)

	const addComment = useCallback(
		(thread: CommentThread) => updateComments((threads) => [...threads, thread]),
		[updateComments],
	)

	const replyToComment = useCallback(
		(id: string, reply: CommentReply) =>
			updateComments((threads) =>
				threads.map((thread) =>
					thread.id === id ? { ...thread, replies: [...thread.replies, reply] } : thread,
				),
			),
		[updateComments],
	)

	const setCommentResolved = useCallback(
		(id: string, resolved: boolean) =>
			updateComments((threads) =>
				threads.map((thread) => (thread.id === id ? { ...thread, resolved } : thread)),
			),
		[updateComments],
	)
	const updateComment = useCallback(
		(id: string, patch: Partial<Omit<CommentThread, 'id'>>) =>
			updateComments((threads) =>
				threads.map((thread) => (thread.id === id ? { ...thread, ...patch } : thread)),
			),
		[updateComments],
	)

	const removeComment = useCallback(
		(id: string) => updateComments((threads) => threads.filter((thread) => thread.id !== id)),
		[updateComments],
	)

	const active = sessions.find((session) => session.id === activeId)

	const value = useMemo<SessionContextValue>(
		() => ({
			doc,
			documents,
			activeDocId,
			activeTabId: activeId,
			sessions,
			activeId,
			hydrated: loaded && viewHydrated,
			persistenceFailed,
			whenLoaded,
			newSession,
			newDocument,
			selectSession,
			selectDocument,
			deleteSession,
			deleteDocument: deleteDocumentAction,
			renameSession,
			renameDocument: renameDocumentAction,
			duplicateSession,
			duplicateDocument: duplicateDocumentAction,
			setSessionEmoji,
			moveSession,
			moveDocument: moveDocumentAction,
			setSessionOutlineExpanded,
			setTabResults,
			languageOverride: active?.language ?? null,
			setLanguageOverride,
			comments: active?.comments ?? [],
			addComment,
			replyToComment,
			setCommentResolved,
			updateComment,
			removeComment,
		}),
		[
			doc,
			documents,
			activeDocId,
			sessions,
			activeId,
			loaded,
			viewHydrated,
			persistenceFailed,
			whenLoaded,
			active,
			newSession,
			newDocument,
			selectSession,
			selectDocument,
			deleteSession,
			deleteDocumentAction,
			renameSession,
			renameDocumentAction,
			duplicateSession,
			duplicateDocumentAction,
			setSessionEmoji,
			moveSession,
			moveDocumentAction,
			setSessionOutlineExpanded,
			setTabResults,
			setLanguageOverride,
			addComment,
			replyToComment,
			setCommentResolved,
			updateComment,
			removeComment,
		],
	)

	return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSessions(): SessionContextValue {
	const context = useContext(SessionContext)
	if (!context) throw new Error('useSessions harus dipakai di dalam <SessionProvider>')
	return context
}
