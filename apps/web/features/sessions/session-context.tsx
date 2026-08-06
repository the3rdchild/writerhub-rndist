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
import { useDocument } from '@/features/document/document-context'
import { useEditorInstance } from '@/features/editor/editor-context'
import { editorPlainText } from '@/features/editor/text-content'
import { usePersistentState } from '@/lib/use-persistent-state'
import {
	EMPTY_LOCAL_VIEW,
	LOCAL_VIEW_STORAGE_KEY,
	type LocalView,
	patchTabView,
	pruneTabViews,
	tabView,
} from './local-view'
import { migrateLegacySessions } from './migrate-legacy'
import type { CommentReply, CommentThread } from './types'
import {
	createTab,
	deleteTab,
	duplicateTab,
	moveTab,
	readTabs,
	type TabMeta,
	tabPreview,
	tabsRoot,
	touchTab,
	updateTab,
} from './ydoc'

export type { CommentReply, CommentThread } from './types'

/**
 * Satu tab = satu naskah, dan naskahnya hidup di dalam Y.Doc.
 *
 * Sebelumnya lapisan ini memotret editor ke localStorage tiap 400 ms lalu
 * memuatnya balik saat berpindah tab. Dengan CRDT, potret dan muat-balik itu
 * tidak ada lagi: editor terikat langsung ke `Y.XmlFragment` milik tabnya, dan
 * Yjs sendiri yang menyimpan tiap perubahan. Yang tersisa di sini hanyalah
 * pertanyaan "tab mana yang sedang dibuka" dan jembatan ke state dokumen yang
 * dipakai pipeline analisis.
 *
 * Pembagiannya sengaja tegas: apa pun yang menjadi milik naskah ada di Y.Doc
 * (`ydoc.ts`), apa pun yang menjadi milik satu pemakai ada di localStorage
 * (`local-view.ts`). Pembagian itu yang nanti membuat dokumen ini bisa
 * dibagikan tanpa ikut membagikan isi kepala orang yang membukanya.
 */

const YDOC_NAME = 'writer-hub-doc'

/**
 * Batas jumlah tab. Versi lama membuang tab tertua saat batas terlampaui;
 * sekarang pembuatannya yang ditolak - menghapus naskah orang tanpa diminta
 * bukan cara yang benar untuk menegakkan sebuah batas.
 */
const MAX_SESSIONS = 50

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
	sessions: Session[]
	activeId: string | null
	/** Naskah tersimpan sudah selesai dimuat; sebelum ini daftar tab belum bisa dipercaya. */
	hydrated: boolean
	newSession: () => void
	selectSession: (id: string) => void
	deleteSession: (id: string) => void
	renameSession: (id: string, title: string) => void
	duplicateSession: (id: string) => void
	setSessionEmoji: (id: string, emoji: string | null) => void
	/** Pindahkan tab `movedId` ke posisi tab `destId`. */
	moveSession: (movedId: string, destId: string) => void
	/** Buka/tutup kerangka heading (daftar isi) sebuah tab. */
	setSessionOutlineExpanded: (id: string, expanded: boolean) => void

	/** Bahasa yang dipilih untuk tab aktif; null berarti otomatis. */
	languageOverride: string | null
	setLanguageOverride: (language: string | null) => void

	/** Komentar milik tab yang sedang dibuka. */
	comments: CommentThread[]
	addComment: (thread: CommentThread) => void
	replyToComment: (id: string, reply: CommentReply) => void
	setCommentResolved: (id: string, resolved: boolean) => void
	removeComment: (id: string) => void
}

const SessionContext = createContext<SessionContextValue | null>(null)

