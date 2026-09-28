import { Extension } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { HTML_BLOCK } from '@/features/editor/html-block'

/**
 * Apakah node adalah blok HTML mode halaman penuh.
 *
 * Blok ini mengisi tepat satu lembar. Paragraf kosong sesudahnya - yang
 * ditambahkan ekstensi ini supaya penulis bisa mengetik - tidak boleh
 * melahirkan lembar baru di cetak/PDF/DOCX (EX-2). Paginasi, CSS cetak, dan
 * ekspor DOCX memakai fungsi ini untuk mengenali situasinya.
 */
export function isPageFitBlock(node: PMNode): boolean {
	return node.type.name === HTML_BLOCK && node.attrs.fit === 'page'
}

/**
 * Apakah node adalah paragraf kosong (tidak ada isinya sama sekali).
 *
 * Di DOM ProseMirror paragraf kosong dirender sebagai `<p><br></p>`, tetapi
 * `<br>` itu ditambahkan oleh view, bukan isi node. Jadi pemeriksaan yang
 * benar adalah `content.size === 0`.
 */
export function isEmptyParagraph(node: PMNode): boolean {
	return node.type.name === 'paragraph' && node.content.size === 0
}

export const TrailingParagraph = Extension.create({
	name: 'trailingParagraph',

	addProseMirrorPlugins() {
		return [
			new Plugin({
				key: new PluginKey('trailingParagraph'),

				appendTransaction(_transactions, _oldState, newState) {
					const { doc, tr, schema } = newState
					const last = doc.lastChild
					if (!last) return null
					if (last.type.name === 'paragraph') return null

					/*
					 * Paragraf penutup tetap ditambahkan sesudah blok apa pun yang
					 * bukan paragraf - termasuk blok `fit: 'page'` - supaya penulis
					 * bisa mengetik. Tetapi paragraf kosong sesudah blok satu
					 * halaman tidak boleh melahirkan lembar baru (EX-2); itu ditangani
					 * terpisah di CSS cetak, paginasi, dan ekspor DOCX lewat
					 * `isPageFitBlock` dan `isEmptyParagraph`.
					 */
					return tr.insert(doc.content.size, schema.nodes.paragraph.create())
				},
			}),
		]
	},
})
