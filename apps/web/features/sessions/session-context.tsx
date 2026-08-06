'use client'

import type { GrammarScores } from '@writer-hub/shared'
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef } from 'react'
import { useDocument } from '@/features/document/document-context'
import type { EditorSuggestion } from '@/features/document/suggestions'
import { useEditorInstance } from '@/features/editor/editor-context'
import { editorPlainText, textToParagraphs } from '@/features/editor/text-content'
import { useSettings } from '@/features/settings/settings-context'
import { usePersistentState } from '@/lib/use-persistent-state'

export const SESSIONS_STORAGE_KEY = 'writer-hub-sessions'

const MAX_SESSIONS = 50
const AUTOSAVE_DEBOUNCE_MS = 400

/**
 * Satu sesi = satu naskah = satu tab dokumen.
 *
 * Ketiganya sengaja tidak dipisah: memisahkan "tab" dari "sesi" berarti dua
 * lapisan penyimpanan menulis naskah yang sama, dan pemulihan saat halaman
 * dimuat akan saling menimpa.
 *
 * `text` tetap dipegang karena pipeline analisis bekerja di atas teks polos,
 * sedangkan `html` yang membuat format bertahan saat berpindah tab. Keduanya
 * disimpan dari keadaan editor yang sama pada saat yang sama.
 */
export interface CommentReply {
	author: string
	text: string
	at: number
}

/** Satu utas komentar; jangkarnya adalah mark bernama sama di dalam naskah. */
export interface CommentThread {
	id: string
	/** Kutipan teks saat komentar dibuat - dipakai kalau mark-nya hilang. */
	quote: string
	replies: CommentReply[]
	resolved: boolean
	createdAt: number
}

export interface Session {
	id: string
	title: string
	text: string
	html: string
	/** Ikon opsional di depan nama tab. */
	emoji: string | null
	/** Bahasa pilihan pengguna; null berarti ikut hasil deteksi. */
	language: string | null
	comments: CommentThread[]
	suggestions: EditorSuggestion[]
	scores: GrammarScores | null
	/**
	 * Apakah kerangka heading (daftar isi) tab ini sedang terbuka. Default
	 * tertutup, dan setiap perpindahan tab mengembalikannya ke tertutup - lihat
	 * `collapseOutline`. Yang disimpan hanyalah keadaan tab yang ditinggalkan
	 * saat halaman ditutup, supaya sesi yang dibuka kembali tampil sama persis.
	 */
	outlineExpanded: boolean
	updatedAt: number
}

interface PersistedSessions {
	sessions: Session[]
	activeId: string | null
}

const EMPTY: PersistedSessions = { sessions: [], activeId: null }

function createId(): string {
	if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
	return `s_${Date.now()}_${Math.random().toString(36).slice(2)}`
}

function createSession(title = 'Untitled document'): Session {
	return {
		id: createId(),
		title,
		text: '',
		html: '',
		emoji: null,
		language: null,
		comments: [],
		suggestions: [],
		scores: null,
		outlineExpanded: false,
		updatedAt: Date.now(),
	}
}

/**
 * Tutup daftar isi satu tab. Dipakai setiap kali sebuah tab baru mendarat jadi
 * tab aktif: yang dicari saat berpindah naskah adalah naskahnya, bukan
 * kerangkanya - kerangka baru terbuka kalau tab aktif diklik sekali lagi.
 */
function collapseOutline(sessions: Session[], id: string): Session[] {
	return sessions.map((s) => (s.id === id ? { ...s, outlineExpanded: false } : s))
}

/** Label sidebar: pakai judul, jatuh ke baris pertama teks kalau judul default. */
export function sessionLabel(session: Session): string {
	const title = session.title?.trim()
	if (title && title !== 'Untitled document') return title

	const firstLine = session.text?.trim().split('\n')[0]?.trim()
	return firstLine ? firstLine.slice(0, 48) : 'Untitled document'
}

interface SessionContextValue {
	sessions: Session[]
	activeId: string | null
	hydrated: boolean
	newSession: () => void
	selectSession: (id: string) => void
	deleteSession: (id: string) => void
	renameSession: (id: string, title: string) => void
	duplicateSession: (id: string) => void
	setSessionEmoji: (id: string, emoji: string | null) => void
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
	const [store, setStore, hydrated] = usePersistentState<PersistedSessions>(SESSIONS_STORAGE_KEY, EMPTY)
	const { state, dispatch } = useDocument()
	const { editor } = useEditorInstance()
	const { settings } = useSettings()