export function SessionProvider({ children }: { children: ReactNode }) {
	const [doc] = useState(() => new Y.Doc())
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
			if (readTabs(doc).length === 0) createTab(doc)
			if (migrated?.activeId) {
				setView((current) => (current.activeId ? current : { ...current, activeId: migrated.activeId }))
			}
			setLoaded(true)
		}

		provider.on('synced', onSynced)
		return () => {
			provider.off('synced', onSynced)
			provider.destroy()
		}
	}, [doc, setView])

	// Daftar tab mengikuti Y.Doc. Yang diamati hanya wadah metanya - fragmen
	// naskah adalah tipe tersendiri di akar dokumen, jadi mengetik tidak ikut
	// membangun ulang daftar tab pada tiap ketukan.
	useEffect(() => {
		const { root } = tabsRoot(doc)
		const rebuild = () => {
			setTabs(readTabs(doc).map((meta) => ({ ...meta, preview: tabPreview(doc, meta.id) })))
		}

		rebuild()
		root.observeDeep(rebuild)
		return () => root.unobserveDeep(rebuild)
	}, [doc])

	const activeId = useMemo(() => {
		if (tabs.length === 0) return null
		const stored = view.activeId
		return stored && tabs.some((tab) => tab.id === stored) ? stored : tabs[0].id
	}, [tabs, view.activeId])

	const sessions = useMemo<Session[]>(
		() =>
			tabs.map((tab) => ({ ...tab, outlineExpanded: tabView(view, tab.id).outlineExpanded })),
		[tabs, view],
	)

	// ── jembatan ke state dokumen ────────────────────────────────────────────

	/**
	 * Naskah yang baru dipasang ke state, menunggu state benar-benar berisinya.
	 *
	 * Berpindah tab menyisakan satu render di mana `activeId` sudah tab baru tapi
	 * state dokumen masih memuat naskah tab lama. Tanpa penanda ini, penulisan
	 * balik di bawah akan menyalin judul tab lama ke tab baru pada render itu.
	 */
	const pendingLoad = useRef<{ id: string; title: string; text: string } | null>(null)

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

		const meta = readTabs(doc).find((tab) => tab.id === activeId)
		const text = editorPlainText(editor)
		const title = meta?.title ?? 'Untitled document'
		const local = tabView(view, activeId)

		pendingLoad.current = { id: activeId, title, text }
		touchedText.current = text

		dispatch({
			type: 'load',
			document: { title, text, suggestions: local.suggestions, scores: local.scores },
		})
		// `view` sengaja tidak jadi dependensi: hasil pemeriksaan hanya perlu
		// dibacakan saat tabnya dibuka, bukan tiap kali salah satunya berubah.
		// biome-ignore lint/correctness/useExhaustiveDependencies: lihat di atas
	}, [loaded, editor, activeId, doc, dispatch])

	// Judul diketik di kepala aplikasi, tapi tempat tinggalnya di dalam dokumen.
	useEffect(() => {
		if (!loaded || !activeId) return

		const pending = pendingLoad.current
		if (pending) {
			// Belum boleh menulis apa pun sampai state memuat naskah tab ini.
			if (pending.id === activeId && state.title === pending.title && state.text === pending.text) {
				pendingLoad.current = null
			}
			return
		}

		const stored = readTabs(doc).find((tab) => tab.id === activeId)?.title
		if (stored !== state.title) updateTab(doc, activeId, { title: state.title })
	}, [loaded, activeId, doc, state.title, state.text])

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
		if (readTabs(doc).length >= MAX_SESSIONS) return
		const id = createTab(doc)
		setView((current) => ({ ...current, activeId: id }))
	}, [doc, setView])

	/**
	 * Pindah tab selalu mendarat dengan daftar isi tertutup: yang dicari saat
	 * berganti naskah adalah naskahnya, bukan kerangkanya.
	 */
	const selectSession = useCallback(
		(id: string) => {
			setView((current) =>
				current.activeId === id
					? current
					: patchTabView({ ...current, activeId: id }, id, { outlineExpanded: false }),
			)
		},
		[setView],
	)

	const deleteSession = useCallback(
		(id: string) => {
			const current = readTabs(doc)
			const at = current.findIndex((tab) => tab.id === id)
			if (at === -1) return

			const remaining = current.filter((tab) => tab.id !== id)
			deleteTab(doc, id)

			// Editor tidak punya keadaan "tanpa dokumen": kalau yang terakhir
			// ditutup, tempatnya langsung diisi naskah kosong.
			const fallback = remaining[at]?.id ?? remaining[remaining.length - 1]?.id ?? createTab(doc)
			setView((view) =>
				view.activeId === id
					? patchTabView({ ...view, activeId: fallback }, fallback, { outlineExpanded: false })
					: view,
			)
		},
		[doc, setView],
	)

	const renameSession = useCallback(
		(id: string, title: string) => {
			updateTab(doc, id, { title, updatedAt: Date.now() })
			// Judul di kepala aplikasi dan nama tab aktif adalah hal yang sama.
			if (id === activeId) dispatch({ type: 'setTitle', title })
		},
		[doc, activeId, dispatch],
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

	const setSessionOutlineExpanded = useCallback(
		(id: string, expanded: boolean) => {
			setView((current) => patchTabView(current, id, { outlineExpanded: expanded }))
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

	const removeComment = useCallback(
		(id: string) => updateComments((threads) => threads.filter((thread) => thread.id !== id)),
		[updateComments],
	)

	const active = sessions.find((session) => session.id === activeId)

	const value = useMemo<SessionContextValue>(
		() => ({
			doc,
			sessions,
			activeId,
			hydrated: loaded && viewHydrated,
			newSession,
			selectSession,
			deleteSession,
			renameSession,
			duplicateSession,
			setSessionEmoji,
			moveSession,
			setSessionOutlineExpanded,
			languageOverride: active?.language ?? null,
			setLanguageOverride,
			comments: active?.comments ?? [],
			addComment,
			replyToComment,
			setCommentResolved,
			removeComment,
		}),
		[
			doc,
			sessions,
			activeId,
			loaded,
			viewHydrated,
			active,
			newSession,
			selectSession,
			deleteSession,
			renameSession,
			duplicateSession,
			setSessionEmoji,
			moveSession,
			setSessionOutlineExpanded,
			setLanguageOverride,
			addComment,
			replyToComment,
			setCommentResolved,
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
