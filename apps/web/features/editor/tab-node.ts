'use client'

import { Node } from '@tiptap/core'

/**
 * Karakter tab di editor: node inline atom selebar tab stop berikutnya.
 *
 * Tanpa node ini, `\t` tidak terlihat di editor. Node ini merender `<span>`
 * yang lebarnya dihitung dari `tabStops` paragraf induknya; tanpa `tabStops`,
 * lebarnya 0,5 inci (1,27 cm) seperti baku Word.
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
})
