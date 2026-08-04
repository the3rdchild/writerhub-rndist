import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

/**
 * Mempertahankan tampilan seleksi teks saat editor kehilangan fokus.
 *
 * Seleksi bawaan browser hanya terlihat utuh saat contenteditable sedang
 * difokuskan; begitu pengguna mengklik panel kanan, warna birunya memudar
 * meski seleksinya tetap ada di state. Ekstensi ini menggambar ulang rentang
 * yang sama sebagai dekorasi ProseMirror, jadi sorotannya bertahan terlepas
 * dari fokus - sama seperti halaman kertas yang tetap menampilkan blok yang
 * di-block meski buku ditaruh di meja.
 *
 * Saat editor kembali difokuskan, dekorasi diturunkan agar tidak menumpuk
 * dengan seleksi bawaan browser (yang menggambar sendiri di atasnya).
 */

const SELECTION_HIGHLIGHT_CLASS = 'selection-persist'

interface FocusState {
	focused: boolean
}

const selectionHighlightKey = new PluginKey<FocusState>('selectionHighlight')

export const SelectionHighlight = Extension.create({
	name: 'selectionHighlight',

	addProseMirrorPlugins() {
		return [
			new Plugin<FocusState>({
				key: selectionHighlightKey,
				state: {
					init: () => ({ focused: false }),
					apply(tr, value) {
						const next = tr.getMeta(selectionHighlightKey)
						return next ?? value
					},
				},
				props: {
					decorations(state) {
						const status = selectionHighlightKey.getState(state)
						// Sedang difokuskan: biarkan browser menggambar seleksinya sendiri.
						if (!status || status.focused) return null

						const { selection } = state
						if (selection.empty) return null

						return DecorationSet.create(state.doc, [
							Decoration.inline(selection.from, selection.to, {
								class: SELECTION_HIGHLIGHT_CLASS,
							}),
						])
					},
					handleDOMEvents: {
						focus: (view) => {
							if (!view.isDestroyed) {
								view.dispatch(view.state.tr.setMeta(selectionHighlightKey, { focused: true }))
							}
							return false
						},
						blur: (view) => {
							if (!view.isDestroyed) {
								view.dispatch(view.state.tr.setMeta(selectionHighlightKey, { focused: false }))
							}
							return false
						},
					},
				},
			}),
		]
	},
})
