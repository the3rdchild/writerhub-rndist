import { mergeAttributes, Node } from '@tiptap/core'
import { shortcutKeys } from '@/features/shortcuts/registry'
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
				({ chain, state }) => {
					const atEnd = state.selection.to >= state.doc.content.size - 1
					const content = atEnd ? [{ type: this.name }, { type: 'paragraph' }] : [{ type: this.name }]

					return chain().insertContent(content).run()
				},
		}
	},

	addKeyboardShortcuts() {
		return {
			[shortcutKeys('doc.pageBreak')]: () => this.editor.commands.setPageBreak(),
		}
	},
})
