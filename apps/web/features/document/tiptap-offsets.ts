import type { Node as PMNode } from '@tiptap/pm/model'

interface Segment {
	textStart: number
	pmStart: number
	length: number
}

export interface TextIndex {
	text: string
	segments: Segment[]
}

export function buildTextIndex(doc: PMNode): TextIndex {
	const segments: Segment[] = []
	let text = ''

	doc.descendants((node, pos) => {
		if (!node.isTextblock) return true

		if (text.length > 0) text += '\n'

		node.forEach((child, childOffset) => {
			if (!child.isText || !child.text) return
			segments.push({
				textStart: text.length,
				pmStart: pos + 1 + childOffset,
				length: child.text.length,
			})
			text += child.text
		})

		return false // inline di dalamnya sudah ditangani
	})

	return { text, segments }
}

export function textPosToPM({ segments }: TextIndex, textPos: number): number | null {
	for (const segment of segments) {
		const end = segment.textStart + segment.length
		if (textPos >= segment.textStart && textPos <= end) {
			return segment.pmStart + (textPos - segment.textStart)
		}
	}
	return null
}

function pmPosToText({ segments }: TextIndex, pmPos: number): number | null {
	for (const segment of segments) {
		const end = segment.pmStart + segment.length
		if (pmPos >= segment.pmStart && pmPos <= end) {
			return segment.textStart + (pmPos - segment.pmStart)
		}
	}
	return null
}

export function pmRangeToText(
	index: TextIndex,
	from: number,
	to: number,
): { offset: number; length: number } | null {
	const start = pmPosToText(index, from)
	const end = pmPosToText(index, to)
	if (start === null || end === null || end <= start) return null
	return { offset: start, length: end - start }
}

export function textRangeToPM(
	index: TextIndex,
	offset: number,
	length: number,
): { from: number; to: number } | null {
	const from = textPosToPM(index, offset)
	const to = textPosToPM(index, offset + length)
	if (from === null || to === null || to <= from) return null
	return { from, to }
}
