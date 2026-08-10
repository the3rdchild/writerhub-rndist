import { TableOfContents } from '@tiptap/extension-table-of-contents'

/**
 * Daftar isi otomatis dari heading - data disimpan di storage ekstensi dan
 * dibaca panel TOC (`toc-panel.tsx`). Ekstensi ini tidak menyisipkan apa pun ke
 * dokumen; ia hanya mengawasi heading dan melapor.
 *
 * `getId` harus deterministik supaya anchor tahan antar muat ulang dan tab -
 * judul heading yang sama di tab berbeda tidak boleh menghasilkan id yang sama,
 * jadi id dibangun dari posisi node.
 */
export const TableOfContentsConfigured = TableOfContents.configure({
	getId: (textContent) => {
		// Anchor singkat & stabil dari teks heading.
		return textContent
			.toLowerCase()
			.replace(/[^\w\s-]/g, '')
			.trim()
			.replace(/\s+/g, '-')
	},
})
