import { Extension } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { buildTextIndex, textRangeToPM } from '@/features/document/tiptap-offsets'

export const candidatePreviewKey = new PluginKey<CandidatePreviewState>('candidatePreview')

export interface CandidatePreview {
	offset: number
	length: number
	original: string
	candidate: string
}

interface CandidatePreviewState {
	preview: CandidatePreview | null
	decorations: DecorationSet
}

function buildDecorations(doc: PMNode, preview: CandidatePreview | null): DecorationSet {
	if (!preview) return DecorationSet.empty

	const index = buildTextIndex(doc)
	const at = index.text.slice(preview.offset, preview.offset + preview.length)
	const start = at === preview.original ? preview.offset : index.text.indexOf(preview.original)
	if (start === -1) return DecorationSet.empty

	const range = textRangeToPM(index, start, preview.original.length)
	if (!range) return DecorationSet.empty

	return DecorationSet.create(doc, [
		Decoration.inline(range.from, range.to, { class: 'candidate-preview-original' }),
		Decoration.widget(
			range.to,
			() => {
				const ghost = document.createElement('span')
				ghost.className = 'candidate-preview-ghost'
				ghost.textContent = preview.candidate
				ghost.setAttribute('aria-hidden', 'true')
				ghost.contentEditable = 'false'
				return ghost
			},
			{ side: 1, key: `candidate-${start}-${preview.candidate.length}` },
		),
	])
}

export const CandidatePreviewHighlight = Extension.create({
	name: 'candidatePreview',

	addProseMirrorPlugins() {
		return [
			new Plugin<CandidatePreviewState>({
				key: candidatePreviewKey,

				state: {
					init: () => ({ preview: null, decorations: DecorationSet.empty }),

					apply(tr, current, _oldState, newState) {
						const incoming = tr.getMeta(candidatePreviewKey) as CandidatePreview | null | undefined
						if (incoming !== undefined) {
							return { preview: incoming, decorations: buildDecorations(newState.doc, incoming) }
						}
						if (tr.docChanged) {
							return {
								preview: current.preview,
								decorations: buildDecorations(newState.doc, current.preview),
							}
						}
						return current
					},
				},

				props: {
					decorations: (state) => candidatePreviewKey.getState(state)?.decorations,
				},
			}),
		]
	},
})