	/**
	 * Memuat sesi ke editor akan memicu autosave dan menimpa sesi lain, jadi
	 * penyimpanan ditahan sampai perubahan dari pemuatan itu selesai mengalir.
	 */
	const loadingRef = useRef(false)

	const loadIntoEditor = useCallback(
		(session: Session) => {
			loadingRef.current = true

			// Isi editor dipasang lebih dulu, teks polosnya baru dibaca dari hasil
			// itu. Dengan urutan ini effect penyelaras di TiptapEditor mendapati
			// editor dan state sudah sama, jadi ia tidak menimpa format yang baru
			// dimuat dengan paragraf polos.
			let text = session.text
			if (editor) {
				editor.commands.setContent(session.html || textToParagraphs(session.text), {
					emitUpdate: false,
				})
				text = editorPlainText(editor)
			}

			dispatch({
				type: 'load',
				document: {
					title: session.title,
					text,
					suggestions: session.suggestions,
					scores: session.scores,
				},
			})
			queueMicrotask(() => {
				loadingRef.current = false
			})
		},
		[dispatch, editor],
	)

	/** Potret naskah yang sedang dibuka - dipakai sebelum berpindah atau menutup tab. */
	const snapshot = useCallback(
		(sessions: Session[], activeId: string | null): Session[] => {
			if (!activeId) return sessions
			return sessions.map((session) =>
				session.id === activeId
					? {
							...session,
							title: state.title || 'Untitled document',
							text: state.text,
							html: editor ? editor.getHTML() : session.html,
							suggestions: state.suggestions,
							scores: state.scores,
							updatedAt: Date.now(),
						}
					: session,
			)
		},
		[editor, state.title, state.text, state.suggestions, state.scores],
	)

	// Sesi pertama dibuat dari isi editor saat itu, bukan dokumen kosong.
	const bootstrappedRef = useRef(false)
	useEffect(() => {
		// Menunggu editor siap: memulihkan naskah sebelum ia ada berarti hanya
		// teks polosnya yang kembali dan seluruh formatnya hilang.
		if (!hydrated || !editor || bootstrappedRef.current) return
		bootstrappedRef.current = true

		if (store.sessions.length > 0) {
			// Sesi dari versi sebelumnya tidak punya `outlineExpanded`; tanpa
			// ini daftar isinya bisa terbuka diam-diam karena nilainya `undefined`.
			const sessions = store.sessions.map((s) =>
				s.outlineExpanded === undefined ? { ...s, outlineExpanded: false } : s,
			)
			const active = sessions.find((s) => s.id === store.activeId) ?? sessions[0]
			setStore({ sessions, activeId: active.id })
			loadIntoEditor(active)
			return
		}

		const first: Session = { ...createSession(), title: state.title, text: state.text }
		setStore({ sessions: [first], activeId: first.id })
	}, [hydrated, editor, store, setStore, loadIntoEditor, state.title, state.text])

	// Autosave editor → sesi aktif (debounced, satu arah).
	useEffect(() => {
		if (!hydrated || loadingRef.current || !store.activeId || !settings.autoSave) return

		const timer = setTimeout(() => {
			setStore((current) => ({
				...current,
				sessions: snapshot(current.sessions, current.activeId),
			}))
		}, AUTOSAVE_DEBOUNCE_MS)

		return () => clearTimeout(timer)
	}, [hydrated, settings.autoSave, store.activeId, setStore, snapshot])

	const newSession = useCallback(() => {
		const session = createSession()
		setStore((current) => ({
			// Ditambahkan di akhir: sebagai tab, yang baru dibuat berdiri di
			// sebelah kanan yang sudah ada, bukan menyerobot ke depan.
			sessions: [...snapshot(current.sessions, current.activeId), session].slice(-MAX_SESSIONS),
			activeId: session.id,
		}))
		loadIntoEditor(session)
	}, [setStore, snapshot, loadIntoEditor])

	const selectSession = useCallback(
		(id: string) => {
			const target = store.sessions.find((s) => s.id === id)
			if (!target || id === store.activeId) return

			setStore((current) => ({
				sessions: collapseOutline(snapshot(current.sessions, current.activeId), id),
				activeId: id,
			}))
			loadIntoEditor(target)
		},
		[store, setStore, snapshot, loadIntoEditor],
	)

