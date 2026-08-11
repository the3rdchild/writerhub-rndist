import { TableCell, TableHeader } from '@tiptap/extension-table'

/**
 * Sel & kepala tabel dengan atribut kustomisasi: warna latar + warna bingkai.
 *
 * Mengikuti pola demo resmi Tiptap (demos/src/Examples/Tables) - memperluas
 * TableCell/TableHeader bawaan dengan atribut baru, lalu mendaftarkannya lewat
 * `TableKit.configure({ tableCell: false, tableHeader: false })` dan
 * menambahkan versi kustom ini secara terpisah.
 *
 * Atribut dituang ke `data-*` + `style` supaya:
 *  - `data-background-color`/`data-border-color` bertahan saat menyalin-tempel
 *    antar tab dan saat impor HTML,
 *  - `style` langsung menerapkan warnanya tanpa CSS tambahan per sel.
 */

/** Atribut warna yang dipakai bersama sel & kepala. */
const colorAttributes = {
	backgroundColor: {
		default: null,
		parseHTML: (element: HTMLElement) =>
			element.getAttribute('data-background-color') ??
			(element.style.backgroundColor ? element.style.backgroundColor : null),
		renderHTML: (attributes: { backgroundColor?: string | null }) => {
			if (!attributes.backgroundColor) return {}
			return {
				'data-background-color': attributes.backgroundColor,
				style: `background-color: ${attributes.backgroundColor}`,
			}
		},
	},
	borderColor: {
		default: null,
		parseHTML: (element: HTMLElement) => element.getAttribute('data-border-color'),
		renderHTML: (attributes: { borderColor?: string | null }) => {
			if (!attributes.borderColor) return {}
			return {
				'data-border-color': attributes.borderColor,
				style: `border-color: ${attributes.borderColor}`,
			}
		},
	},
}

/** Sel tabel dengan warna latar & warna bingkai. */
export const CustomTableCell = TableCell.extend({
	addAttributes() {
		return {
			...this.parent?.(),
			...colorAttributes,
		}
	},
})

/** Kepala tabel dengan warna latar & warna bingkai. */
export const CustomTableHeader = TableHeader.extend({
	addAttributes() {
		return {
			...this.parent?.(),
			...colorAttributes,
		}
	},
})
