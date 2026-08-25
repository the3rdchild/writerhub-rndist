export function looksLikeLatexDocument(text: string): boolean {
	return /\\documentclass|\\begin\{document\}|\\begin\{tabular\}|\\section\{/.test(text)
}
const NOISE = /\\(?:hline|centering|maketitle|newpage|clearpage|noindent|small|large|bigskip|medskip|smallskip)\b/g
function unwrap(text: string): string {
	return text
		.replace(/\\textbf\{([^{}]*)\}/g, '**$1**')
		.replace(/\\(?:textit|emph)\{([^{}]*)\}/g, '*$1*')
		.replace(/\\texttt\{([^{}]*)\}/g, '`$1`')
		.replace(/\\underline\{([^{}]*)\}/g, '$1')
		.replace(/\\multicolumn\{\d+\}\{[^{}]*\}\{([^{}]*)\}/g, '$1')
		.replace(/\\([%&$#_{}])/g, '$1')
		.replace(/(\d)--(\d)/g, '$1–$2')
		.replace(NOISE, '')
		.trim()
}
function tabularToMarkdown(body: string): string {
	const rows = body
		.split('\\\\')
		.map((row) => unwrap(row).trim())
		.filter(Boolean)
		.map((row) => row.split('&').map((cell) => unwrap(cell)))

	if (rows.length === 0) return ''

	const width = Math.max(...rows.map((row) => row.length))
	const pad = (row: string[]) => Array.from({ length: width }, (_, i) => row[i] ?? '')

	const [header, ...rest] = rows
	const lines = [
		`| ${pad(header).join(' | ')} |`,
		`|${' --- |'.repeat(width)}`,
		...rest.map((row) => `| ${pad(row).join(' | ')} |`),
	]

	return lines.join('\n')
}
function listToMarkdown(body: string, ordered: boolean): string {
	const items = body
		.split('\\item')
		.map((item) => unwrap(item).trim())
		.filter(Boolean)

	return items.map((item, index) => (ordered ? `${index + 1}. ${item}` : `- ${item}`)).join('\n')
}

export function latexToMarkdown(source: string): string {
	const start = source.indexOf('\\begin{document}')
	let text = start === -1 ? source : source.slice(start + '\\begin{document}'.length)
	text = text.replace(/\\end\{document\}[\s\S]*$/, '')
	text = text.replace(/\\begin\{table\}(?:\[[^\]]*\])?([\s\S]*?)\\end\{table\}/g, '$1')
	text = text.replace(/\\begin\{figure\}(?:\[[^\]]*\])?([\s\S]*?)\\end\{figure\}/g, '$1')

	text = text.replace(
		/\\begin\{tabular\}\{[^{}]*\}([\s\S]*?)\\end\{tabular\}/g,
		(_whole, body: string) => `\n\n${tabularToMarkdown(body)}\n\n`,
	)
	text = text.replace(
		/\\begin\{itemize\}([\s\S]*?)\\end\{itemize\}/g,
		(_whole, body: string) => `\n\n${listToMarkdown(body, false)}\n\n`,
	)
	text = text.replace(
		/\\begin\{enumerate\}([\s\S]*?)\\end\{enumerate\}/g,
		(_whole, body: string) => `\n\n${listToMarkdown(body, true)}\n\n`,
	)
	text = text.replace(/\\begin\{(?:equation\*?|align\*?)\}([\s\S]*?)\\end\{(?:equation\*?|align\*?)\}/g, '\n\n$$$1$$\n\n')
	text = text.replace(/\\\[([\s\S]*?)\\\]/g, '\n\n$$$1$$\n\n')
	text = text.replace(/\\\((.*?)\\\)/g, '$$$1$$')
	text = text.replace(/\\title\{([^{}]*)\}/g, '\n\n# $1\n\n')
	text = text.replace(/\\section\*?\{([^{}]*)\}/g, '\n\n## $1\n\n')
	text = text.replace(/\\subsection\*?\{([^{}]*)\}/g, '\n\n### $1\n\n')
	text = text.replace(/\\subsubsection\*?\{([^{}]*)\}/g, '\n\n#### $1\n\n')
	text = text.replace(/\\caption\{([^{}]*)\}/g, '\n\n*$1*\n\n')
	text = text
		.replace(/\\(?:author|date)\{[^{}]*\}/g, '')
		.replace(/\\usepackage(?:\[[^\]]*\])?\{[^{}]*\}/g, '')
		.replace(/\\documentclass(?:\[[^\]]*\])?\{[^{}]*\}/g, '')
		.replace(/\\geometry\{[^{}]*\}/g, '')

	text = unwrap(text)
	text = text.replace(/\\\\/g, '\n')
	text = text.replace(/\\[a-zA-Z]+\*?(?:\[[^\]]*\])?(?:\{([^{}]*)\})?/g, '$1')

	return text.replace(/\n{3,}/g, '\n\n').trim()
}
