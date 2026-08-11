import { Extension } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

/**
 * Geser tabel ke kanan sesuai atribut `indentLeft`-nya.
 *
 * Kenapa dekorasi, bukan cukup `renderHTML` pada atributnya: dengan
 * `resizable: true`, `Table.addNodeView()` milik Tiptap mengembalikan null dan
 * yang dipakai adalah `TableView` bawaan `prosemirror-tables`. View itu
 * membangun `div.tableWrapper > table` sendiri dan tidak pernah menerima
 * `HTMLAttributes` dari Tiptap, jadi `margin-left` hasil `renderHTML` tidak
 * pernah sampai ke DOM yang terlihat - tabelnya hanya menyempit dari kanan
 * sementara tepi kirinya diam.
 *
 * Dekorasi node menempel ke DOM terluar milik node view itu, apa pun isinya,
 * jadi ia bekerja tanpa harus mengambil alih atau menyalin ulang `TableView`.
 *
 * `renderHTML` pada atributnya tetap dipertahankan: itu yang dipakai saat
 * dokumen diserialkan ke HTML (salin-tempel, impor-ekspor), tempat tidak ada
 * node view sama sekali.
 */
function build(doc: PMNode): DecorationSet {
	const decorations: Decoration[] = []
	doc.descendants((node, pos) => {
		if (node.type.name !== 'table') return true
		const left = Number(node.attrs.indentLeft) || 0
		if (left > 0) {
			decorations.push(
				Decoration.node(pos, pos + node.nodeSize, { style: `margin-left: ${left}px` }),
			)
		}
		// Tabel tidak pernah memuat tabel lain di skema ini.
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
				// Disimpan sebagai state plugin, bukan dihitung di `props.decorations`:
				// transaksi yang hanya memindahkan kursor jauh lebih sering daripada
				// yang mengubah isi, dan tanpa penjaga ini tiap gerakan kursor
				// menelusuri ulang seluruh dokumen.
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
