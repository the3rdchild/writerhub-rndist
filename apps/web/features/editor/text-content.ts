import type { Editor } from '@tiptap/react'
export function editorPlainText(editor: Editor): string {
	return editor.getText({ blockSeparator: '\n' })
}

function escapeHtml(value: string): string {
	return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
export function textToParagraphs(text: string): string {
	if (!text) return '<p></p>'
	return text
		.split('\n')
		.map((line) => `<p>${line ? escapeHtml(line) : '<br>'}</p>`)
		.join('')
}
