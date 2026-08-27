import { mergeAttributes, Node } from '@tiptap/core'
import type { Node as PMNode, ResolvedPos } from '@tiptap/pm/model'
import type { Editor } from '@tiptap/react'
import katex from 'katex'
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

function buildDom(latex: string, display: boolean): HTMLElement {
	const element = document.createElement(display ? 'div' : 'span')
	element.className = display ? 'math-block' : 'math-inline'
	element.setAttribute('data-latex', latex)
	element.contentEditable = 'false'
	element.innerHTML = renderMath(latex, display)
	return element
}

const latexAttribute = {
	latex: {
		default: '',
		parseHTML: (element: HTMLElement) => element.getAttribute('data-latex') ?? '',
		renderHTML: (attributes: Record<string, unknown>) => ({ 'data-latex': attributes.latex }),
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
		return ({ node }) => ({ dom: buildDom(node.attrs.latex, false) })
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

	addNodeView() {
		return ({ node }) => ({ dom: buildDom(node.attrs.latex, true) })
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
