'use client'

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
import type { GrammarScores } from '@writer-hub/shared'
import { useDocument } from '@/features/document/document-context'
import type { EditorSuggestion } from '@/features/document/suggestions'
import { useEditorInstance } from '@/features/editor/editor-context'
import { editorPlainText } from '@/features/editor/text-content'
import { usePersistentState } from '@/lib/use-persistent-state'
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
	deleteDocument as ydocDeleteDocument,
	deleteTab,
	type DocMeta,
	docsRoot,
	duplicateTab,
	findTabDoc,
	moveDocument as ydocMoveDocument,
	moveTab,
	readDocs,
	readTabs,
	renameDocument as ydocRenameDocument,
	type TabMeta,
	tabPreview,
	tabsRoot,
	touchTab,
	updateTab,
} from './ydoc'

export type { CommentReply, CommentThread } from './types'

/**
 * Dokumen berisi tab; satu tab = satu naskah, dan naskahnya hidup di dalam
 * Y.Doc.
 *
 * Sebelumnya lapisan ini memotret editor ke localStorage tiap 400 ms lalu
 * memuatnya balik saat berpindah tab. Dengan CRDT, potret dan muat-balik itu
 * tidak ada lagi: editor terikat langsung ke `Y.XmlFragment` milik tabnya, dan
 * Yjs sendiri yang menyimpan tiap perubahan. Yang tersisa di sini hanyalah
 * pertanyaan "dokumen dan tab mana yang sedang dibuka" dan jembatan ke state
 * dokumen yang dipakai pipeline analisis.
 *
 * Pembagiannya sengaja tegas: apa pun yang menjadi milik naskah ada di Y.Doc
 * (`ydoc.ts`), apa pun yang menjadi milik satu pemakai ada di localStorage
 * (`local-view.ts`). Pembagian itu yang nanti membuat dokumen ini bisa
 * dibagikan tanpa ikut membagikan isi kepala orang yang membukanya.
 *
 * API lama (`sessions`, `activeId`, `newSession`, `selectSession`, dst.)
 * dipertahankan sebagai turunan dari model baru: `sessions` adalah tab milik
 * dokumen aktif dan `activeId` alias dari `activeTabId`, supaya konsumen yang
 * belum beralih ke tingkat dokumen tidak rusak.
 */

const YDOC_NAME = 'writer-hub-doc'

/**
 * Batas jumlah tab PER DOKUMEN. Versi lama membuang tab tertua saat batas
 * terlampaui; sekarang pembuatannya yang ditolak - menghapus naskah orang
 * tanpa diminta bukan cara yang benar untuk menegakkan sebuah batas.
 */
export const MAX_SESSIONS = 50

/** Batas jumlah dokumen, dengan alasan yang sama seperti batas tab. */
export const MAX_DOCUMENTS = 100

/** Jeda sebelum waktu sunting terakhir dicatat, supaya tiap ketukan tidak menulis. */
const TOUCH_DEBOUNCE_MS = 600

export interface Session extends TabMeta {
	/** Daftar isi tab ini sedang terbuka - keadaan milik pemakai, bukan naskah. */
	outlineExpanded: boolean
	/** Kata-kata pertama naskah; menamai tab yang belum diberi judul. */
	preview: string
}

/** Label sidebar: pakai judul, jatuh ke awal naskah kalau judulnya masih bawaan. */
export function sessionLabel(session: Session): string {
	const title = session.title?.trim()
	if (title && title !== 'Untitled document') return title
	return session.preview?.slice(0, 48) || 'Untitled document'
}

interface SessionContextValue {
	/** Dokumen bersama. Editor mengikat dirinya ke fragmen tab aktif di sini. */
	doc: Y.Doc
	/** Semua dokumen menurut urutan tampilnya. */
	documents: DocMeta[]
	/** Dokumen yang sedang dibuka. */
	activeDocId: string | null
	/** Tab yang sedang dibuka; `activeId` di bawah adalah alias lamanya. */
	activeTabId: string | null
	/** Tab milik dokumen aktif (bentuk lama, dipertahankan untuk konsumen lama). */
	sessions: Session[]
	/** Alias dari `activeTabId`. */
	activeId: string | null
	/** Naskah tersimpan sudah selesai dimuat; sebelum ini daftar tab belum bisa dipercaya. */
	hydrated: boolean
	/** Tab baru di dalam dokumen aktif. */
	newSession: () => void
	/** Dokumen baru, langsung berisi satu tab, dan langsung dibuka. */
	newDocument: () => void
	selectSession: (id: string) => void
	selectDocument: (id: string) => void
	deleteSession: (id: string) => void
	deleteDocument: (id: string) => void
	renameSession: (id: string, title: string) => void
	/**
	 * Ganti judul dokumen; judul di kepala aplikasi ikut disegarkan bila
	 * dokumen itu yang sedang aktif.
	 *
	 * `origin` dipakai pemanggil yang menulis atas nama server (penyelarasan
	 * judul di sync-context) supaya tulisannya tidak terbaca sebagai suntingan
	 * pengguna dan tidak memicu autosave balik.
	 */
	renameDocument: (id: string, title: string, origin?: unknown) => void
	duplicateSession: (id: string) => void
	setSessionEmoji: (id: string, emoji: string | null) => void
	/** Pindahkan tab `movedId` ke posisi tab `destId` (dalam dokumen yang sama). */
	moveSession: (movedId: string, destId: string) => void
	/** Pindahkan dokumen `movedId` ke posisi dokumen `destId`. */
	moveDocument: (movedId: string, destId: string) => void
	/** Buka/tutup kerangka heading (daftar isi) sebuah tab. */
	setSessionOutlineExpanded: (id: string, expanded: boolean) => void

