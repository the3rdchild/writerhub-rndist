import { describe, expect, test } from 'bun:test'
import {
	documentReducer,
	initialDocumentState,
	type DocumentState,
} from './document-reducer'
import type { EditorSuggestion } from './suggestions'

function suggestion(partial: Partial<EditorSuggestion> & { id: string }): EditorSuggestion {
	return {
		type: 'grammar',
		category: 'grammar',
		original: 'yang',
		replacement: 'that',
		dismissed: false,
		...partial,
	}
}

function stateWith(overrides: Partial<DocumentState>): DocumentState {
	return { ...initialDocumentState, ...overrides }
}

describe('documentReducer: clearResults (§P3.3, B-4)', () => {
	test('membuang seluruh suggestion, skor, dan rentang aktif tanpa menyentuh teks', () => {
		const before = stateWith({
			text: 'naskah yang tetap utuh',
			suggestions: [
				suggestion({ id: 'a', offset: 6, length: 4 }),
				suggestion({ id: 'b', offset: 20, length: 4 }),
			],
			scores: { grammar: 70, fluency: 65, clarity: 80, engagement: 60 },
			focusedRange: { offset: 6, length: 4 },
			hoveredRange: { offset: 20, length: 4 },
		})

		const after = documentReducer(before, { type: 'clearResults' })

		expect(after.suggestions).toEqual([])
		expect(after.scores).toBeNull()
		expect(after.focusedRange).toBeNull()
		expect(after.hoveredRange).toBeNull()
		// Teks tidak ikut berubah - aksinya tidak merusak naskah.
		expect(after.text).toBe('naskah yang tetap utuh')
	})
})

describe('documentReducer: acceptSuggestion (§P3.2, B-3)', () => {
	test('menandai saran selesai dan menggeser offset saran yang menyusul', () => {
		// "yang" (4 huruf) diganti "that is" (7 huruf) → delta +3.
		const before = stateWith({
			text: 'yang satu dan yang dua',
			suggestions: [
				suggestion({ id: 'first', original: 'yang', replacement: 'that is', offset: 0, length: 4 }),
				suggestion({ id: 'second', offset: 17, length: 4 }),
			],
		})

		const after = documentReducer(before, { type: 'acceptSuggestion', id: 'first' })

		const accepted = after.suggestions.find((s) => s.id === 'first')
		expect(accepted?.dismissed).toBe(true)

		// Reducer hanya mencatat; penggantian teks sebenarnya dilakukan panel
		// lewat replaceTextRange (lihat apply-text.ts). Yang diuji di sini adalah
		// geseran offset saran kedua sebesar delta.
		const remaining = after.suggestions.find((s) => s.id === 'second')
		expect(remaining?.offset).toBe(17 + 3)
	})
})
