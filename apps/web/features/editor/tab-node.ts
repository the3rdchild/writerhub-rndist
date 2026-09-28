'use client'

import { Node } from '@tiptap/core'

/**
 * Karakter tab di editor: node inline atom selebar jarak ke tab stop berikutnya.
 *
 * Tanpa node ini, `\t` tidak terlihat di editor. Lebarnya dihitung
 * `tab-layout.ts` dari `tabStops` paragraf induknya; tanpa `tabStops`, tab
 * jatuh ke kelipatan 0,5 inci (1,27 cm) seperti baku Word.
 */

/** Lebar tab baku tanpa tab stop: 0,5 inci = 36 pt. */
export const DEFAULT_TAB_PT = 36

export const Tab = Node.create({
	name: 'tab',
	group: 'inline',
	inline: true,
	atom: true,

	parseHTML() {
		return [{ tag: 'span[data-tab]' }]
	},

	renderHTML() {
		return ['span', { 'data-tab': '' }]
	},

	/*
	 * Lebarnya ditulis `tab-layout.ts` langsung ke gaya elemen ini. Mutasi itu
	 * diabaikan, supaya ProseMirror tidak membacanya sebagai perubahan dokumen
	 * lalu menggambar ulang - yang akan menghapus lebarnya lagi.
	 */
	addNodeView() {
		return () => {
			const dom = document.createElement('span')
			dom.setAttribute('data-tab', '')
			// Lebar hanya berlaku pada inline-block; tidak bergantung pada CSS halaman.
			dom.style.display = 'inline-block'
			return { dom, ignoreMutation: () => true }
		}
	},
})