	/** Bahasa yang dipilih untuk tab aktif; null berarti otomatis. */
	languageOverride: string | null
	setLanguageOverride: (language: string | null) => void

	/**
	 * Timpa hasil pemeriksaan tersimpan sebuah tab. Dipakai "Terapkan ulang"
	 * Aktivitas AI: hasil lama ditulis ke tabView SEBELUM navigasi, dan efek
	 * muat tab (yang membaca tabView) mengangkatnya ke state dokumen.
	 */
	setTabResults: (id: string, results: { suggestions: EditorSuggestion[]; scores: GrammarScores | null }) => void

	/** Komentar milik tab yang sedang dibuka. */
	comments: CommentThread[]
	addComment: (thread: CommentThread) => void
	replyToComment: (id: string, reply: CommentReply) => void
	setCommentResolved: (id: string, resolved: boolean) => void
	updateComment: (id: string, patch: Partial<Omit<CommentThread, 'id'>>) => void
	removeComment: (id: string) => void
}

const SessionContext = createContext<SessionContextValue | null>(null)

export function SessionProvider({ children }: { children: ReactNode }) {
	const [doc] = useState(() => new Y.Doc())
	const [documents, setDocuments] = useState<DocMeta[]>([])
	const [tabs, setTabs] = useState<Array<TabMeta & { preview: string }>>([])
	const [loaded, setLoaded] = useState(false)
	const [view, setView, viewHydrated] = usePersistentState<LocalView>(
		LOCAL_VIEW_STORAGE_KEY,
		EMPTY_LOCAL_VIEW,
	)
	const { state, dispatch } = useDocument()
	const { editor } = useEditorInstance()

	// ── memuat naskah tersimpan ──────────────────────────────────────────────

	useEffect(() => {
		const provider = new IndexeddbPersistence(YDOC_NAME, doc)

		const onSynced = () => {
			// Naskah dari versi localStorage dipindahkan sekali, setelah isi
			// IndexedDB ada di tangan - kalau tidak, migrasi bisa berjalan di atas
			// dokumen kosong dan menggandakan naskah yang sudah pindah.
			const migrated = migrateLegacySessions(doc)
			// Struktur lama (urutan tab global, sebelum dokumen ada) diangkat ke
			// dokumen 1-tab. Aman dipanggil di setiap hidrasi: ia no-op begitu
			// kunci lama bersih.
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
		}

		provider.on('synced', onSynced)
		return () => {
			provider.off('synced', onSynced)
			provider.destroy()
		}
	}, [doc, setView])

	// Daftar dokumen dan tab mengikuti Y.Doc. Yang diamati hanya wadah metanya -
	// fragmen naskah adalah tipe tersendiri di akar dokumen, jadi mengetik tidak
	// ikut membangun ulang daftar pada tiap ketukan.
	useEffect(() => {
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
	}, [doc])

	// Tab aktif tersimpan; catatan bentuk lama (field `activeId`) ikut dibaca.
	const storedTabId = storedActiveTabId(view)

	const activeDocId = useMemo(() => {
		if (documents.length === 0) return null
		const stored = view.activeDocId
		if (stored && documents.some((dok) => dok.id === stored)) return stored
		// Tab aktif menentukan dokumennya - catatan lama bahkan hanya menyimpan
		// tab, tanpa dokumen sama sekali.
		if (storedTabId) {
			const owner = documents.find((dok) => dok.tabOrder.includes(storedTabId))
			if (owner) return owner.id
		}
		return documents[0].id
	}, [documents, view.activeDocId, storedTabId])

	const activeId = useMemo(() => {
		const owner = documents.find((dok) => dok.id === activeDocId)
		if (!owner || owner.tabOrder.length === 0) return null
		return storedTabId && owner.tabOrder.includes(storedTabId)
			? storedTabId
			: owner.tabOrder[0]
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

	// ── jembatan ke state dokumen ────────────────────────────────────────────

	/**
	 * Naskah yang baru dipasang ke state, menunggu state benar-benar berisinya.
	 *
	 * Berpindah tab menyisakan satu render di mana `activeId` sudah tab baru tapi
	 * state dokumen masih memuat naskah tab lama. Tanpa penanda ini, penulisan
	 * balik di bawah akan menyalin judul dokumen yang basi ke dokumen baru pada
	 * render itu.
	 */
	const pendingLoad = useRef<{ id: string; text: string } | null>(null)

	/** Teks terakhir yang sudah tercatat waktunya; membedakan sunting dari sekadar pindah tab. */
	const touchedText = useRef<string | null>(null)

	// Editor dibuat ulang tiap kali tab berganti - ia terikat ke fragmen tab itu.
	// Begitu ia siap, isinya yang dibacakan ke state dokumen, bukan sebaliknya.
	useEffect(() => {
		/*
		 * `isDestroyed` bukan kehati-hatian berlebih. Berganti tab membuat
		 * `useEditor` menghancurkan instance lama, sementara context masih
		 * memegangnya sampai render berikutnya - dan efek induk berjalan sesudah
		 * efek anak tapi sebelum context itu diperbarui. Membaca naskah dari
		 * editor yang sudah dibubarkan berarti membaca skema yang sudah null.
		 */
		if (!loaded || !editor || editor.isDestroyed || !activeId) return

		// Judul yang dibacakan ke state adalah judul DOKUMEN (ia yang tampil dan
		// disunting di kepala aplikasi); judul tab tinggal di sidebar tab.
		const text = editorPlainText(editor)
		const title =
			readDocs(doc).find((dok) => dok.id === activeDocId)?.title ?? 'Untitled document'
		const local = tabView(view, activeId)

		pendingLoad.current = { id: activeId, text }
		touchedText.current = text

		dispatch({
			type: 'load',
			document: { title, text, suggestions: local.suggestions, scores: local.scores },
		})
		// `view` sengaja tidak jadi dependensi: hasil pemeriksaan hanya perlu
		// dibacakan saat tabnya dibuka, bukan tiap kali salah satunya berubah.
		// biome-ignore lint/correctness/useExhaustiveDependencies: lihat di atas
	}, [loaded, editor, activeId, activeDocId, doc, dispatch])

	// Judul diketik di kepala aplikasi, tapi tempat tinggalnya di dalam dokumen.
	useEffect(() => {
		if (!loaded || !activeId || !activeDocId) return

		const pending = pendingLoad.current
		if (pending) {
			/*
			 * Belum boleh menulis apa pun sampai state memuat naskah tab ini.
			 *
			 * Jabat tangannya sengaja TIDAK membandingkan judul. Judul adalah
			 * satu-satunya field di sini yang diketik pengguna, dan dulu
			 * syaratnya menyertakannya: begitu judul diketik sebelum jabat tangan
			 * selesai, `state.title === pending.title` tidak akan pernah terpenuhi
			 * lagi, penanda ini tidak pernah dibersihkan, dan judul berhenti
			 * ditulis ke Y.Doc sampai tab berganti - termasuk mematikan pencatat
			 * waktu sunting dan penyimpan hasil pemeriksaan yang memakai penanda
			 * yang sama.
			 *
			 * Penanda basi milik tab lain juga dibersihkan, bukan ditunggu.
			 */
			if (pending.id !== activeId || state.text === pending.text) {
				pendingLoad.current = null
			}
			return
		}

		const stored = readDocs(doc).find((dok) => dok.id === activeDocId)?.title
		if (stored !== undefined && stored !== state.title) {
			ydocRenameDocument(doc, activeDocId, state.title)
		}
	}, [loaded, activeId, activeDocId, doc, state.title, state.text])

	// Waktu sunting terakhir, untuk daftar "dokumen terakhir" - sekaligus yang
	// menyegarkan nama tab yang belum berjudul.
	useEffect(() => {
		if (!loaded || !activeId || pendingLoad.current) return
		if (state.text === touchedText.current) return

		const timer = setTimeout(() => {
			touchedText.current = state.text
			touchTab(doc, activeId)
		}, TOUCH_DEBOUNCE_MS)

		return () => clearTimeout(timer)
	}, [loaded, activeId, doc, state.text])

	// Hasil pemeriksaan disimpan per tab, di sisi pemakai.
	useEffect(() => {
		if (!loaded || !activeId || pendingLoad.current) return
		setView((current) =>
			patchTabView(current, activeId, { suggestions: state.suggestions, scores: state.scores }),
		)
	}, [loaded, activeId, setView, state.suggestions, state.scores])

	// Catatan tab yang sudah dihapus tidak perlu ikut dimuat selamanya.
	useEffect(() => {
		if (!loaded || tabs.length === 0) return
		const ids = tabs.map((tab) => tab.id)
		setView((current) => {
			const pruned = pruneTabViews(current, ids)
			return Object.keys(pruned.tabs).length === Object.keys(current.tabs).length ? current : pruned
		})
	}, [loaded, tabs, setView])

	// ── aksi ─────────────────────────────────────────────────────────────────

	const newSession = useCallback(() => {
		if (!activeDocId) return
		// Batasnya per dokumen: 50 tab di dalam SATU dokumen, bukan seluruhnya.
		if (readTabs(doc, activeDocId).length >= MAX_SESSIONS) return
		const id = createTab(doc, activeDocId)
		setView((current) => ({ ...current, activeTabId: id }))
	}, [doc, activeDocId, setView])

	const newDocument = useCallback(() => {
		if (readDocs(doc).length >= MAX_DOCUMENTS) return
		const docId = createDocument(doc)
		const tabId = readTabs(doc, docId)[0]?.id ?? null
		setView((current) => ({ ...current, activeDocId: docId, activeTabId: tabId }))
	}, [doc, setView])

	/**
	 * Pindah tab selalu mendarat dengan daftar isi tertutup: yang dicari saat
	 * berganti naskah adalah naskahnya, bukan kerangkanya. Dokumen pemiliknya
	 * ikut diaktifkan - tab tidak pernah tampil lepas dari dokumennya.
	 */
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
				// Tab yang dibuka: tab aktif sekarang bila ia memang milik dokumen
				// ini, kalau tidak tab pertamanya - mendarat dengan daftar isi
				// tertutup, seperti pindah tab biasa.
				const currentTab = storedActiveTabId(current)
				const tabId =
					currentTab && target.tabOrder.includes(currentTab)
						? currentTab
						: (target.tabOrder[0] ?? null)
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

			// Menghapus tab terakhir sebuah dokumen sekaligus menghapus dokumennya
			// (aturan di ydoc.ts).
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
					// Editor tidak punya keadaan "tanpa dokumen": kalau yang terakhir
					// ditutup, tempatnya langsung diisi naskah kosong.
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

			// Sama seperti hapus tab: tidak boleh ada keadaan "tanpa dokumen".
			const docsLeft = readDocs(doc)
			const fallbackDoc =
				docsLeft.length > 0
					? (docsLeft[at] ?? docsLeft[docsLeft.length - 1]).id
					: createDocument(doc)
			const fallbackTab = readTabs(doc, fallbackDoc)[0]?.id ?? null

			setView((view) =>
				view.activeDocId === id
					? { ...view, activeDocId: fallbackDoc, activeTabId: fallbackTab }
					: view,
			)
		},
		[doc, setView],
	)

	const renameSession = useCallback(
		(id: string, title: string) => {
			// Judul tab hanya milik sidebar tab; judul di kepala aplikasi adalah
			// judul dokumen, jadi tidak ada yang perlu didorong ke state di sini.
			updateTab(doc, id, { title, updatedAt: Date.now() })
		},
		[doc],
	)

	const renameDocumentAction = useCallback(
		(id: string, title: string, origin?: unknown) => {
			ydocRenameDocument(doc, id, title, origin)
			// Judul di kepala aplikasi dan judul dokumen aktif adalah hal yang
			// sama; tanpa ini efek tulis-balik di atas akan menimpa nama baru
			// dengan judul lama yang masih tersimpan di state.
			//
			// Ini juga yang membuat judul hasil penyelarasan dari server terlihat
			// di TopBar tanpa berpindah tab: state dokumen memegang salinannya
			// sendiri dan hanya dibacakan ulang saat tab dimuat.
			if (id === activeDocId) dispatch({ type: 'setTitle', title })
		},
		[doc, activeDocId, dispatch],
	)

	const duplicateSession = useCallback((id: string) => void duplicateTab(doc, id), [doc])

	const setSessionEmoji = useCallback(
		(id: string, emoji: string | null) => updateTab(doc, id, { emoji }),
		[doc],
	)

	const moveSession = useCallback(
		(movedId: string, destId: string) => moveTab(doc, movedId, destId),
		[doc],
	)

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

	/** Komentar selalu menempel pada tab yang sedang aktif. */
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

	/**
	 * Ubah beberapa field utas sekaligus.
	 *
	 * Ada langkah yang memang satu kejadian, bukan dua: menerima usulan mengubah
	 * status usulannya DAN menutup utasnya. Dua tulisan terpisah berarti ada
	 * jeda di mana utas sudah tertutup padahal usulannya masih tampak menunggu
	 * jawaban - dan pada dokumen berbagi, jeda itu terlihat orang lain.
	 */
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
			newSession,
			newDocument,
			selectSession,
			selectDocument,
			deleteSession,
			deleteDocument: deleteDocumentAction,
			renameSession,
			renameDocument: renameDocumentAction,
			duplicateSession,
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
