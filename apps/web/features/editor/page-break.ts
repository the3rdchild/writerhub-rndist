import { mergeAttributes, Node } from '@tiptap/core'
import { shortcutKeys } from '@/features/shortcuts/registry'
import { insertBreak } from './break-insert'
export const PAGE_BREAK_NODE = 'pageBreak'

declare module '@tiptap/core' {
	interface Commands<ReturnType> {
		pageBreak: {
			setPageBreak: () => ReturnType
		}
	}
}

export const PageBreak = Node.create({
	name: PAGE_BREAK_NODE,

	group: 'block',
	atom: true,
	selectable: true,

	parseHTML() {
		return [{ tag: 'div[data-page-break]' }]
	},

	renderHTML({ HTMLAttributes }) {
		return [
			'div',
			mergeAttributes(HTMLAttributes, {
				'data-page-break': '',
				class: 'page-break',
				'aria-label': 'Pemenggalan halaman',
			}),
		]
	},

	addCommands() {
		return {
			setPageBreak:
				() =>
				({ state, tr, dispatch }) =>
					insertBreak(state, tr, dispatch, state.schema.nodes[this.name]),
		}
	},

	addKeyboardShortcuts() {
		return {
			[shortcutKeys('doc.pageBreak')]: () => this.editor.commands.setPageBreak(),
		}
	},
})
