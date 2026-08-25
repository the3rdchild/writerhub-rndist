import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
const SELECTION_HIGHLIGHT_CLASS = 'selection-persist'

interface FocusState {
	focused: boolean
}

const selectionHighlightKey = new PluginKey<FocusState>('selectionHighlight')

export const SelectionHighlight = Extension.create({
	name: 'selectionHighlight',

	addProseMirrorPlugins() {
		return [
			new Plugin<FocusState>({
				key: selectionHighlightKey,
				state: {
					init: () => ({ focused: false }),
					apply(tr, value) {
						const next = tr.getMeta(selectionHighlightKey)
						return next ?? value
					},
				},
				props: {
					decorations(state) {
						const status = selectionHighlightKey.getState(state)
						if (!status || status.focused) return null

						const { selection } = state
						if (selection.empty) return null

						return DecorationSet.create(state.doc, [
							Decoration.inline(selection.from, selection.to, {
								class: SELECTION_HIGHLIGHT_CLASS,
							}),
						])
					},
					handleDOMEvents: {
						focus: (view) => {
							if (!view.isDestroyed) {
								view.dispatch(view.state.tr.setMeta(selectionHighlightKey, { focused: true }))
							}
							return false
						},
						blur: (view) => {
							if (!view.isDestroyed) {
								view.dispatch(view.state.tr.setMeta(selectionHighlightKey, { focused: false }))
							}
							return false
						},
					},
				},
			}),
		]
	},
})
