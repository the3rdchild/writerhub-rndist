import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'

export const TrailingParagraph = Extension.create({
	name: 'trailingParagraph',

	addProseMirrorPlugins() {
		return [
			new Plugin({
				key: new PluginKey('trailingParagraph'),

				appendTransaction(_transactions, _oldState, newState) {
					const { doc, tr, schema } = newState
					const last = doc.lastChild
					if (!last) return null
					if (last.type.name === 'paragraph') return null

					return tr.insert(doc.content.size, schema.nodes.paragraph.create())
				},
			}),
		]
	},
})
