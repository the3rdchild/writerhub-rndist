import { Extension } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { buildTextIndex, textPosToPM, textRangeToPM } from '@/features/document/tiptap-offsets'
import { countWords } from '@/lib/utils'
import type { VersionDiffRange } from '@/features/versions/diff'

export const analysisDiffHighlightKey = new PluginKey<AnalysisDiffHighlightState>('analysisDiffHighlight')

interface AnalysisDiffHighlightState {
	ranges: VersionDiffRange[]
	decorations: DecorationSet
}
function buildDecorations(doc: PMNode, ranges: readonly VersionDiffRange[]): DecorationSet {
	if (ranges.length === 0) return DecorationSet.empty

	const index = buildTextIndex(doc)
	const decorations: Decoration[] = []

	for (const range of ranges) {
		if (range.kind === 'removed') {
			const pm = textRangeToPM(index, range.offset, range.length)
			if (!pm) continue
			decorations.push(Decoration.inline(pm.from, pm.to, { class: 'version-diff-removed' }))
			continue
		}
		const pos = textPosToPM(index, range.offset)
		if (pos === null) continue

		const addedWords = countWords(range.words ?? '')
		decorations.push(
			Decoration.widget(
				pos,
				() => {
					const marker = document.createElement('span')
					marker.className = 'version-diff-added'
					marker.title = `${addedWords} word${addedWords === 1 ? '' : 's'} added by this run`
					marker.setAttribute('aria-label', `${addedWords} word${addedWords === 1 ? '' : 's'} added by this run`)
					return marker
				},
				{ key: `analysis-diff-added-${range.offset}` },
			),
		)
	}

	return DecorationSet.create(doc, decorations)
}
export const AnalysisDiffHighlight = Extension.create({
	name: 'analysisDiffHighlight',

	addProseMirrorPlugins() {
		return [
			new Plugin<AnalysisDiffHighlightState>({
				key: analysisDiffHighlightKey,

				state: {
					init: () => ({ ranges: [], decorations: DecorationSet.empty }),
					apply(tr, current, _oldState, newState) {
						const incoming = tr.getMeta(analysisDiffHighlightKey) as VersionDiffRange[] | null | undefined
						if (incoming !== undefined) {
							const ranges = incoming ?? []
							return { ranges, decorations: buildDecorations(newState.doc, ranges) }
						}
						if (tr.docChanged) {
							return {
								ranges: current.ranges,
								decorations: buildDecorations(newState.doc, current.ranges),
							}
						}
						return current
					},
				},

				props: {
					decorations: (state) => analysisDiffHighlightKey.getState(state)?.decorations,
				},
			}),
		]
	},
})
