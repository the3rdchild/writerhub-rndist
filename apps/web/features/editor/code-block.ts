'use client'

import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import { ReactNodeViewRenderer } from '@tiptap/react'
import { common, createLowlight } from 'lowlight'
import { CodeBlockNodeView } from '@/components/editor/code-block-node-view'

/**
 * Blok kode dengan pewarnaan sintaks (lowlight / highlight.js).
 *
 * Lowlight v3 dibangun dengan paket tata bahasa `common` - himpunan bahasa yang
 * sering dipakai - alih-alih mendaftar tiap bahasa satu per satu, supaya
 * ukuran bundel tetap masuk akal untuk editor dokumen (bukan editor kode).
 *
 * Node view khusus (`CodeBlockNodeView`) menambahkan pemilih bahasa, tombol
 * salin, dan toggle sumber/pratinjau untuk diagram Mermaid (render SVG
 * real-time lewat `lazy-mermaid`).
 */

const lowlightInstance = createLowlight(common)

/**
 * Daftar bahasa untuk pemilih di node view dan slash command.
 */
export const CODE_LANGUAGES: Array<{ value: string; label: string }> = [
	{ value: 'plaintext', label: 'Teks polos' },
	// Mermaid tidak punya tata bahasa di lowlight (jatuh ke highlightAuto), tapi
	// harus ada di daftar supaya pemilih bahasa dan pratinjau diagram cocok.
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

/** Ekstensi siap pakai; StarterKit harus mematikan codeBlock bawaannya. */
export const CodeBlock = CodeBlockLowlight.extend({
	addNodeView() {
		return ReactNodeViewRenderer(CodeBlockNodeView)
	},
}).configure({
	lowlight: lowlightInstance,
	defaultLanguage: 'plaintext',
})
