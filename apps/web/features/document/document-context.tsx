'use client'

import { createContext, type ReactNode, useContext, useMemo, useReducer } from 'react'
import {
	type DocumentAction,
	type DocumentState,
	documentReducer,
	initialDocumentState,
} from './document-reducer'
import { applySuggestions } from './suggestions'

interface DocumentContextValue {
	state: DocumentState
	dispatch: (action: DocumentAction) => void
	correctedText: string
	hasContent: boolean
}

const DocumentContext = createContext<DocumentContextValue | null>(null)

export function DocumentProvider({
	children,
	initialState,
}: {
	children: ReactNode
	initialState?: Partial<DocumentState>
}) {
	const [state, dispatch] = useReducer(documentReducer, {
		...initialDocumentState,
		...initialState,
	})

	const value = useMemo<DocumentContextValue>(() => {
		const pending = state.suggestions.filter((s) => !s.dismissed)
		return {
			state,
			dispatch,
			correctedText: pending.length === 0 ? state.text : applySuggestions(state.text, pending),
			hasContent: state.text.trim().length > 0 || state.file !== null,
		}
	}, [state])

	return <DocumentContext.Provider value={value}>{children}</DocumentContext.Provider>
}

export function useDocument(): DocumentContextValue {
	const context = useContext(DocumentContext)
	if (!context) throw new Error('useDocument harus dipakai di dalam <DocumentProvider>')
	return context
}
