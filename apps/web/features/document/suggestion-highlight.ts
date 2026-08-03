import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { Node as PMNode } from '@tiptap/pm/model'
import type { EditorSuggestion } from './suggestions'
import { resolveSpan } from './suggestions'
import { buildTextIndex, textRangeToPM } from './tiptap-offsets'

export const suggestionHighlightKey = new PluginKey<SuggestionHighlightState>('suggestionHighlight')

interface SuggestionHighlightState {
	suggestions: EditorSuggestion[]
	decorations: DecorationSet
}

const CATEGORY_CLASS: Record<string, string> = {
	grammar: 'suggestion-mark suggestion-mark--grammar',
	spelling: 'suggestion-mark suggestion-mark--spelling',
	style: 'suggestion-mark suggestion-mark--style',
}

/**
 * Bangun dekorasi dengan mencari ulang setiap `original` di dokumen saat ini.
 *
 * Offset yang tersimpan hanya jadi petunjuk. Karena posisinya dihitung ulang
 * setiap kali dokumen berubah, sorotan tidak pernah melenceng saat pengguna
 * mengetik — tidak ada offset tersimpan yang perlu digeser-geser, dan
 * suggestion yang teksnya sudah hilang otomatis berhenti disorot.
 */
function buildDecorations(doc: PMNode, suggestions: readonly EditorSuggestion[]): DecorationSet {
	const index = buildTextIndex(doc)
	const decorations: Decoration[] = []
	const taken: Array<{ from: number; to: number }> = []

	for (const suggestion of suggestions) {
		if (suggestion.dismissed) continue

		const span = resolveSpan(index.text, suggestion.original, suggestion.offset)
		if (!span) continue

		const range = textRangeToPM(index, span.offset, span.length)
		if (!range) continue

		// Satu karakter tidak boleh masuk dua dekorasi — yang bertabrakan dilewati.
		if (taken.some((other) => range.from < other.to && range.to > other.from)) continue
		taken.push(range)

		decorations.push(
			Decoration.inline(range.from, range.to, {
				class: CATEGORY_CLASS[suggestion.category] ?? 'suggestion-mark',
				'data-suggestion-id': suggestion.id,
			}),
		)
	}

	return DecorationSet.create(doc, decorations)
}

/**
 * Ekstensi yang menyorot suggestion di dalam editor.
 *
 * Dipakai lewat dekorasi, bukan dengan menyisipkan node ke dokumen, supaya
 * sorotan tidak pernah ikut tersimpan sebagai isi draf.
 */
export const SuggestionHighlight = Extension.create({
	name: 'suggestionHighlight',

	addProseMirrorPlugins() {
		return [
			new Plugin<SuggestionHighlightState>({
				key: suggestionHighlightKey,

				state: {
					init: () => ({ suggestions: [], decorations: DecorationSet.empty }),

					apply(tr, current, _oldState, newState) {
						const incoming = tr.getMeta(suggestionHighlightKey) as EditorSuggestion[] | undefined
						if (incoming) {
							return { suggestions: incoming, decorations: buildDecorations(newState.doc, incoming) }
						}
						if (tr.docChanged) {
							return {
								suggestions: current.suggestions,
								decorations: buildDecorations(newState.doc, current.suggestions),
							}
						}
						return current
					},
				},

				props: {
					decorations: (state) => suggestionHighlightKey.getState(state)?.decorations,
				},
			}),
		]
	},
})
