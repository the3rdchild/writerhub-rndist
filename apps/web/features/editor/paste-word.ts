import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'

/**
 * HTML tempelan Microsoft Word dirapikan sebelum diurai ProseMirror.
 *
 * Word tidak menulis daftar sebagai `<ul>/<ol>`: setiap butir adalah
 * `<p style="mso-list:l0 level2 lfo1">` dengan penanda ("·", "o", "1.")
 * sebagai teks biasa di dalam `<span style="mso-list:Ignore">`, ditambah
 * indentasi negatif. Tanpa penanganan, butir menjadi paragraf berisi simbol
 * mentah yang terpotong di tepi kiri, dan `MsoTitle` menjadi paragraf biasa
 * (uji editor 2 Okt, TKS-13).
 */

const WORD_HTML = /urn:schemas-microsoft-com:office|class="?Mso|mso-list/i
/** Penanda butir bernomor: 1. 1) a. a) iv. (A) … */
const ORDERED_MARKER = /^\(?(?:\d{1,3}|[a-z]|[ivxlcdm]{1,6})[.)]$/i

interface ListParagraph {
	element: HTMLElement
	level: number
	ordered: boolean
}

function listInfo(paragraph: HTMLElement): ListParagraph | null {
	const style = paragraph.getAttribute('style') ?? ''
	const match = style.match(/mso-list:\s*l\d+\s+level(\d+)/i)
	if (!match) return null

	const markers = [...paragraph.querySelectorAll<HTMLElement>('span')].filter((span) =>
		/mso-list:\s*Ignore/i.test(span.getAttribute('style') ?? ''),
	)
	const markerText = markers
		.map((span) => span.textContent ?? '')
		.join('')
		.replace(/ /g, ' ')
		.trim()
	for (const marker of markers) marker.remove()

	return { element: paragraph, level: Number(match[1]) || 1, ordered: ORDERED_MARKER.test(markerText) }
}

function itemContent(paragraph: HTMLElement): HTMLElement {
	const body = paragraph.ownerDocument.createElement('p')
	body.innerHTML = paragraph.innerHTML
	return body
}

/** Butir berurutan (saudara langsung) menjadi daftar bersarang menurut levelnya. */
function buildList(document: Document, items: ListParagraph[]): HTMLElement {
	const root = document.createElement(items[0].ordered ? 'ol' : 'ul')
	const stack: Array<{ level: number; list: HTMLElement; last: HTMLElement | null }> = [
		{ level: items[0].level, list: root, last: null },
	]
	for (const item of items) {
		while (stack.length > 1 && item.level < stack[stack.length - 1].level) stack.pop()
		let top = stack[stack.length - 1]
		if (item.level > top.level && top.last) {
			const nested = document.createElement(item.ordered ? 'ol' : 'ul')
			top.last.appendChild(nested)
			top = { level: item.level, list: nested, last: null }
			stack.push(top)
		}
		const li = document.createElement('li')
		li.appendChild(itemContent(item.element))
		top.list.appendChild(li)
		top.last = li
	}
	return root
}

export function normalizeWordHtml(html: string): string {
	if (!WORD_HTML.test(html) || typeof DOMParser === 'undefined') return html
	const document = new DOMParser().parseFromString(html, 'text/html')

	for (const title of document.querySelectorAll<HTMLElement>('p.MsoTitle')) {
		const heading = document.createElement('h1')
		heading.innerHTML = title.innerHTML
		title.replaceWith(heading)
	}

	const paragraphs = [...document.body.querySelectorAll<HTMLElement>('p')]
	const handled = new Set<HTMLElement>()
	for (const paragraph of paragraphs) {
		if (handled.has(paragraph)) continue
		const first = listInfo(paragraph)
		if (!first) continue

		const group: ListParagraph[] = [first]
		handled.add(paragraph)
		let next = paragraph.nextElementSibling as HTMLElement | null
		while (next && next.tagName === 'P') {
			const info = listInfo(next)
			if (!info) break
			group.push(info)
			handled.add(next)
			next = next.nextElementSibling as HTMLElement | null
		}

		const list = buildList(document, group)
		paragraph.before(list)
		for (const item of group) item.element.remove()
	}

	return document.body.innerHTML
}

export const PasteWord = Extension.create({
	name: 'pasteWord',

	addProseMirrorPlugins() {
		return [
			new Plugin({
				key: new PluginKey('pasteWord'),
				props: {
					transformPastedHTML: (html) => normalizeWordHtml(html),
				},
			}),
		]
	},
})
