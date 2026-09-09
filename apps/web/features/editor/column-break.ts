import { mergeAttributes, Node } from '@tiptap/core'

export const COLUMN_BREAK_NODE = 'columnBreak'

declare module '@tiptap/core' {
	interface Commands<ReturnType> {
		columnBreak: {
			setColumnBreak: () => ReturnType
		}
	}
}

/**
 * Pindah kolom (`w:br w:type="column"`).
 *
 * Kembarannya `pageBreak`, dan bentuknya sengaja sama: atom bertinggi nol yang
 * hanya menggambar penandanya. Bedanya di tempat ia mendarat - di dalam wilayah
 * berkolom `flowColumns` memindahkan isi sesudahnya ke kolom BERIKUTNYA, bukan
 * ke lembar berikutnya. Di luar wilayah berkolom Word memperlakukannya sebagai
 * pemenggal halaman, dan paginasi di sini menuruti itu.
 */
export const ColumnBreak = Node.create({
	name: COLUMN_BREAK_NODE,

	group: 'block',
	atom: true,
	selectable: true,

	parseHTML() {
		return [{ tag: 'div[data-column-break]' }]
	},

	renderHTML({ HTMLAttributes }) {
		return [
			'div',
			mergeAttributes(HTMLAttributes, {
				'data-column-break': '',
				class: 'column-break',
				'aria-label': 'Pindah kolom',
			}),
		]
	},

	addCommands() {
		return {
			setColumnBreak:
				() =>
				({ chain, state }) => {
					const atEnd = state.selection.to >= state.doc.content.size - 1
					const content = atEnd ? [{ type: this.name }, { type: 'paragraph' }] : [{ type: this.name }]

					return chain().insertContent(content).run()
				},
		}
	},
})
