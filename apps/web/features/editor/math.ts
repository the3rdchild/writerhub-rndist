import { mergeAttributes, Node } from '@tiptap/core'
import type { Node as PMNode, ResolvedPos } from '@tiptap/pm/model'
import type { Editor } from '@tiptap/react'
import katex from 'katex'
import { applyMathFit } from './math-fit'
export const MATH_INLINE = 'mathInline'
export const MATH_BLOCK = 'mathBlock'

declare module '@tiptap/core' {
	interface Commands<ReturnType> {
		math: {
			setMath: (latex: string, display?: boolean) => ReturnType
			unsetMath: () => ReturnType
		}
	}
}

export function renderMath(latex: string, display: boolean): string {
	try {
		return katex.renderToString(latex, {
			displayMode: display,
			throwOnError: false,
			output: 'html',
			strict: false,
		})
	} catch (error) {
		return `<span class="math-error">${latex}</span>`
	}
}

function buildDom(latex: string, display: boolean, fontSize: unknown = null): HTMLElement {
	const element = document.createElement(display ? 'div' : 'span')
	element.className = display ? 'math-block' : 'math-inline'
	element.setAttribute('data-latex', latex)
	const size = fontSizeStyle(fontSize)
	if (size) element.style.fontSize = size
	element.contentEditable = 'false'
	element.innerHTML = renderMath(latex, display)
	return element
}

/** `fontSize` (pt) → nilai CSS; null bila rumus ikut ukuran teks sekitarnya. */
function fontSizeStyle(fontSize: unknown): string | null {
	return typeof fontSize === 'number' && fontSize > 0 ? `${fontSize}pt` : null
}

const latexAttribute = {
	latex: {
		default: '',
		parseHTML: (element: HTMLElement) => element.getAttribute('data-latex') ?? '',
		renderHTML: (attributes: Record<string, unknown>) => ({ 'data-latex': attributes.latex }),
	},
	/*
	 * Ukuran huruf rumus (pt) bila naskahnya menyebut sendiri - rumus dari DOCX
	 * membawa `w:sz` run-nya. Null: ikut ukuran teks di sekitarnya.
	 */
	fontSize: {
		default: null,
		parseHTML: (element: HTMLElement) => {
			const value = Number.parseFloat(element.getAttribute('data-font-size') ?? '')
			return Number.isFinite(value) && value > 0 ? value : null
		},
		renderHTML: (attributes: Record<string, unknown>) => {
			const size = fontSizeStyle(attributes.fontSize)
			return size ? { 'data-font-size': attributes.fontSize, style: `font-size: ${size}` } : {}
		},
	},
}

export const MathInline = Node.create({
	name: MATH_INLINE,
	group: 'inline',
	inline: true,
	atom: true,
	selectable: true,

	addAttributes: () => latexAttribute,

	parseHTML() {
		return [{ tag: 'span[data-latex]' }]
	},

	renderHTML({ HTMLAttributes }) {
		return ['span', mergeAttributes(HTMLAttributes, { class: 'math-inline' })]
	},

	addNodeView() {
		return ({ node }) => ({ dom: buildDom(node.attrs.latex, false, node.attrs.fontSize) })
	},
})

export const MathBlock = Node.create({
	name: MATH_BLOCK,
	group: 'block',
	atom: true,
	selectable: true,

	addAttributes: () => latexAttribute,

	parseHTML() {
		return [{ tag: 'div[data-latex]' }]
	},

	renderHTML({ HTMLAttributes }) {
		return ['div', mergeAttributes(HTMLAttributes, { class: 'math-block' })]
	},

	/*
	 * Rumus blok dibuat muat di lebar bloknya (kolom, halaman) dan dihitung
	 * ulang setiap lebar itu berubah - lihat `math-fit.ts`. Perubahan DOM di
	 * dalamnya diabaikan ProseMirror karena node view ini tidak punya contentDOM.
	 */
	addNodeView() {
		return ({ node }) => {
			const latex: string = node.attrs.latex
			const dom = buildDom(latex, true, node.attrs.fontSize)
			let fittedWidth = -1
			const fit = () => {
				const width = dom.clientWidth
				if (width <= 0 || width === fittedWidth) return
				fittedWidth = width
				applyMathFit(dom, latex, renderMath)
			}
			const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(fit)
			observer?.observe(dom)
			/* Fon KaTeX dimuat belakangan: ukuran pertama memakai fon cadangan yang
			 * lebih sempit, dan lebar bloknya tidak berubah saat fon tiba. */
			const refit = () => {
				fittedWidth = -1
				fit()
			}
			const fonts = typeof document === 'undefined' ? undefined : document.fonts
			fonts?.addEventListener('loadingdone', refit)
			void fonts?.ready.then(refit)
			return {
				dom,
				destroy: () => {
					observer?.disconnect()
					fonts?.removeEventListener('loadingdone', refit)
				},
			}
		}
	},

	addCommands() {
		return {
			setMath:
				(latex, display = false) =>
				({ chain }) =>
					chain()
						.focus()
						.insertContent({
							type: display ? MATH_BLOCK : MATH_INLINE,
							attrs: { latex: latex.trim() },
						})
						.run(),

			unsetMath:
				() =>
				({ state, chain }) => {
					const node = state.selection.$from.nodeAfter ?? state.selection.$from.parent
					if (node.type.name !== MATH_INLINE && node.type.name !== MATH_BLOCK) return false

					const { from } = state.selection
					return chain()
						.focus()
						.insertContentAt({ from, to: from + node.nodeSize }, node.attrs.latex)
						.run()
				},
		}
	},
})

interface MathPattern {
	pattern: RegExp
	display: boolean
	latexGroup: number
}

