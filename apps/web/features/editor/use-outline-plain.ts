import type { Node as PMNode } from '@tiptap/pm/model'

export interface OutlineItem {
	pos: number
	level: number
	text: string
	kind: 'heading' | 'caption'
}

export function readOutlineItems(doc: PMNode): OutlineItem[] {
	const items: OutlineItem[] = []

	doc.descendants((node, pos) => {
		if (node.type.name === 'heading') {
			const level = (node.attrs.level as number) ?? 1
			items.push({
				pos,
				level,
				text: node.textContent.trim(),
				kind: level >= 7 ? 'caption' : 'heading',
			})
			return false
		}
		return true
	})

	return items
}
