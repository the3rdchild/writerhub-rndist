import { Extension } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
function build(doc: PMNode): DecorationSet {
	const decorations: Decoration[] = []
	doc.descendants((node, pos) => {
		if (node.type.name !== 'table') return true
		const left = Number(node.attrs.indentLeft) || 0
		if (left > 0) {
			decorations.push(Decoration.node(pos, pos + node.nodeSize, { style: `margin-left: ${left}px` }))
		}
		return false
	})
	return DecorationSet.create(doc, decorations)
}

const tableIndentKey = new PluginKey<DecorationSet>('tableIndent')

export const TableIndent = Extension.create({
	name: 'tableIndent',

	addProseMirrorPlugins() {
		return [
			new Plugin<DecorationSet>({
				key: tableIndentKey,
				state: {
					init: (_config, state) => build(state.doc),
					apply: (tr, current) => (tr.docChanged ? build(tr.doc) : current),
				},
				props: {
					decorations(state) {
						return tableIndentKey.getState(state) ?? null
					},
				},
			}),
		]
	},
})
