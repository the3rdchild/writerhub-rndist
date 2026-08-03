'use client'

import type { GrammarScores } from '@writer-hub/shared'
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef } from 'react'
import { useDocument } from '@/features/document/document-context'
import type { EditorSuggestion } from '@/features/document/suggestions'
import { useSettings } from '@/features/settings/settings-context'
import { usePersistentState } from '@/lib/use-persistent-state'

export const SESSIONS_STORAGE_KEY = 'writer-hub-sessions'

const MAX_SESSIONS = 50
const AUTOSAVE_DEBOUNCE_MS = 400

export interface Session {
	id: string
	title: string
	text: string
	suggestions: EditorSuggestion[]
	scores: GrammarScores | null
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

function createSession(): Session {
	return {
		id: createId(),
		title: 'Untitled document',
		text: '',
		suggestions: [],
		scores: null,
		updatedAt: Date.now(),
	}
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
}

const SessionContext = createContext<SessionContextValue | null>(null)

export function SessionProvider({ children }: { children: ReactNode }) {
	const [store, setStore, hydrated] = usePersistentState<PersistedSessions>(SESSIONS_STORAGE_KEY, EMPTY)
	const { state, dispatch } = useDocument()
	const { settings } = useSettings()

	/**
	 * Memuat sesi ke editor akan memicu autosave dan menimpa sesi lain, jadi
	 * penyimpanan ditahan sampai perubahan dari pemuatan itu selesai mengalir.
	 */
	const loadingRef = useRef(false)

	const loadIntoEditor = useCallback(
		(session: Session) => {
			loadingRef.current = true
			dispatch({
				type: 'load',
				document: {
					title: session.title,
					text: session.text,
					suggestions: session.suggestions,
					scores: session.scores,
				},
			})
			queueMicrotask(() => {
				loadingRef.current = false
			})
		},
		[dispatch],
	)

	// Sesi pertama dibuat dari isi editor saat itu, bukan dokumen kosong.
	const bootstrappedRef = useRef(false)
	useEffect(() => {
		if (!hydrated || bootstrappedRef.current) return
		bootstrappedRef.current = true

		if (store.sessions.length > 0) {
			const active = store.sessions.find((s) => s.id === store.activeId) ?? store.sessions[0]
			setStore({ ...store, activeId: active.id })
			loadIntoEditor(active)
			return
		}

		const first: Session = { ...createSession(), title: state.title, text: state.text }
		setStore({ sessions: [first], activeId: first.id })
	}, [hydrated, store, setStore, loadIntoEditor, state.title, state.text])

	// Autosave editor → sesi aktif (debounced, satu arah).
	useEffect(() => {
		if (!hydrated || loadingRef.current || !store.activeId || !settings.autoSave) return

		const timer = setTimeout(() => {
			setStore((current) => ({
				...current,
				sessions: current.sessions.map((session) =>
					session.id === current.activeId
						? {
								...session,
								title: state.title || 'Untitled document',
								text: state.text,
								suggestions: state.suggestions,
								scores: state.scores,
								updatedAt: Date.now(),
							}
						: session,
				),
			}))
		}, AUTOSAVE_DEBOUNCE_MS)

		return () => clearTimeout(timer)
	}, [
		hydrated,
		settings.autoSave,
		store.activeId,
		setStore,
		state.title,
		state.text,
		state.suggestions,
		state.scores,
	])

	const newSession = useCallback(() => {
		const session = createSession()
		setStore((current) => ({
			sessions: [session, ...current.sessions].slice(0, MAX_SESSIONS),
			activeId: session.id,
		}))
		loadIntoEditor(session)
	}, [setStore, loadIntoEditor])

	const selectSession = useCallback(
		(id: string) => {
			setStore((current) => {
				const target = current.sessions.find((s) => s.id === id)
				if (!target || id === current.activeId) return current
				loadIntoEditor(target)
				return { ...current, activeId: id }
			})
		},
		[setStore, loadIntoEditor],
	)

	const deleteSession = useCallback(
		(id: string) => {
			setStore((current) => {
				const sessions = current.sessions.filter((s) => s.id !== id)
				if (current.activeId !== id) return { ...current, sessions }

				const next = sessions[0] ?? createSession()
				loadIntoEditor(next)
				return {
					sessions: sessions.length > 0 ? sessions : [next],
					activeId: next.id,
				}
			})
		},
		[setStore, loadIntoEditor],
	)

	const value = useMemo<SessionContextValue>(
		() => ({
			sessions: store.sessions,
			activeId: store.activeId,
			hydrated,
			newSession,
			selectSession,
			deleteSession,
		}),
		[store.sessions, store.activeId, hydrated, newSession, selectSession, deleteSession],
	)

	return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSessions(): SessionContextValue {
	const context = useContext(SessionContext)
	if (!context) throw new Error('useSessions harus dipakai di dalam <SessionProvider>')
	return context
}
