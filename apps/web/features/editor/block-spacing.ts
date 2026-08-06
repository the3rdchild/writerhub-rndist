'use client'

import { type CommandProps, Extension } from '@tiptap/core'
import type { Editor } from '@tiptap/react'

/**
 * Spasi baris dan jarak antarparagraf, disimpan pada bloknya.
 *
 * Sebelumnya spasi baris ditumpangkan pada mark `textStyle` - artinya ia jadi
 * gaya sepotong teks, bukan gaya paragraf. Itu terlihat benar selama nilainya
 * dinaikkan, dan diam-diam tidak berpengaruh saat diturunkan: tinggi baris
 * sebuah blok adalah yang terbesar antara strut bloknya dan kotak inline di
 * dalamnya, jadi span dengan `line-height: 1` tidak pernah bisa lebih rapat
 * dari paragraf yang memuatnya. Menaruhnya di blok membuat "Rapat (1,0)"
 * benar-benar merapatkan.
 *
 * Jarak sebelum dan sesudah paragraf ikut ke sini karena berasal dari tempat
 * yang sama di Word - `w:spacing` - dan sama-sama milik paragraf.
 */

/** Blok yang punya paragraf sendiri, jadi punya spasi sendiri. */
const SPACED = ['paragraph', 'heading', 'blockquote']

declare module '@tiptap/core' {
	interface Commands<ReturnType> {
		blockSpacing: {
			/** Spasi baris paragraf terpilih; nilai CSS, misalnya '1.5' atau '18px'. */
			setLineHeight: (lineHeight: string | null) => ReturnType
			/** Jarak sebelum/sesudah paragraf terpilih, dalam px. */
			setBlockSpace: (patch: { before?: number; after?: number }) => ReturnType
		}
	}
}

function readPx(value: string | undefined): number | null {
	if (!value) return null
	const parsed = Number.parseFloat(value)
	return Number.isFinite(parsed) ? Math.round(parsed) : null
}

export const BlockSpacing = Extension.create({
	name: 'blockSpacing',

	addGlobalAttributes() {
		return [
			{
				types: SPACED,
				attributes: {
					lineHeight: {
						default: null,
						parseHTML: (element) => element.style.lineHeight || null,
						renderHTML: (attributes) =>
							attributes.lineHeight ? { style: `line-height: ${attributes.lineHeight}` } : {},
					},
					spaceBefore: {
						default: null,
						parseHTML: (element) => readPx(element.style.marginTop),
						renderHTML: (attributes) =>
							attributes.spaceBefore === null || attributes.spaceBefore === undefined
								? {}
								: { style: `margin-top: ${attributes.spaceBefore}px` },
					},
					spaceAfter: {
						default: null,
						parseHTML: (element) => readPx(element.style.marginBottom),
						renderHTML: (attributes) =>
							attributes.spaceAfter === null || attributes.spaceAfter === undefined
								? {}
								: { style: `margin-bottom: ${attributes.spaceAfter}px` },
					},
				},
			},
		]
	},

	addCommands() {
		/** Menyetel atribut yang sama pada tiap blok berspasi di dalam seleksi. */
		const applyToBlocks =
			(attributes: Record<string, unknown>) =>
			({ state, tr, dispatch }: CommandProps) => {
				const { from, to } = state.selection
				let touched = false

				// Ukuran node tidak berubah, jadi posisi dari doc lama tetap sahih
				// selama iterasi ini - pola yang sama dipakai indentasi blok.
				state.doc.nodesBetween(from, to, (node, pos) => {
					if (!SPACED.includes(node.type.name)) return
					for (const [key, value] of Object.entries(attributes)) {
						if (node.attrs[key] === value) continue
						tr.setNodeAttribute(pos, key, value)
						touched = true
					}
				})

				if (touched && dispatch) dispatch(tr)
				return touched
			}

		return {
			setLineHeight: (lineHeight) => applyToBlocks({ lineHeight }),

			setBlockSpace: (patch) =>
				applyToBlocks({
					...(patch.before !== undefined ? { spaceBefore: Math.round(patch.before) } : {}),
					...(patch.after !== undefined ? { spaceAfter: Math.round(patch.after) } : {}),
				}),
		}
	},
})

/** Spasi baris blok tempat kursor berada, untuk menandai pilihan aktif di toolbar. */
export function lineHeightAt(editor: Editor): string | null {
	const { $from } = editor.state.selection

	for (let depth = $from.depth; depth >= 0; depth -= 1) {
		const node = $from.node(depth)
		if (SPACED.includes(node.type.name)) return (node.attrs.lineHeight as string | null) ?? null
	}
	return null
}
