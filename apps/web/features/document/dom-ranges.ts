import type { TextRange } from '@writer-hub/shared'
import type { EditorSuggestion } from './suggestions'

/**
 * Pemetaan antara offset karakter pada teks polos dan node DOM di dalam
 * contenteditable. Dipisah dari komponen supaya logika yang rawan ini bisa
 * dibaca dan diubah tanpa menyentuh render.
 */

const ESCAPE_MAP: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;' }

export function escapeHtml(value: string): string {
	return value.replace(/[&<>]/g, (char) => ESCAPE_MAP[char] ?? char)
}

/** Ubah teks polos jadi HTML yang aman, dengan baris baru sebagai <br>. */
export function textToHtml(text: string): string {
	return escapeHtml(text).replace(/\n/g, '<br>')
}

const CATEGORY_CLASS: Record<string, string> = {
	grammar: 'decoration-red-400 text-red-400',
	spelling: 'decoration-orange-400 text-orange-400',
	style: 'decoration-yellow-300 text-yellow-300',
}

const HIGHLIGHT_BASE =
	'suggestion-mark cursor-pointer underline decoration-wavy underline-offset-2'

/**
 * Render teks beserta penanda suggestion.
 * Suggestion yang rentangnya bertabrakan dilewati — satu karakter tidak boleh
 * masuk dua span, karena itu akan merusak pemetaan offset.
 */
export function buildHighlightedHtml(text: string, suggestions: readonly EditorSuggestion[]): string {
	const spans: Array<{ start: number; end: number; category: string; id: string }> = []

	for (const suggestion of suggestions) {
		if (suggestion.dismissed) continue

		const start = suggestion.offset ?? text.indexOf(suggestion.original)
		if (start < 0) continue

		const end = start + (suggestion.length ?? suggestion.original.length)
		if (spans.some((span) => span.start < end && span.end > start)) continue

		spans.push({ start, end, category: suggestion.category, id: suggestion.id })
	}

	spans.sort((a, b) => a.start - b.start)

	let html = ''
	let cursor = 0
	for (const { start, end, category, id } of spans) {
		html += escapeHtml(text.slice(cursor, start))
		const className = `${HIGHLIGHT_BASE} ${CATEGORY_CLASS[category] ?? ''}`
		html += `<span data-suggestion-id="${id}" class="${className}">${escapeHtml(text.slice(start, end))}</span>`
		cursor = end
	}
	html += escapeHtml(text.slice(cursor))

	return html.replace(/\n/g, '<br>')
}

interface TextNodePosition {
	node: Text
	start: number
}

/**
 * Kumpulkan node teks beserta offset awalnya.
 * Setiap <br> dihitung satu karakter agar sejalan dengan '\n' pada teks polos.
 */
export function collectTextNodes(root: HTMLElement): TextNodePosition[] {
	const positions: TextNodePosition[] = []
	const walker = document.createTreeWalker(root, NodeFilter.SHOW_ALL)
	let offset = 0

	for (let node = walker.nextNode(); node; node = walker.nextNode()) {
		if (node.nodeType === Node.TEXT_NODE) {
			const textNode = node as Text
			positions.push({ node: textNode, start: offset })
			offset += textNode.length
		} else if ((node as Element).tagName === 'BR') {
			offset += 1
		}
	}

	return positions
}

/** Bangun Range DOM dari rentang offset karakter; null kalau di luar jangkauan. */
export function rangeFromOffsets(root: HTMLElement, { offset, length }: TextRange): Range | null {
	const positions = collectTextNodes(root)
	const end = offset + length

	let startNode: Text | null = null
	let startOffset = 0
	let endNode: Text | null = null
	let endOffset = 0

	for (const { node, start } of positions) {
		const nodeEnd = start + node.length
		if (!startNode && offset >= start && offset < nodeEnd) {
			startNode = node
			startOffset = offset - start
		}
		if (!endNode && end > start && end <= nodeEnd) {
			endNode = node
			endOffset = end - start
		}
		if (startNode && endNode) break
	}

	if (!startNode) return null

	const range = document.createRange()
	range.setStart(startNode, startOffset)
	if (endNode) range.setEnd(endNode, endOffset)
	else range.setEnd(startNode, Math.min(startOffset + 1, startNode.length))

	return range
}

export interface OverlayRect {
	top: number
	left: number
	width: number
	height: number
}

/**
 * Gabungkan rect per baris.
 * `Range.getClientRects()` bisa mengembalikan rect bertumpuk (node teks dan
 * span highlight di dalamnya); tanpa penggabungan, overlay tampak dobel.
 */
export function mergeLineRects(rects: readonly DOMRect[]): OverlayRect[] {
	const lines: Array<{ top: number; bottom: number; left: number; right: number }> = []

	for (const rect of rects) {
		if (rect.width <= 0 || rect.height <= 0) continue

		const line = lines.find((candidate) => Math.abs(candidate.top - rect.top) < rect.height / 2)
		if (line) {
			line.left = Math.min(line.left, rect.left)
			line.right = Math.max(line.right, rect.right)
			line.top = Math.min(line.top, rect.top)
			line.bottom = Math.max(line.bottom, rect.bottom)
		} else {
			lines.push({ top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right })
		}
	}

	return lines.map((line) => ({
		top: line.top,
		left: line.left,
		width: line.right - line.left,
		height: line.bottom - line.top,
	}))
}
