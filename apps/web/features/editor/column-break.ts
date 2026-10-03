import { mergeAttributes, Node } from '@tiptap/core'
import { insertBreak } from './break-insert'

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
				'aria-label': 'Column break',
			}),
		]
	},

	addCommands() {
		return {
			setColumnBreak:
				() =>
				({ state, tr, dispatch }) =>
					insertBreak(state, tr, dispatch, state.schema.nodes[this.name]),
		}
	},
})
