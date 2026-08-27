import type { GlossaryEntry } from '@writer-hub/shared'
import type { JSONContent } from '@tiptap/core'
import { PAGE_BREAK_NODE } from '@/features/editor/page-break'
export const GLOSSARY_HEADING = 'Glossary'

const cell = (text: string, header = false): JSONContent => ({
	type: header ? 'tableHeader' : 'tableCell',
	content: [text ? { type: 'paragraph', content: [{ type: 'text', text }] } : { type: 'paragraph' }],
})
export function glossaryTermLabel(entry: GlossaryEntry): string {
	const expansion = entry.expansion?.trim()
	return expansion ? `${entry.term} (${expansion})` : entry.term
}
export function buildGlossarySection(entries: readonly GlossaryEntry[]): JSONContent[] {
	return [
		{ type: PAGE_BREAK_NODE },
		{ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: GLOSSARY_HEADING }] },
		{
			type: 'table',
			content: [
				{ type: 'tableRow', content: [cell('Term', true), cell('Definition', true)] },
				...entries.map((entry) => ({
					type: 'tableRow',
					content: [cell(glossaryTermLabel(entry)), cell(entry.definition)],
				})),
			],
		},
	]
}
export function findGlossarySection(doc: {
	childCount: number
	child: (index: number) => { type: { name: string }; textContent: string; nodeSize: number }
	content: { size: number }
}): { from: number; to: number } | null {
	let pos = 0

	for (let i = 0; i < doc.childCount; i++) {
		const node = doc.child(i)
		const isHeading = node.type.name === 'heading'
		const matches = node.textContent.trim() === GLOSSARY_HEADING

		if (isHeading && matches && i + 1 < doc.childCount) {
			const next = doc.child(i + 1)
			if (next.type.name === 'table') {
				const previous = i > 0 ? doc.child(i - 1) : null
				const from = previous?.type.name === PAGE_BREAK_NODE ? pos - previous.nodeSize : pos
				return { from, to: pos + node.nodeSize + next.nodeSize }
			}
		}

		pos += node.nodeSize
	}

	return null
}