const MATH_PATTERNS: readonly MathPattern[] = [
	{ pattern: /\$\$([^$]+?)\$\$/g, display: true, latexGroup: 1 },
	{ pattern: /\\\[([\s\S]+?)\\\]/g, display: true, latexGroup: 1 },
	{
		pattern: /\\begin\{((?:equation|align|gather|multline)\*?)\}([\s\S]*?)\\end\{\1\}/g,
		display: true,
		latexGroup: 2,
	},
	{ pattern: /(?<!\$)\$(?!\s)([^$\n]*?)(?<!\s)\$(?!\$)/g, display: false, latexGroup: 1 },
	{ pattern: /\\\(([^)\n]*?)\\\)/g, display: false, latexGroup: 1 },
]

export interface FoundMath {
	latex: string
	display: boolean
	from: number
	to: number
}

export function findMath(text: string): FoundMath[] {
	const found: FoundMath[] = []

	for (const { pattern, display, latexGroup } of MATH_PATTERNS) {
		pattern.lastIndex = 0
		let match = pattern.exec(text)
		while (match !== null) {
			const latex = (match[latexGroup] ?? '').trim()
			const overlaps = found.some(
				(item) => match!.index < item.to && match!.index + match![0].length > item.from,
			)
			if (latex && !overlaps) {
				found.push({ latex, display, from: match.index, to: match.index + match[0].length })
			}
			match = pattern.exec(text)
		}
	}

	return found.sort((a, b) => a.from - b.from)
}

export function wholeParagraphLatex(text: string): string | null {
	const trimmed = text.trim()

	const dollar = trimmed.match(/^\$\$([\s\S]+)\$\$$/)
	if (dollar?.[1].trim()) return dollar[1].trim()

	const bracket = trimmed.match(/^\\\[([\s\S]+?)\\\]$/)
	if (bracket?.[1].trim()) return bracket[1].trim()

	const env = trimmed.match(/^\\begin\{((?:equation|align|gather|multline)\*?)\}([\s\S]*?)\\end\{\1\}$/)
	if (env?.[2].trim()) return env[2].trim()

	return null
}

export function looksLikeBareLatex(text: string): boolean {
	const trimmed = text.trim()
	if (!trimmed || trimmed.includes('$')) return false
	return /\\[a-zA-Z]+|[\^_]\{?[^\s]/.test(trimmed)
}

export function stripDelimiters(text: string): string {
	return text
		.trim()
		.replace(/^(?:\$\$?|\\\[|\\\()/, '')
		.replace(/(?:\$\$?$|\\\]|\\\))$/, '')
		.trim()
}

const OPEN_EVENT = 'writer-hub:open-math-editor'

export interface MathEditorRequest {
	editor: Editor
	display: boolean
}

export function onMathEditorRequest(listener: (request: MathEditorRequest) => void): () => void {
	const handler = (event: Event) => listener((event as CustomEvent<MathEditorRequest>).detail)
	window.addEventListener(OPEN_EVENT, handler)
	return () => window.removeEventListener(OPEN_EVENT, handler)
}

/**
 * Sisip rumus: teks terpilih langsung dijadikan rumus (perilaku lama); tanpa
 * seleksi, editor rumus kosong dibuka di kursor dan rumusnya baru disisip saat
 * disimpan. Dulu tidak ada jalan menyisip rumus baru (uji editor 2 Okt, OBJ-22).
 */
export function insertOrConvertMath(editor: Editor, display: boolean): boolean {
	if (!editor.state.selection.empty) return convertSelectionToMath(editor, display)
	window.dispatchEvent(new CustomEvent<MathEditorRequest>(OPEN_EVENT, { detail: { editor, display } }))
	return true
}

export function convertSelectionToMath(editor: Editor, display: boolean): boolean {
	const { from, to, empty } = editor.state.selection
	if (empty) return false

	const latex = stripDelimiters(editor.state.doc.textBetween(from, to, ' ', ' '))
	if (!latex) return false

	return editor.chain().focus().deleteSelection().setMath(latex, display).run()
}

export function convertMathInDocument(editor: Editor): number {
	const { state } = editor
	const inlineType = state.schema.nodes[MATH_INLINE]
	const blockType = state.schema.nodes[MATH_BLOCK]
	if (!inlineType || !blockType) return 0

	const edits: Array<{ from: number; to: number; node: PMNode }> = []

	state.doc.descendants((node, pos) => {
		if (!node.isTextblock) return true

		const whole = wholeParagraphLatex(node.textContent)
		if (whole) {
			edits.push({
				from: pos,
				to: pos + node.nodeSize,
				node: blockType.create({ latex: whole }),
			})
			return false
		}

		node.forEach((child, offset) => {
			if (!child.isText || !child.text) return
			const base = pos + 1 + offset

			for (const found of findMath(child.text)) {
				edits.push({
					from: base + found.from,
					to: base + found.to,
					node: inlineType.create({ latex: found.latex }),
				})
			}
		})

		return false
	})

	if (edits.length === 0) return 0

	const transaction = state.tr
	for (const edit of edits.sort((a, b) => b.from - a.from)) {
		transaction.replaceWith(edit.from, edit.to, edit.node)
	}
	editor.view.dispatch(transaction)

	return edits.length
}

export function mathAtSelection(editor: Editor): { latex: string; display: boolean } | null {
	const { $from, node } = editor.state.selection as { $from: ResolvedPos; node?: PMNode }
	const candidate = node ?? $from.nodeAfter ?? $from.nodeBefore

	if (candidate?.type.name === MATH_INLINE) return { latex: candidate.attrs.latex, display: false }
	if (candidate?.type.name === MATH_BLOCK) return { latex: candidate.attrs.latex, display: true }
	return null
}
