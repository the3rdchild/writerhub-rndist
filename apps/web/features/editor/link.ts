'use client'

import type { Editor } from '@tiptap/react'

/**
 * Satu alur untuk memasang tautan, dipakai tombol toolbar maupun pintasan
 * Ctrl+K. Dipisah ke sini supaya keduanya tidak pernah berperilaku berbeda.
 *
 * `extendMarkRange` membuat kursor yang sekadar berada di dalam tautan sudah
 * cukup - pengguna tidak perlu menyeleksi seluruh tautannya lebih dulu.
 */
export function promptForLink(editor: Editor): void {
	const previous = editor.getAttributes('link').href as string | undefined
	const url = window.prompt('Masukkan URL:', previous ?? '')
	if (url === null) return

	if (url === '') {
		editor.chain().focus().extendMarkRange('link').unsetLink().run()
		return
	}
	editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
}
