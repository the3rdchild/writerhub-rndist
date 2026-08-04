import { mergeAttributes, Node } from '@tiptap/core'
import { shortcutKeys } from '@/features/shortcuts/registry'

/**
 * Pemenggalan halaman yang diminta pengguna, bukan hasil pengukuran.
 *
 * Ekstensi Pagination memindahkan teks berdasarkan tinggi blok; node ini
 * memberinya alasan kedua untuk berpindah halaman — kehendak penulis. Karena
 * disimpan sebagai node, ia ikut tersimpan di tab, bertahan setelah dimuat
 * ulang, terbawa saat dicetak, dan bisa dihapus seperti isi dokumen lain.
 */

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
					// Node atom di ujung dokumen tidak menyisakan tempat untuk kursor,
					// jadi paragraf kosong disertakan supaya penulis bisa langsung
					// mengetik di halaman baru.
					const atEnd = state.selection.to >= state.doc.content.size - 1
					const content = atEnd
						? [{ type: this.name }, { type: 'paragraph' }]
						: [{ type: this.name }]

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
