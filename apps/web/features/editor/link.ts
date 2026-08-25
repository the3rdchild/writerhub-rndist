'use client'

import type { Editor } from '@tiptap/react'
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
