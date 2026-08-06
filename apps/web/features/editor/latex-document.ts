/**
 * Dokumen LaTeX utuh, diterjemahkan jadi Markdown yang kita mengerti.
 *
 * Ini jaring pengaman, bukan dukungan LaTeX. Model kadang salah paham: diminta
 * menulis rumus, ia justru mengarang `\documentclass` lengkap dengan `tabular`.
 * Tanpa terjemahan ini, isinya masuk apa adanya - `&` dan `\\` bertebaran
 * sebagai teks, dan karena baris-baris itu menyatu jadi satu paragraf raksasa,
 * ia lebih tinggi dari satu halaman dan menembus batas lembar.
 *
 * Cakupannya sengaja sempit: hanya perintah yang benar-benar muncul saat model
 * "menulis dokumen". Menulis parser LaTeX sungguhan berarti memelihara proyek
 * tersendiri, sedangkan yang dibutuhkan cuma menyelamatkan isinya.
 */

/** Apakah teks ini dokumen LaTeX, bukan sekadar rumus di tengah kalimat. */
export function looksLikeLatexDocument(text: string): boolean {
	return /\\documentclass|\\begin\{document\}|\\begin\{tabular\}|\\section\{/.test(text)
}

/** `\hline`, `\centering`, dan kawan-kawan yang tidak menyumbang isi. */
const NOISE = /\\(?:hline|centering|maketitle|newpage|clearpage|noindent|small|large|bigskip|medskip|smallskip)\b/g

/** Perintah pembungkus yang isinya tetap dipakai. */
function unwrap(text: string): string {
	return text
		.replace(/\\textbf\{([^{}]*)\}/g, '**$1**')
		.replace(/\\(?:textit|emph)\{([^{}]*)\}/g, '*$1*')
		.replace(/\\texttt\{([^{}]*)\}/g, '`$1`')
		.replace(/\\underline\{([^{}]*)\}/g, '$1')
		.replace(/\\multicolumn\{\d+\}\{[^{}]*\}\{([^{}]*)\}/g, '$1')
		// Karakter yang di-escape LaTeX kembali jadi dirinya sendiri.
		.replace(/\\([%&$#_{}])/g, '$1')
		// Tanda hubung ganda LaTeX adalah en dash.
		.replace(/(\d)--(\d)/g, '$1–$2')
		.replace(NOISE, '')
		.trim()
}

/** Satu `tabular` jadi tabel Markdown. */
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

/** Isi `itemize`/`enumerate` jadi daftar Markdown. */
function listToMarkdown(body: string, ordered: boolean): string {
	const items = body
		.split('\\item')
		.map((item) => unwrap(item).trim())
		.filter(Boolean)

	return items.map((item, index) => (ordered ? `${index + 1}. ${item}` : `- ${item}`)).join('\n')
}

export function latexToMarkdown(source: string): string {
	// Preamble tidak menyumbang isi apa pun.
	const start = source.indexOf('\\begin{document}')
	let text = start === -1 ? source : source.slice(start + '\\begin{document}'.length)
	text = text.replace(/\\end\{document\}[\s\S]*$/, '')

	// Blok berlingkup diproses lebih dulu, selagi batasnya masih utuh.
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

	// Rumus blok LaTeX memakai notasi yang sudah kita mengerti.
	text = text.replace(/\\begin\{(?:equation\*?|align\*?)\}([\s\S]*?)\\end\{(?:equation\*?|align\*?)\}/g, '\n\n$$$1$$\n\n')
	text = text.replace(/\\\[([\s\S]*?)\\\]/g, '\n\n$$$1$$\n\n')
	text = text.replace(/\\\((.*?)\\\)/g, '$$$1$$')

	// Judul dan bagian jadi heading.
	text = text.replace(/\\title\{([^{}]*)\}/g, '\n\n# $1\n\n')
	text = text.replace(/\\section\*?\{([^{}]*)\}/g, '\n\n## $1\n\n')
	text = text.replace(/\\subsection\*?\{([^{}]*)\}/g, '\n\n### $1\n\n')
	text = text.replace(/\\subsubsection\*?\{([^{}]*)\}/g, '\n\n#### $1\n\n')
	text = text.replace(/\\caption\{([^{}]*)\}/g, '\n\n*$1*\n\n')

	// Yang tersisa: perintah tanpa padanan dibuang, isinya dipertahankan.
	text = text
		.replace(/\\(?:author|date)\{[^{}]*\}/g, '')
		.replace(/\\usepackage(?:\[[^\]]*\])?\{[^{}]*\}/g, '')
		.replace(/\\documentclass(?:\[[^\]]*\])?\{[^{}]*\}/g, '')
		.replace(/\\geometry\{[^{}]*\}/g, '')

	text = unwrap(text)

	// Baris LaTeX dipisah `\\`; tanpa ini semuanya menyatu jadi satu paragraf
	// raksasa - dan paragraf setinggi itu menembus batas lembar.
	text = text.replace(/\\\\/g, '\n')

	// Sisa perintah yang tidak dikenali dibuang beserta kurungnya, bukan
	// dibiarkan muncul sebagai teks.
	text = text.replace(/\\[a-zA-Z]+\*?(?:\[[^\]]*\])?(?:\{([^{}]*)\})?/g, '$1')

	return text.replace(/\n{3,}/g, '\n\n').trim()
}
