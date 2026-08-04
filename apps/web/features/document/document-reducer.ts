import type { GrammarModel, GrammarScores, GrammarSuggestion, TextRange } from '@writer-hub/shared'
import {
	type EditorSuggestion,
	reconcileSuggestions,
	shiftAfter,
} from './suggestions'

export type SuggestionFilter = 'all' | 'grammar' | 'style' | 'spelling'

export interface DocumentState {
	title: string
	text: string
	/** Dokumen yang menunggu diunggah; teks hasil ekstraksi datang dari worker. */
	file: File | null
	suggestions: EditorSuggestion[]
	scores: GrammarScores | null
	model: GrammarModel
	filter: SuggestionFilter
	/** Rentang yang diminta panel untuk di-scroll ke tampilan; dikonsumsi sekali. */
	focusedRange: TextRange | null
	/** Rentang yang sedang di-hover di panel - digambar sebagai overlay. */
	hoveredRange: TextRange | null
}

export type DocumentAction =
	| { type: 'setText'; text: string }
	| { type: 'editText'; text: string }
	| { type: 'setTitle'; title: string }
	| { type: 'setFile'; file: File | null }
	| { type: 'setModel'; model: GrammarModel }
	| { type: 'setFilter'; filter: SuggestionFilter }
	| { type: 'setFocusedRange'; range: TextRange | null }
	| { type: 'setHoveredRange'; range: TextRange | null }
	| { type: 'acceptSuggestion'; id: string }
	| { type: 'dismissSuggestion'; id: string }
	| { type: 'acceptAllSuggestions' }
	| { type: 'setSuggestions'; suggestions: GrammarSuggestion[] }
	| {
			type: 'applyCheckResult'
			suggestions: GrammarSuggestion[]
			scores: GrammarScores | null
			/** Untuk mode unggah dokumen: teks hasil ekstraksi jadi basis offset. */
			extractedText?: string | null
	  }
	| { type: 'replaceText'; text: string }
	| { type: 'load'; document: Partial<DocumentState> & { text: string; title: string } }
	| { type: 'clear' }

export const initialDocumentState: DocumentState = {
	title: 'Untitled document',
	text: '',
	file: null,
	suggestions: [],
	scores: null,
	model: 'standard',
	filter: 'all',
	focusedRange: null,
	hoveredRange: null,
}

/** Reset hasil pemeriksaan - dipakai setiap kali sumber teks berganti total. */
const withClearedResults = (state: DocumentState) => ({
	...state,
	suggestions: [],
	scores: null,
	focusedRange: null,
	hoveredRange: null,
})

export function documentReducer(state: DocumentState, action: DocumentAction): DocumentState {
	switch (action.type) {
		case 'setText':
			return { ...withClearedResults(state), text: action.text, file: null }

		// Pengetikan biasa: pertahankan suggestion supaya highlight tidak berkedip.
		case 'editText':
			return { ...state, text: action.text }

		case 'replaceText':
			return { ...state, text: action.text, hoveredRange: null }

		case 'setTitle':
			return { ...state, title: action.title }

		case 'setFile':
			return { ...withClearedResults(state), file: action.file, text: action.file ? '' : state.text }

		case 'setModel':
			return { ...state, model: action.model }

		case 'setFilter':
			return { ...state, filter: action.filter }

		case 'setFocusedRange':
			return { ...state, focusedRange: action.range }

		case 'setHoveredRange':
			return { ...state, hoveredRange: action.range }

		case 'setSuggestions':
			return { ...state, suggestions: reconcileSuggestions(state.text, action.suggestions) }

		case 'acceptSuggestion': {
			const target = state.suggestions.find((s) => s.id === action.id)
			if (!target || target.dismissed) return state

			// Teksnya diganti langsung di editor (lihat features/editor/apply-text)
			// sebagai transaksi tertarget, supaya format blok - tabel, daftar, dst. -
			// tidak ikut diratakan. Reducer hanya mencatat saran selesai dan
			// menggeser offset saran lain yang menyusul.
			const appliedLength = target.length ?? target.original.length
			const delta = target.replacement.length - appliedLength
			const marked = state.suggestions.map((s) =>
				s.id === action.id ? { ...s, dismissed: true } : s,
			)

			return {
				...state,
				suggestions:
					target.offset !== undefined ? shiftAfter(marked, target.offset, delta) : marked,
				hoveredRange: null,
			}
		}

		// Dismiss hanya menyembunyikan highlight; teks tidak diubah.
		case 'dismissSuggestion':
			return {
				...state,
				suggestions: state.suggestions.map((s) =>
					s.id === action.id ? { ...s, dismissed: true } : s,
				),
				hoveredRange: null,
			}

		case 'acceptAllSuggestions': {
			const pending = state.suggestions.filter((s) => !s.dismissed)
			if (pending.length === 0) return state

			// Setiap penggantian sudah diterapkan ke editor oleh panel; di sini
			// saran cuma ditandai selesai.
			return {
				...state,
				suggestions: state.suggestions.map((s) => ({ ...s, dismissed: true })),
				hoveredRange: null,
			}
		}

		case 'applyCheckResult': {
			// Unggahan dokumen: teks asli ada di worker, bukan di editor.
			const baseText = action.extractedText ?? state.text
			return {
				...state,
				text: baseText,
				file: action.extractedText ? null : state.file,
				suggestions: reconcileSuggestions(baseText, action.suggestions),
				scores: action.scores,
			}
		}

		case 'load':
			return { ...initialDocumentState, ...action.document }

		case 'clear':
			return { ...initialDocumentState }
	}
}
