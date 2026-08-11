import { Extension, mergeAttributes, Node } from '@tiptap/core'

/**
 * Kolom gaya koran - teks terpilih mengalir dan berimbang sendiri antar kolom.
 *
 * Versi sebelumnya memakai wadah `columns` berisi node `column` terpisah, dan
 * seluruh isi terpilih ditumpuk ke kolom pertama sementara sisanya diisi
 * paragraf kosong. Hasilnya bukan kolom sama sekali: teks terjepit ke separuh
 * atau sepertiga halaman dengan ruang mati di sebelahnya.
 *
 * Di sini `columns` cukup satu node pembungkus berisi blok biasa, dan CSS
 * multi-kolom (`column-count`) yang membagi alirannya. Konsekuensinya semua
 * baik: mengetik tetap satu aliran normal, teks berpindah kolom sendiri saat
 * bertambah, dan tidak ada node perantara yang harus dijaga tetap sinkron.
 *
 * Perintah: `setColumns(n)` membungkus seleksi jadi n kolom - atau mengubah
 * jumlahnya kalau seleksi sudah berada di dalam kolom; `unsetColumns`
 * mengangkat isinya kembali ke aliran dokumen.
 */

/** Minimal dua - satu kolom itu paragraf biasa. */
const MIN_COLUMNS = 2

declare module '@tiptap/core' {
	interface Commands<ReturnType> {
		columns: {
			setColumns: (count: number) => ReturnType
			unsetColumns: () => ReturnType
		}
	}
}

export const Columns = Node.create({
	name: 'columns',

	group: 'block',

	content: 'block+',

	defining: true,

	addAttributes() {
		return {
			count: {
				default: MIN_COLUMNS,
				parseHTML: (element) => {
					const parsed = Number(element.getAttribute('data-count'))
					return Number.isFinite(parsed) && parsed >= MIN_COLUMNS ? parsed : MIN_COLUMNS
				},
				// `column-count` ditulis inline, bukan dienumerasi di CSS: jumlah
				// kolom itu data, dan daftar `[data-count='2']`, `[data-count='3']`
				// akan diam-diam tidak berlaku begitu ada angka yang belum terdaftar.
				renderHTML: (attributes) => ({
					'data-count': attributes.count,
					style: `column-count: ${attributes.count}`,
				}),
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
			setColumns:
				(count) =>
				({ editor, commands }) => {
					if (!Number.isFinite(count) || count < MIN_COLUMNS) return false
					// Sudah di dalam kolom: ganti jumlahnya, jangan bersarang lagi.
					if (editor.isActive(this.name)) {
						return commands.updateAttributes(this.name, { count })
					}
					return commands.wrapIn(this.name, { count })
				},
			unsetColumns:
				() =>
				({ commands }) =>
					commands.lift(this.name),
		}
	},
})

/**
 * Node lama dari struktur kolom sebelumnya, didaftarkan agar naskah yang sudah
 * telanjur menyimpannya tetap bisa dimuat - skema yang tidak mengenali sebuah
 * tipe node membuat seluruh dokumen gagal dibaca. Tidak pernah dibuat lagi oleh
 * perintah mana pun; isinya ikut mengalir sebagai blok biasa.
 */
const LegacyColumn = Node.create({
	name: 'column',

	group: 'block',

	content: 'block+',

	renderHTML({ HTMLAttributes }) {
		return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'col' }), 0]
	},

	parseHTML() {
		return [{ tag: 'div[data-type="col"]' }]
	},
})

/**
 * Extension payung supaya cukup satu entri di daftar ekstensi editor.
 */
export const ColumnExtension = Extension.create({
	name: 'columnExtension',

	addExtensions() {
		return [Columns, LegacyColumn]
	},
})
