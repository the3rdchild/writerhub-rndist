import { attr, child, children, tagName, val } from './xml'

/**
 * Konversi OMML (Office Math Markup Language, namespace `m:`) menjadi LaTeX.
 * Dipakai importer DOCX untuk elemen `m:oMath` (inline) dan `m:oMathPara` (blok).
 *
 * Konverter ini disiapkan untuk subset OMML yang umum dipakai dokumen Word:
 * pecahan, sub/superscript, delimeter, matriks, akar, operator n-ary (Σ, ∫),
 * baris persamaan, dan run teks biasa. Elemen yang tidak dikenal tidak
 * dibuang — isinya direkursi sehingga teksnya tetap terbawa.
 */

const MATH_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/math'

/** Karakter tak kasatmata (function application dsb.) yang membuat KaTeX bising. */
const INVISIBLE = /[\u200b-\u200f\u2060-\u2064\ufeff]/g

/** Nama fungsi umum yang harus tampil tegak sebagai operator LaTeX. */
const FUNCTION_NAMES = /\b(max|min|sin|cos|tan|log|ln|exp|det|lim|sup|inf)\b/g

/** Pemetaan karakter pembuka/penutup delimeter ke pasangan LaTeX. */
const OPEN_DELIMITER: Record<string, string> = {
	'(': '\\left(',
	'[': '\\left[',
	'{': '\\left\\{',
	'|': '\\left|',
	'': '\\left.',
	'<': '\\left<',
}

const CLOSE_DELIMITER: Record<string, string> = {
	')': '\\right)',
	']': '\\right]',
	'}': '\\right\\}',
	'|': '\\right|',
	'': '\\right.',
	'>': '\\right>',
}

const NARY_OPERATOR: Record<string, string> = {
	'∑': '\\sum',
	'∏': '\\prod',
	'∫': '\\int',
	'∬': '\\iint',
	'∭': '\\iiint',
	'∮': '\\oint',
	'⋃': '\\bigcup',
	'⋂': '\\bigcap',
	'⨁': '\\bigoplus',
	'⨂': '\\bigotimes',
}

function isPropertyTag(name: string): boolean {
	return name === 'rPr' || name.endsWith('Pr')
}

function escapeLatex(text: string): string {
	return text
		.replaceAll('&', '\\&')
		.replaceAll('%', '\\%')
		.replaceAll('$', '\\$')
		.replaceAll('#', '\\#')
		.replaceAll('_', '\\_')
		.replaceAll('{', '\\{')
		.replaceAll('}', '\\}')
		.replaceAll('~', '\\textasciitilde ')
		.replaceAll('^', '\\textasciicircum ')
}

/** Run teks OMML: teks biasa, nama fungsi, atau frasa multi-kata (`\text{}`). */
function runToLatex(run: Element): string {
	const text = children(run, 't')
		.map((node) => node.textContent ?? '')
		.join('')
		.replace(INVISIBLE, '')
	if (!text.trim()) return ''

	// Frasa multi-kata ("Consistency Index") akan kehilangan spasi di LaTeX,
	// jadi bungkus dengan \text{} agar tetap terbaca.
	if (/[A-Za-z]{2,}\s+[A-Za-z]{2,}/.test(text)) return `\\text{${escapeLatex(text.trim())}}`

	return escapeLatex(text).replace(FUNCTION_NAMES, '\\$1 ')
}

function scriptOf(base: string, sub: string, sup: string): string {
	let out = base ? `{${base}}` : ''
	if (sub) out += `_{${sub}}`
	if (sup) out += `^{${sup}}`
	return out
}

function fractionToLatex(fraction: Element): string {
	const numerator = latexOfChildren(child(fraction, 'num'))
	const denominator = latexOfChildren(child(fraction, 'den'))
	const type = val(child(child(fraction, 'fPr'), 'type'))
	if (type === 'noBar' || type === 'lin' || type === 'skw') {
		return `${numerator}/${denominator}`
	}
	return `\\frac{${numerator}}{${denominator}}`
}

function delimiterOf(
	raw: string | undefined,
	table: Record<string, string>,
	fallback: string,
	wrap: '\\left' | '\\right',
): string {
	if (raw === undefined) return table[fallback]
	return table[raw] ?? `${wrap}${raw}`
}

function delimiterToLatex(delimiter: Element): string {
	const properties = child(delimiter, 'dPr')
	const beg = delimiterOf(attr(child(properties, 'begChr'), 'val'), OPEN_DELIMITER, '(', '\\left')
	const end = delimiterOf(attr(child(properties, 'endChr'), 'val'), CLOSE_DELIMITER, ')', '\\right')

	const parts = children(delimiter, 'e').map(latexOfChildren)
	if (parts.length === 0) return `${beg}${end}`

	// Word memisahkan beberapa isi delimeter dengan "|" — pakai \middle agar tetap tinggi.
	return `${beg}${parts.join(' \\middle| ')}${end}`
}

