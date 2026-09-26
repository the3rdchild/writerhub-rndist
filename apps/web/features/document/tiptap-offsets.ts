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

/*
 * Pindah baris lunak, gambar, dan rumus inline tidak punya karakter di teks
 * indeks, jadi posisi teks tepat di antara dua segmen menunjuk dua tempat:
 * akhir segmen kiri (sebelum node itu) dan awal segmen kanan (sesudahnya).
 * Awal sebuah rentang selalu yang kanan - kalau tidak, rentang "Struktur
 * pasar" sesudah Shift+Enter ikut menelan pindah barisnya, dan penggantian
 * teks menghapusnya.
 */
function rangeStartToPM({ segments }: TextIndex, textPos: number): number | null {
	for (const segment of segments) {
		if (textPos >= segment.textStart && textPos < segment.textStart + segment.length) {
			return segment.pmStart + (textPos - segment.textStart)
		}
	}
	return null
}

export function textRangeToPM(
	index: TextIndex,
	offset: number,
	length: number,
): { from: number; to: number } | null {
	const from = (length > 0 ? rangeStartToPM(index, offset) : null) ?? textPosToPM(index, offset)
	const to = textPosToPM(index, offset + length)
	if (from === null || to === null || to <= from) return null
	return { from, to }
}
