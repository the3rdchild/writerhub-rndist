import { Extension } from '@tiptap/core'
import type { Node as PMNode, ResolvedPos } from '@tiptap/pm/model'
import type { Editor } from '@tiptap/react'

/**
 * Apakah baris header sebuah tabel digambar ulang di puncak lembar lanjutan.
 *
 * Disimpan sebagai atribut node, bukan pengaturan global: dalam satu dokumen
 * bisa ada tabel besar yang butuh header berulang dan tabel dua baris yang
 * justru terganggu olehnya. Paginasi membaca atribut ini saat memutuskan apa
 * yang disisipkan di awal lembar baru.
 */

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
						// Hanya ditulis saat dimatikan; nilai bawaan tidak perlu
						// mengotori HTML tiap tabel.
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

/** Tabel tempat kursor berada, beserta posisinya. */
function tableAround($from: ResolvedPos): { node: PMNode; pos: number } | null {
	for (let depth = $from.depth; depth > 0; depth -= 1) {
		const node = $from.node(depth)
		if (node.type.name === 'table') return { node, pos: $from.before(depth) }
	}
	return null
}

/** Apakah kursor sedang berada di dalam tabel yang mengulang headernya. */
export function tableRepeatsHeader(editor: Editor | null): boolean {
	if (!editor) return false
	const found = tableAround(editor.state.selection.$from)
	return found ? found.node.attrs.repeatHeader !== false : false
}

/** Apakah kursor sedang berada di dalam tabel sama sekali. */
export function isInsideTable(editor: Editor | null): boolean {
	if (!editor) return false
	return tableAround(editor.state.selection.$from) !== null
}
