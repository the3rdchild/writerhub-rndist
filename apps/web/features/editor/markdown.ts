import { latexToMarkdown, looksLikeLatexDocument } from './latex-document'
import { wholeParagraphLatex } from './math'

function escapeHtml(value: string): string {
	return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function escapeAttribute(value: string): string {
	return escapeHtml(value).replace(/"/g, '&quot;')
}
const MATH_PLACEHOLDER = '\u0000math'
function inline(text: string): string {
	const formulas: string[] = []

	const stash = (latex: string, display: boolean): string => {
		const trimmed = latex.trim()
		if (!trimmed) return ''
		const tag = display ? 'div' : 'span'
		formulas.push(`<${tag} data-latex="${escapeAttribute(trimmed)}"></${tag}>`)
		return `${MATH_PLACEHOLDER}${formulas.length - 1}\u0000`
	}
	const guarded = text
		.replace(
			/\\begin\{((?:equation|align|gather|multline)\*?)\}([\s\S]*?)\\end\{\1\}/g,
			(whole, _name, body: string) => stash(body, true) || whole,
		)
		.replace(/\\\[([\s\S]+?)\\\]/g, (whole, body: string) => stash(body, true) || whole)
		.replace(/\\\(([^)\n]*?)\\\)/g, (whole, body: string) => stash(body, false) || whole)
		.replace(/\$\$?([^$\n]+?)\$\$?/g, (whole, latex: string) => {
			const trimmed = latex.trim()
			if (!trimmed || /^\s|\s$/.test(latex)) return whole
			return stash(trimmed, whole.startsWith('$$')) || whole
		})

	const rendered = escapeHtml(guarded)
		.replace(/`([^`]+)`/g, '<code>$1</code>')
		.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
		.replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>')
		.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2">$1</a>')

	return rendered.replace(
		new RegExp(`${MATH_PLACEHOLDER}(\\d+)\\u0000`, 'g'),
		(_whole, index: string) => formulas[Number(index)] ?? '',
	)
}
function tableCells(line: string): string[] {
	return line
		.replace(/^\s*\|/, '')
		.replace(/\|\s*$/, '')
		.split('|')
		.map((cell) => cell.trim())
}

const TABLE_DIVIDER = /^\s*\|?[\s:-]*-[\s|:-]*\|?\s*$/

function isTableRow(line: string): boolean {
	return line.trim().startsWith('|') && line.includes('|', 1)
}
export function looksLikeMarkdown(text: string): boolean {
	return (
		/^\s*(#{1,6}\s|[-*]\s|\d+\.\s|>\s|\|.*\|)/m.test(text) ||
		/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/m.test(text) ||
		/\*\*[^*\n]+\*\*|`[^`\n]+`/.test(text) ||
		/```/.test(text) ||
		/\$\$?[^\s$][^$\n]*[^\s$]\$\$?|\$[^\s$]\$/.test(text) ||
		/\\\[[\s\S]*?\\\]|\\\([^)\n]*?\\\)|\\begin\{(?:equation|align|gather|multline)\*?\}/.test(text)
	)
}

export function markdownToHtml(markdown: string): string {
	const lines = markdown.replace(/\r\n/g, '\n').split('\n')
	const out: string[] = []
	let index = 0

	while (index < lines.length) {
		const line = lines[index]
		const trimmed = line.trim()

		if (!trimmed) {
			index += 1
			continue
		}
		if (trimmed.startsWith('```')) {
			const body: string[] = []
			index += 1
			while (index < lines.length && !lines[index].trim().startsWith('```')) {
				body.push(lines[index])
				index += 1
			}
			index += 1 // pagar penutup
			out.push(`<pre><code>${escapeHtml(body.join('\n'))}</code></pre>`)
			continue
		}
		if (isTableRow(line) && index + 1 < lines.length && TABLE_DIVIDER.test(lines[index + 1])) {
			const header = tableCells(line)
			index += 2

			const rows: string[][] = []
			while (index < lines.length && isTableRow(lines[index])) {
				rows.push(tableCells(lines[index]))
				index += 1
			}

			const head = header.map((cell) => `<th>${inline(cell)}</th>`).join('')
			const body = rows
				.map((row) => {
					const cells = Array.from({ length: header.length }, (_, column) => row[column] ?? '')
					return `<tr>${cells.map((cell) => `<td>${inline(cell)}</td>`).join('')}</tr>`
				})
				.join('')

			out.push(`<table><tbody><tr>${head}</tr>${body}</tbody></table>`)
			continue
		}
		if (/^(?:-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
			out.push('<hr>')
			index += 1
			continue
		}
		const blockLatex = wholeParagraphLatex(trimmed)
		if (blockLatex) {
			out.push(`<div data-latex="${escapeAttribute(blockLatex)}"></div>`)
			index += 1
			continue
		}
		const heading = trimmed.match(/^(#{1,6})\s+(.*)$/)
		if (heading) {
			const level = heading[1].length
			out.push(`<h${level}>${inline(heading[2])}</h${level}>`)
			index += 1
			continue
		}
		const bullet = trimmed.match(/^[-*]\s+(.*)$/)
		const ordered = trimmed.match(/^\d+\.\s+(.*)$/)
		if (bullet || ordered) {
			const tag = bullet ? 'ul' : 'ol'
			const pattern = bullet ? /^[-*]\s+(.*)$/ : /^\d+\.\s+(.*)$/
			const items: string[] = []

			while (index < lines.length) {
				const match = lines[index].trim().match(pattern)
				if (!match) break
				items.push(`<li><p>${inline(match[1])}</p></li>`)
				index += 1
			}

			out.push(`<${tag}>${items.join('')}</${tag}>`)
			continue
		}
		if (trimmed.startsWith('>')) {
			const quoted: string[] = []
			while (index < lines.length && lines[index].trim().startsWith('>')) {
				quoted.push(lines[index].trim().replace(/^>\s?/, ''))
				index += 1
			}
			out.push(`<blockquote><p>${inline(quoted.join(' '))}</p></blockquote>`)
			continue
		}
		const paragraph: string[] = [trimmed]
		index += 1
		while (index < lines.length) {
			const current = lines[index].trim()
			if (
				!current ||
				isTableRow(lines[index]) ||
				/^(#{1,6}\s|[-*]\s|\d+\.\s|>|```)/.test(current) ||
				/^(?:-{3,}|\*{3,}|_{3,})$/.test(current)
			) {
				break
			}
			paragraph.push(current)
			index += 1
		}

		out.push(`<p>${inline(paragraph.join(' '))}</p>`)
	}

	return out.join('')
}
export function toEditorContent(text: string): string {
	const source = looksLikeLatexDocument(text) ? latexToMarkdown(text) : text
	return looksLikeMarkdown(source) ? markdownToHtml(source) : source
}
