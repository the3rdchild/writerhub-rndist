import type { JSONContent } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import { FOOTNOTE_REF, footnoteEntries } from '@/features/editor/footnote'

/*
 * Ekspor teks polos (.txt). Rujukan catatan kaki menjadi [n] dengan catatannya
 * di akhir naskah, rumus tetap sebagai LaTeX, dan baris kosong beruntun -
 * misalnya dari sel tabel yang kosong - dirapatkan menjadi satu (SHL-19).
 */

const LEAF_TEXT: Record<string, (node: PMNode) => string> = {
	hardBreak: () => '\n',
	tab: () => '\t',
	mathInline: (node) => `$${node.attrs.latex}$`,
	mathBlock: (node) => `$$${node.attrs.latex}$$`,
}

function inlineText(content: readonly JSONContent[]): string {
	return content.map((part) => (part.type === 'hardBreak' ? '\n' : (part.text ?? ''))).join('')
}

function tidy(text: string): string {
	return text
		.replace(/[ \t]+\n/g, '\n')
		.replace(/\n{3,}/g, '\n\n')
		.trim()
}

export function plainTextOf(doc: PMNode): string {
	let reference = 0
	const body = doc.textBetween(0, doc.content.size, '\n', (leaf) => {
		if (leaf.type.name === FOOTNOTE_REF) {
			reference += 1
			return `[${reference}]`
		}
		return LEAF_TEXT[leaf.type.name]?.(leaf) ?? ''
	})
	const notes = footnoteEntries(doc).map((entry) => `[${entry.number}] ${inlineText(entry.content)}`)
	return tidy(notes.length > 0 ? `${body}\n\n${notes.join('\n')}` : body)
}

/** Beberapa tab dalam satu berkas: tiap tab dibuka judulnya bila lebih dari satu. */
export function plainTextOfTabs(tabs: readonly { title: string; doc: PMNode }[]): string {
	const parts = tabs.map(({ title, doc }) => {
		const text = plainTextOf(doc)
		return tabs.length > 1 ? `${title}\n${'='.repeat(Math.max(3, title.length))}\n\n${text}` : text
	})
	return `${parts.join('\n\n\n').replace(/\n{4,}/g, '\n\n\n')}\n`
}