	const deleteSession = useCallback(
		(id: string) => {
			const at = store.sessions.findIndex((s) => s.id === id)
			if (at === -1) return

			const remaining = store.sessions.filter((s) => s.id !== id)
			const isActive = id === store.activeId
			// Editor tidak punya keadaan "tanpa dokumen": kalau yang terakhir
			// ditutup, tempatnya langsung diisi naskah kosong.
			const fallback =
				remaining.length > 0 ? (remaining[at] ?? remaining[remaining.length - 1]) : createSession()

			setStore((current) => {
				// Yang sedang dibuka hanya perlu dipotret kalau ia bukan yang dihapus.
				const kept = (isActive ? current.sessions : snapshot(current.sessions, current.activeId)).filter(
					(s) => s.id !== id,
				)
				if (kept.length === 0) return { sessions: [fallback], activeId: fallback.id }
				// Tab pengganti sama saja dengan tab yang baru dipilih: ia mendarat
				// dengan daftar isi tertutup.
				return {
					sessions: isActive ? collapseOutline(kept, fallback.id) : kept,
					activeId: isActive ? fallback.id : current.activeId,
				}
			})

			if (isActive) loadIntoEditor(fallback)
		},
		[store, setStore, snapshot, loadIntoEditor],
	)

	const renameSession = useCallback(
		(id: string, title: string) => {
			setStore((current) => ({
				...current,
				sessions: current.sessions.map((s) =>
					s.id === id ? { ...s, title, updatedAt: Date.now() } : s,
				),
			}))
			// Judul di kepala aplikasi dan nama tab aktif adalah hal yang sama -
			// autosave juga menulis judul, jadi keduanya harus digerakkan bersama.
			if (id === store.activeId) dispatch({ type: 'setTitle', title })
		},
		[setStore, store.activeId, dispatch],
	)

	const duplicateSession = useCallback(
		(id: string) => {
			if (!store.sessions.some((s) => s.id === id)) return

			setStore((current) => {
				// Salinan diambil setelah potret: menggandakan tab yang sedang dibuka
				// harus ikut membawa suntingan yang belum sempat tersimpan.
				const sessions = snapshot(current.sessions, current.activeId)
				const at = sessions.findIndex((s) => s.id === id)
				const copy: Session = {
					...sessions[at],
					id: createId(),
					title: `${sessions[at].title} (salinan)`,
					outlineExpanded: false,
					updatedAt: Date.now(),
				}

				return {
					...current,
					sessions: [...sessions.slice(0, at + 1), copy, ...sessions.slice(at + 1)].slice(
						-MAX_SESSIONS,
					),
				}
			})
		},
		[store.sessions, setStore, snapshot],
	)

	const setSessionEmoji = useCallback(
		(id: string, emoji: string | null) => {
			setStore((current) => ({
				...current,
				sessions: current.sessions.map((s) => (s.id === id ? { ...s, emoji } : s)),
			}))
		},
		[setStore],
	)

	const setSessionOutlineExpanded = useCallback(
		(id: string, expanded: boolean) => {
			setStore((current) => ({
				...current,
				sessions: current.sessions.map((s) =>
					s.id === id ? { ...s, outlineExpanded: expanded } : s,
				),
			}))
		},
		[setStore],
	)

	/**
	 * Komentar selalu menempel pada tab yang sedang aktif.
	 *
	 * Ia tidak ikut lewat `snapshot`: autosave memotret naskah dari editor, dan
	 * menimpa daftar komentar dari sana akan menghapus komentar yang baru saja
	 * ditambahkan sebelum potret berikutnya sempat memuatnya.
	 */
	const updateComments = useCallback(
		(change: (threads: CommentThread[]) => CommentThread[]) => {
			setStore((current) => ({
				...current,
				sessions: current.sessions.map((session) =>
					session.id === current.activeId
						? { ...session, comments: change(session.comments ?? []) }
						: session,
				),
			}))
		},
		[setStore],
	)

	const setLanguageOverride = useCallback(
		(language: string | null) => {
			setStore((current) => ({
				...current,
				sessions: current.sessions.map((session) =>
					session.id === current.activeId ? { ...session, language } : session,
				),
			}))
		},
		[setStore],
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

	const value = useMemo<SessionContextValue>(
		() => ({
			sessions: store.sessions,
			activeId: store.activeId,
			hydrated,
			newSession,
			selectSession,
			deleteSession,
			renameSession,
			duplicateSession,
			setSessionEmoji,
			setSessionOutlineExpanded,
			languageOverride: store.sessions.find((s) => s.id === store.activeId)?.language ?? null,
			setLanguageOverride,
			comments: store.sessions.find((s) => s.id === store.activeId)?.comments ?? [],
			addComment,
			replyToComment,
			setCommentResolved,
			removeComment,
		}),
		[
			store.sessions,
			store.activeId,
			hydrated,
			newSession,
			selectSession,
			deleteSession,
			renameSession,
			duplicateSession,
			setSessionEmoji,
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
