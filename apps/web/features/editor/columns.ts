import { type CommandProps, Extension, Node, mergeAttributes } from '@tiptap/core'
import { NodeSelection, TextSelection } from '@tiptap/pm/state'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'

/**
 * Layout multi-kolom - dua atau lebih kolom berdampingan.
 *
 * Diadaptasi dari ferdocs (multi-column) tanpa node `dBlock` perantara: isi
 * tiap kolom adalah grup `block` biasa (paragraf, heading, daftar, dll.),
 * kompatibel dengan sisa skema naskah. `isolating` menahan kursor di dalam
 * kolomnya saat mengetik di tepi.
 *
 * Perintah: `setColumns(n)` melipat seleksi menjadi n kolom; `unsetColumns`
 * meratakan kembali isinya ke aliran dokumen.
 */

export enum ColumnLayout {
	AlignLeft = 'align-left',
	AlignRight = 'align-right',
	AlignCenter = 'align-center',
}

declare module '@tiptap/core' {
	interface Commands<ReturnType> {
		columns: {
			unsetColumns: () => ReturnType
			setColumns: (columns: number) => ReturnType
			setLayout: (layout: ColumnLayout) => ReturnType
		}
	}
}

export const Column = Node.create({
	name: 'column',

	group: 'columns',

	content: 'block+',

	isolating: true,

	addAttributes() {
		return {
			position: {
				default: '',
				parseHTML: (element) => element.getAttribute('data-position'),
				renderHTML: (attributes) => ({ 'data-position': attributes.position }),
			},
		}
	},

	renderHTML({ HTMLAttributes }) {
		return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'col' }), 0]
	},

	parseHTML() {
		return [{ tag: 'div[data-type="col"]' }]
	},
})

export const Columns = Node.create({
	name: 'columns',

	group: 'block',

	content: 'column{2,}',

	defining: true,

	draggable: true,

	isolating: true,

	addAttributes() {
		return {
			layout: {
				default: ColumnLayout.AlignCenter,
				parseHTML: (element) => element.getAttribute('data-layout') ?? ColumnLayout.AlignCenter,
				renderHTML: (attributes) => ({ 'data-layout': attributes.layout }),
			},
		}
	},

	renderHTML({ HTMLAttributes }) {
		return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'columns' }), 0]
	},

	parseHTML() {
		return [{ tag: 'div[data-type="columns"]' }]
	},

	addCommands() {
		return {
			unsetColumns:
				() =>
				({ tr, dispatch }: CommandProps) => {
					if (!dispatch) return false
					try {
						const pos = tr.selection.$from
						let firstAncestor: Ancestor | undefined
						for (let depth = pos.depth; depth > 0; depth--) {
							const node = pos.node(depth)
							if (node.type === this.type) {
								firstAncestor = { node, pos: pos.before(depth) }
								break
							}
						}
						if (!firstAncestor) return false

						// Kumpulkan isi tiap kolom, lalu sisipkan kembali ke aliran dokumen.
						let nodes: ProseMirrorNode[] = []
						firstAncestor.node.descendants((node, _pos, parent) => {
							if (parent?.type.name === 'columns') nodes.push(node)
						})
						nodes = nodes.reverse().filter((node) => node.content.size > 0)

						const resolvedPos = tr.doc.resolve(firstAncestor.pos)
						tr.setSelection(new NodeSelection(resolvedPos))
						for (const node of nodes) tr.insert(firstAncestor.pos, node)
						tr.deleteSelection()
						dispatch(tr)
						return true
					} catch {
						return false
					}
				},
			setColumns:
				(n: number) =>
				({ tr, dispatch }: CommandProps) => {
					if (!dispatch || n < 2) return false
					try {
						const { doc, selection } = tr
						// Bangun n kolom; pindahkan blok terpilih ke kolom pertama, sisanya
						// diisi paragraf kosong.
						const contentType = doc.type.schema.nodes.paragraph
						const columnType = doc.type.schema.nodes.column
						const columnsType = doc.type.schema.nodes.columns

						// Ambil blok tingkat-atas yang tumpang tindih dengan seleksi.
						const range = selection.$from.blockRange(selection.$to)
						const content: ProseMirrorNode[] = []
						if (range) {
							doc.nodesBetween(range.start, range.end, (node, _pos, parent) => {
								if (parent === range.parent && node.isBlock && node !== range.parent) {
									content.push(node)
								}
							})
						}
						if (content.length === 0) content.push(contentType.create())

						// Buat node kolom.
						const buildColumn = (nodes: ProseMirrorNode[], index: number) =>
							columnType.create({ position: String(index) }, nodes)
						const columns: ProseMirrorNode[] = [
							buildColumn(content, 0),
							...Array.from({ length: n - 1 }, (_, i) =>
								buildColumn([contentType.create()], i + 1),
							),
						]
						const columnsNode = columnsType.create({ layout: ColumnLayout.AlignCenter }, columns)

						if (range) {
							tr.replaceRangeWith(range.start, range.end, columnsNode)
						} else {
							tr.insert(tr.selection.from, columnsNode)
						}

						// Kursor ke awal kolom pertama.
						const insertedPos = (range ? range.start : tr.selection.from) + 1
						tr.setSelection(TextSelection.near(tr.doc.resolve(insertedPos)))
						dispatch(tr)
						return true
					} catch {
						return false
					}
				},
			setLayout:
				(layout: ColumnLayout) =>
				({ tr, dispatch }: CommandProps) => {
					if (!dispatch) return false
					const pos = tr.selection.$from
					let columnsPos: number | null = null
					for (let depth = pos.depth; depth > 0; depth--) {
						if (pos.node(depth).type.name === 'columns') {
							columnsPos = pos.before(depth)
							break
						}
					}
					if (columnsPos === null) return false
					tr.setNodeMarkup(columnsPos, undefined, { layout })
					dispatch(tr)
					return true
				},
		}
	},
})

interface Ancestor {
	node: ProseMirrorNode
	pos: number
}

/**
 * Extension payung yang mendaftarkan kedua node sekaligus, supaya cukup satu
 * entri di daftar ekstensi editor.
 */
export const ColumnExtension = Extension.create({
	name: 'columnExtension',

	addExtensions() {
		return [Column, Columns]
	},
})
