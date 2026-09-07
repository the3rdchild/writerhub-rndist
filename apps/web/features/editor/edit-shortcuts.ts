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
