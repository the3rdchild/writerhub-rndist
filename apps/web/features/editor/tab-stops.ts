'use client'

import { Extension } from '@tiptap/core'
import { tabLayoutPlugin } from './tab-layout'

/**
 * Dukungan tab stop per paragraf.
 *
 * Tanpa `tabStops`, karakter tab jatuh ke kelipatan 1,27 cm (0,5 inci),
 * seperti baku Word. Dengan `tabStops`, tab berhenti di posisi yang ditentukan.
 *
 * Dipakai blok data pelamar di surat lamaran: titik dua sejajar lewat tab stop
 * kanan sebelumnya, bukan tabel tanpa garis.
 */

/** Pemilik tombol Tab sendiri: daftar dan tabel. */
const TAB_OWNERS = ['listItem', 'taskItem', 'tableCell', 'tableHeader']

export type TabStopType = 'left' | 'right' | 'center'

export interface TabStop {
	/** Posisi tab stop dalam pt dari margin kiri. */
	posPt: number
	/** Jenis perataan tab stop. */
	type: TabStopType
}

export interface TabStopsAttrs {
	/** Daftar tab stop paragraf; null/kosong = baku kelipatan 1,27 cm. */
	tabStops?: TabStop[] | null
}

declare module '@tiptap/core' {
	interface Commands<ReturnType> {
		tabStops: {
			setTabStops: (stops: TabStop[] | null) => ReturnType
		}
	}
}

export const TabStops = Extension.create({
	name: 'tabStops',
	priority: 110,

	addGlobalAttributes() {
		return [
			{
				types: ['paragraph'],
				attributes: {
					tabStops: {
						default: null,
						parseHTML: (element) => {
							const raw = element.getAttribute('data-tab-stops')
							if (!raw) return null
							try {
								return JSON.parse(raw) as TabStop[]
							} catch {
								return null
							}
						},
						renderHTML: (attributes) => {
							const stops = attributes.tabStops as TabStop[] | null | undefined
							return stops && stops.length > 0 ? { 'data-tab-stops': JSON.stringify(stops) } : {}
						},
					},
				},
			},
		]
	},

	addCommands() {
		return {
			setTabStops:
				(stops) =>
				({ state, tr, dispatch }) => {
					const { $from } = state.selection
					for (let depth = $from.depth; depth >= 0; depth -= 1) {
						const node = $from.node(depth)
						if (node.type.name !== 'paragraph') continue
						tr.setNodeAttribute($from.before(depth), 'tabStops', stops ?? null)
						if (dispatch) dispatch(tr)
						return true
					}
					return false
				},
		}
	},

	addKeyboardShortcuts() {
		return {
			/*
			 * Seperti Word: Tab di tengah baris paragraf menyisipkan karakter tab,
			 * supaya blok data surat ("Nama⇥: …") bisa diketik. Di awal paragraf
			 * Tab tetap menambah indentasi (`indent.ts`), dan di daftar serta
			 * tabel pemiliknya sendiri yang menangani - Tab pindah sel, atau
			 * menurunkan butir. Prioritasnya di atas `blockIndent` supaya aturan
			 * ini diperiksa lebih dulu; `false` menyerahkan tombolnya ke sana.
			 */
			Tab: ({ editor }) => {
				const { selection } = editor.state
				const { $from } = selection
				if (!selection.empty || $from.parent.type.name !== 'paragraph' || $from.parentOffset === 0)
					return false
				for (let depth = $from.depth; depth > 0; depth -= 1) {
					if (TAB_OWNERS.includes($from.node(depth).type.name)) return false
				}
				return editor.commands.insertContent({ type: 'tab' })
			},
		}
	},

	addProseMirrorPlugins() {
		return [tabLayoutPlugin()]
	},
})
