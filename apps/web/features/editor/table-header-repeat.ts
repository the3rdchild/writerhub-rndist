import { Extension } from '@tiptap/core'
import type { Node as PMNode, ResolvedPos } from '@tiptap/pm/model'
import type { Editor } from '@tiptap/react'

declare module '@tiptap/core' {
	interface Commands<ReturnType> {
		tableHeaderRepeat: {
			toggleTableHeaderRepeat: () => ReturnType
		}
	}
}

export const TableHeaderRepeat = Extension.create({
	name: 'tableHeaderRepeat',

	addGlobalAttributes() {
		return [
			{
				types: ['table'],
				attributes: {
					repeatHeader: {
						default: true,
						parseHTML: (element) => element.getAttribute('data-repeat-header') !== 'false',
						renderHTML: (attributes) =>
							attributes.repeatHeader === false ? { 'data-repeat-header': 'false' } : {},
					},
				},
			},
		]
	},

	addCommands() {
		return {
			toggleTableHeaderRepeat:
				() =>
				({ state, tr, dispatch }) => {
					const found = tableAround(state.selection.$from)
					if (!found) return false

					if (dispatch) {
						tr.setNodeAttribute(found.pos, 'repeatHeader', found.node.attrs.repeatHeader === false)
						dispatch(tr)
					}
					return true
				},
		}
	},
})

function tableAround($from: ResolvedPos): { node: PMNode; pos: number } | null {
	for (let depth = $from.depth; depth > 0; depth -= 1) {
		const node = $from.node(depth)
		if (node.type.name === 'table') return { node, pos: $from.before(depth) }
	}
	return null
}

export function tableRepeatsHeader(editor: Editor | null): boolean {
	if (!editor) return false
	const found = tableAround(editor.state.selection.$from)
	return found ? found.node.attrs.repeatHeader !== false : false
}

export function isInsideTable(editor: Editor | null): boolean {
	if (!editor) return false
	return tableAround(editor.state.selection.$from) !== null
}
