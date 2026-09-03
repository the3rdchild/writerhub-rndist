'use client'

import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import { ReactNodeViewRenderer } from '@tiptap/react'
import { common, createLowlight } from 'lowlight'
import { CodeBlockNodeView } from '@/components/editor/code-block-node-view'

const lowlightInstance = createLowlight(common)

export const CODE_LANGUAGES: Array<{ value: string; label: string }> = [
	{ value: 'plaintext', label: 'Teks polos' },
	{ value: 'mermaid', label: 'Diagram Mermaid' },
	{ value: 'javascript', label: 'JavaScript' },
	{ value: 'typescript', label: 'TypeScript' },
	{ value: 'python', label: 'Python' },
	{ value: 'bash', label: 'Bash / Shell' },
	{ value: 'json', label: 'JSON' },
	{ value: 'html', label: 'HTML' },
	{ value: 'css', label: 'CSS' },
	{ value: 'sql', label: 'SQL' },
	{ value: 'yaml', label: 'YAML' },
	{ value: 'markdown', label: 'Markdown' },
	{ value: 'java', label: 'Java' },
	{ value: 'kotlin', label: 'Kotlin' },
	{ value: 'go', label: 'Go' },
	{ value: 'rust', label: 'Rust' },
	{ value: 'c', label: 'C' },
	{ value: 'cpp', label: 'C++' },
	{ value: 'ruby', label: 'Ruby' },
	{ value: 'php', label: 'PHP' },
	{ value: 'swift', label: 'Swift' },
]

export const CodeBlock = CodeBlockLowlight.extend({
	/*
	 * Diagram Mermaid yang sudah jadi disimpan di node-nya sendiri, bukan cuma di
	 * state node view.
	 *
	 * Alasannya sama dengan `snapshot` pada blok HTML: yang membaca hasil render
	 * bukan hanya layar. Ekspor DOCX membaca isi dari dokumen - blok di tab yang
	 * sedang tidak terbuka tidak punya node view sama sekali - dan jalur cetak
	 * tidak bisa menunggu render Mermaid yang asinkron. Disimpan begini,
	 * keduanya menemukan diagramnya sudah ada.
	 *
	 * `rendered: false` menahannya keluar dari HTML dokumen: ia turunan dari
	 * sumbernya, bukan isi. `mermaidSource` menyimpan sumber yang melahirkannya,
	 * satu-satunya cara tahu apakah SVG yang tersimpan masih sesuai kodenya.
	 */
	addAttributes() {
		return {
			...this.parent?.(),
			mermaidSvg: { default: '', rendered: false },
			mermaidSource: { default: '', rendered: false },
		}
	},

	addNodeView() {
		return ReactNodeViewRenderer(CodeBlockNodeView)
	},
}).configure({
	lowlight: lowlightInstance,
	defaultLanguage: 'plaintext',
})
