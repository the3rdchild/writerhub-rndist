'use client'

import { Extension } from '@tiptap/core'
import { shortcutKeys } from '@/features/shortcuts/registry'
import { clearFormatting, pastePlainTextFromClipboard } from './clipboard'

/**
 * Pintasan suntingan yang tidak disediakan Tiptap bawaan: tempel teks polos
 * dan bersihkan format. Modul ini hanya memetakan tombol ke operasi papan
 * klip yang sama dengan menu konteks editor.
 */
export const EditShortcuts = Extension.create({
	name: 'editShortcuts',

	addKeyboardShortcuts() {
		return {
			[shortcutKeys('doc.pastePlain')]: () => {
				void pastePlainTextFromClipboard(this.editor)
				return true
			},
			[shortcutKeys('text.clearFormatting')]: () => clearFormatting(this.editor),
		}
	},
})

/**
 * Jaring terakhir untuk Tab dan Shift+Tab: penangan lain (daftar, tabel, blok
 * kode, indentasi, tab stop) diperiksa lebih dulu; yang tidak tertangani tidak
 * boleh jatuh ke navigasi fokus peramban. Fokus yang meloncat ke kontrol lain
 * membuat ketikan berikutnya hilang atau mengubah kontrol itu (OBJ-4).
 */
export const KeepTabInEditor = Extension.create({
	name: 'keepTabInEditor',
	priority: 1,

	addKeyboardShortcuts() {
		return {
			Tab: () => true,
			'Shift-Tab': () => true,
		}
	},
})
