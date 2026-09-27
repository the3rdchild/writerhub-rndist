import { Extension } from '@tiptap/core'
import { NodeSelection, Plugin, PluginKey, TextSelection } from '@tiptap/pm/state'

/**
 * Klik ke naskah saat editor belum fokus dan seleksinya masih memilih satu
 * blok utuh (daftar isi, diagram, blok HTML).
 *
 * Keadaan itu lahir setiap kali AI menyisipkan blok seperti itu: blok baru
 * terpilih, sementara fokus ada di kotak chat. Klik penulis berikutnya
 * memindahkan fokus, dan transaksi `focus` (TipTap, juga sorotan seleksi)
 * membuat ProseMirror menerapkan ulang pilihan blok lama ke DOM - tepat
 * sebelum peramban menaruh kursor di titik klik. Kursornya tidak pernah
 * pindah, dan ketikan berikutnya MENGGANTIKAN blok yang masih terpilih itu.
 *
 * Untuk seleksi teks ProseMirror punya pengaman sendiri; untuk pilihan blok
 * tidak. Jadi di sini seleksinya dipindahkan ke titik klik lebih dulu, sebelum
 * fokus berpindah - sesudahnya penanganan klik bawaan berjalan seperti biasa.
 */
export const ClickPastNodeSelection = Extension.create({
	name: 'clickPastNodeSelection',

	addProseMirrorPlugins() {
		return [
			new Plugin({
				key: new PluginKey('clickPastNodeSelection'),
				props: {
					handleDOMEvents: {
						mousedown: (view, event) => {
							const selection = view.state.selection
							if (!(selection instanceof NodeSelection) || view.hasFocus() || event.button !== 0) return false
							// Klik pada blok yang terpilih itu sendiri: biarkan (seret, tombol perkakasnya).
							const selected = view.nodeDOM(selection.from)
							if (selected instanceof Node && selected.contains(event.target as Node)) return false
							const target = view.posAtCoords({ left: event.clientX, top: event.clientY })
							if (!target) return false
							const next = TextSelection.near(view.state.doc.resolve(target.pos))
							view.dispatch(view.state.tr.setSelection(next).setMeta('addToHistory', false))
							return false
						},
					},
				},
			}),
		]
	},
})