function matrixToLatex(matrix: Element): string {
	const rows = children(matrix, 'mr').map((row) => children(row, 'e').map(latexOfChildren).join(' & '))
	if (rows.length === 0) return ''
	return `\\begin{matrix}${rows.join(' \\\\ ')}\\end{matrix}`
}

function radicalToLatex(radical: Element): string {
	const degree = latexOfChildren(child(radical, 'deg'))
	const body = latexOfChildren(child(radical, 'e'))
	return degree ? `\\sqrt[${degree}]{${body}}` : `\\sqrt{${body}}`
}

function naryToLatex(nary: Element): string {
	const properties = child(nary, 'naryPr')
	const chr = attr(child(properties, 'chr'), 'val')
	// Tanpa m:chr, default OOXML untuk nary adalah integral.
	const operator = chr === undefined ? '\\int' : NARY_OPERATOR[chr]

	let out = operator ?? `\\mathop{\\text{${escapeLatex(chr ?? '')}}}`
	const sub = latexOfChildren(child(nary, 'sub'))
	const sup = latexOfChildren(child(nary, 'sup'))
	if (sub && !onOffChild(properties, 'subHide')) out += `_{${sub}}`
	if (sup && !onOffChild(properties, 'supHide')) out += `^{${sup}}`

	const body = latexOfChildren(child(nary, 'e'))
	return body ? `${out}{${body}}` : out
}

function onOffChild(parent: Element | null, name: string): boolean {
	const element = parent ? child(parent, name) : null
	if (!element) return false
	const raw = val(element)
	return raw !== '0' && raw !== 'false' && raw !== 'off'
}

function equationArrayToLatex(array: Element): string {
	const rows = children(array, 'e').map(latexOfChildren)
	if (rows.length === 0) return ''
	return `\\begin{gathered}${rows.join(' \\\\ ')}\\end{gathered}`
}

function latexOfChildren(parent: Element | null | undefined): string {
	if (!parent) return ''

	const parts: string[] = []
	for (const node of children(parent)) {
		const name = tagName(node)
		if (isPropertyTag(name)) continue

		switch (name) {
			case 'r':
				parts.push(runToLatex(node))
				break
			case 'f':
				parts.push(fractionToLatex(node))
				break
			case 'd':
				parts.push(delimiterToLatex(node))
				break
			case 'm':
				parts.push(matrixToLatex(node))
				break
			case 'rad':
				parts.push(radicalToLatex(node))
				break
			case 'nary':
				parts.push(naryToLatex(node))
				break
			case 'eqArr':
				parts.push(equationArrayToLatex(node))
				break
			case 'sSub': {
				const sub = latexOfChildren(child(node, 'sub'))
				parts.push(scriptOf(latexOfChildren(child(node, 'e')), sub, ''))
				break
			}
			case 'sSup': {
				const sup = latexOfChildren(child(node, 'sup'))
				parts.push(scriptOf(latexOfChildren(child(node, 'e')), '', sup))
				break
			}
			case 'sSubSup': {
				const sub = latexOfChildren(child(node, 'sub'))
				const sup = latexOfChildren(child(node, 'sup'))
				parts.push(scriptOf(latexOfChildren(child(node, 'e')), sub, sup))
				break
			}
			case 'sPre': {
				const sub = latexOfChildren(child(node, 'sub'))
				const sup = latexOfChildren(child(node, 'sup'))
				const base = latexOfChildren(child(node, 'e'))
				parts.push(`{}${scriptOf('', sub, sup)}{${base}}`)
				break
			}
			default:
				// Elemen tidak dikenal (bar, acc, func, lim, …): bawa isinya apa adanya
				// supaya teksnya tidak hilang.
				parts.push(latexOfChildren(node))
		}
	}
	return parts.join('')
}

/**
 * Konversi elemen `m:oMath` atau `m:oMathPara` menjadi satu string LaTeX.
 * Mengembalikan string kosong bila tidak ada konten yang bisa dikonversi.
 */
export function ommlToLatex(element: Element): string {
	if (tagName(element) === 'oMathPara') {
		return children(element, 'oMath').map(latexOfChildren).filter(Boolean).join(' \\quad ')
	}
	if (tagName(element) === 'oMath' || element.namespaceURI === MATH_NS) {
		return latexOfChildren(element)
	}
	return ''
}
