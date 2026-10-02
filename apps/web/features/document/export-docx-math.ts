import katex from 'katex'
import type { XmlParser } from './docx/xml'

/**
 * Rumus LaTeX → persamaan Word (OMML) yang bisa disunting (OBJ-2).
 *
 * Dulu `mathInline` dilewati `runsOf` dan `mathBlock` jatuh ke cabang
 * `default` yang memakai `textContent` - kosong untuk atom - jadi semua rumus
 * lenyap dari berkas Word tanpa jejak, sementara PDF mencetaknya benar.
 *
 * Jalurnya: KaTeX (pustaka yang sama dengan kanvas) menerjemahkan LaTeX ke
 * MathML, MathML diurai, lalu dipetakan ke elemen OMML lewat API `Math*`
 * pustaka `docx` untuk konstruk yang dimilikinya (pecahan, akar, skrip, limit,
 * fungsi) dan `BuilderElement` - juga API pustaka itu - untuk sisanya (n-ary,
 * kurung, matriks, aksen, larik persamaan). Konstruk yang tidak terpetakan
 * membuat seluruh rumus jatuh ke teks LaTeX berhuruf lebar-tetap: rumus yang
 * tampil sebagai kodenya masih lebih berguna daripada rumus yang hilang.
 *
 * Bentuk antara (`MathIR`) murni data, supaya pemetaannya bisa diuji tanpa
 * pustaka `docx`.
 */

export type MathStyle = 'p' | 'b' | 'i' | 'bi'

export interface MathRunIR {
	t: 'r'
	text: string
	/** `m:sty`: p = tegak, b = tebal, i = miring, bi = tebal-miring. */
	sty?: MathStyle
	/** `m:scr`: double-struck, script, fraktur, sans-serif, monospace. */
	scr?: string
	/** `m:nor`: teks biasa (bukan matematika), untuk `\text{}`. */
	nor?: boolean
	/** `m:aln`: titik perataan baris di larik persamaan (`&` LaTeX). */
	aln?: boolean
	/** Warna run (`\color`), hex tanpa `#`. */
	color?: string
}

export interface MathElementIR {
	t: 'el'
	name: string
	attrs?: Record<string, string>
	children: MathIR[]
}

export type MathIR = MathRunIR | MathElementIR

class UnsupportedMath extends Error {}

const el = (name: string, children: MathIR[] = [], attrs?: Record<string, string>): MathElementIR => ({
	t: 'el',
	name,
	children,
	...(attrs ? { attrs } : {}),
})
const val = (name: string, value: string): MathElementIR => el(name, [], { 'm:val': value })
const on = (name: string): MathElementIR => val(name, '1')

/** Operator n-ary yang menjadi `m:nary` (batasnya di bawah/atas atau sub/sup). */
const NARY = new Set([
	'∑',
	'∏',
	'∐',
	'∫',
	'∬',
	'∭',
	'⨌',
	'∮',
	'∯',
	'∰',
	'⋃',
	'⋂',
	'⨁',
	'⨂',
	'⨀',
	'⨄',
	'⨆',
	'⋁',
	'⋀',
])
const INTEGRALS = new Set(['∫', '∬', '∭', '⨌', '∮', '∯', '∰'])

/** Relasi: batas kanan isi operator n-ary (`\sum_i a_i = b` → isinya `a_i`). */
const RELATIONS = new Set([
	'=',
	'≠',
	'<',
	'>',
	'≤',
	'≥',
	'≦',
	'≧',
	'≈',
	'≡',
	'∼',
	'≃',
	'≅',
	'∝',
	'→',
	'←',
	'↔',
	'⇒',
	'⇐',
	'⇔',
	'⟹',
	'⟸',
	'⟺',
	'∈',
	'∉',
	'⊂',
	'⊃',
	'⊆',
	'⊇',
	',',
	';',
	':',
])
const OPEN_PARENS = new Set(['(', '[', '{', '⟨', '⌊', '⌈', '|'])
const CLOSE_PARENS = new Set([')', ']', '}', '⟩', '⌋', '⌉'])

/** Karakter kasatmata MathML (aplikasi fungsi, kali/pemisah tak terlihat). */
const INVISIBLE = new Set(['\u2061', '\u2062', '\u2063', '\u2064'])

/** Pembatas KaTeX → karakter `m:begChr`/`m:endChr` milik Word. */
const FENCE_CHARS: Record<string, string> = { '∣': '|', '∥': '‖', '⟨': '⟨', '⟩': '⟩' }

/** Aksen MathML (karakter spasi) → karakter penggabung yang diminta `m:acc`. */
const ACCENTS: Record<string, string> = {
	'^': '\u0302',
	'\u02c6': '\u0302',
	'~': '\u0303',
	'\u02dc': '\u0303',
	'\u02c9': '\u0304',
	'\u00af': '\u0304',
	'\u02d8': '\u0306',
	'\u02d9': '\u0307',
	'\u00a8': '\u0308',
	'\u02da': '\u030a',
	'\u02c7': '\u030c',
	'\u02ca': '\u0301',
	'\u00b4': '\u0301',
	'\u02cb': '\u0300',
	'`': '\u0300',
	'→': '\u20d7',
	'←': '\u20d6',
	'↔': '\u20e1',
}

const VARIANTS: Record<string, { sty?: MathStyle; scr?: string }> = {
	normal: { sty: 'p' },
	bold: { sty: 'b' },
	italic: { sty: 'i' },
	'bold-italic': { sty: 'bi' },
	'double-struck': { scr: 'double-struck', sty: 'p' },
	script: { scr: 'script', sty: 'p' },
	'bold-script': { scr: 'script', sty: 'b' },
	fraktur: { scr: 'fraktur', sty: 'p' },
	'bold-fraktur': { scr: 'fraktur', sty: 'b' },
	'sans-serif': { scr: 'sans-serif', sty: 'p' },
	'bold-sans-serif': { scr: 'sans-serif', sty: 'b' },
	'sans-serif-italic': { scr: 'sans-serif', sty: 'i' },
	'sans-serif-bold-italic': { scr: 'sans-serif', sty: 'bi' },
	monospace: { scr: 'monospace', sty: 'p' },
}

const NAMED_COLORS: Record<string, string> = {
	red: 'FF0000',
	blue: '0000FF',
	green: '008000',
	black: '000000',
	white: 'FFFFFF',
	gray: '808080',
	orange: 'FFA500',
	purple: '800080',
	brown: 'A52A2A',
	magenta: 'FF00FF',
	cyan: '00FFFF',
	yellow: 'FFFF00',
}

function colorOf(value: string | null): string | undefined {
	if (!value) return undefined
	const hex = /^#([0-9a-f]{6})$/i.exec(value.trim())?.[1] ?? /^#([0-9a-f]{3})$/i.exec(value.trim())?.[1]
	if (hex) return (hex.length === 3 ? [...hex].map((digit) => digit + digit).join('') : hex).toUpperCase()
	return NAMED_COLORS[value.trim().toLowerCase()]
}

const childElements = (node: Element): Element[] => {
	const out: Element[] = []
	for (let child = node.firstChild; child; child = child.nextSibling) {
		if (child.nodeType === 1) out.push(child as Element)
	}
	return out
}

const nameOf = (node: Element) => node.localName ?? node.nodeName
const textOf = (node: Element) => (node.textContent ?? '').replace(/\u00a0/g, ' ')

const isFence = (node: Element | undefined) =>
	!!node && nameOf(node) === 'mo' && node.getAttribute('fence') === 'true'

const moText = (node: Element | undefined): string | null =>
	node && nameOf(node) === 'mo' ? textOf(node).trim() : null

const isInvisible = (node: Element) => {
	const text = moText(node)
	return text !== null && text.length > 0 && [...text].every((char) => INVISIBLE.has(char))
}

/** Unsur yang dibungkus mstyle/mpadded/mrow tunggal → unsur intinya. */
function unwrap(node: Element): Element {
	let current = node
	for (;;) {
		const name = nameOf(current)
		const kids = childElements(current)
		if ((name === 'mrow' || name === 'mstyle' || name === 'mpadded') && kids.length === 1) current = kids[0]
		else return current
	}
}

/** Operator n-ary di inti sebuah unsur, beserta batasnya. */
function naryOf(node: Element): { chr: string; under: boolean; sub?: Element; sup?: Element } | null {
	const name = nameOf(node)
	const kids = childElements(node)
	const opText = (candidate: Element | undefined) => {
		if (!candidate) return null
		const text = moText(unwrap(candidate))
		return text && NARY.has(text) ? text : null
	}

	if (name === 'mo') {
		const text = moText(node)
		return text && NARY.has(text) ? { chr: text, under: !INTEGRALS.has(text) } : null
	}
	const chr = opText(kids[0])
	if (!chr) return null
	switch (name) {
		case 'msub':
			return { chr, under: false, sub: kids[1] }
		case 'msup':
			return { chr, under: false, sup: kids[1] }
		case 'msubsup':
			return { chr, under: false, sub: kids[1], sup: kids[2] }
		case 'munder':
			return { chr, under: true, sub: kids[1] }
		case 'mover':
			return { chr, under: true, sup: kids[1] }
		case 'munderover':
			return { chr, under: true, sub: kids[1], sup: kids[2] }
		default:
			return null
	}
}

/**
 * Unsur yang diakhiri "aplikasi fungsi" (U+2061): `\sin`, `\log_2`,
 * `\lim_{x\to0}` - nama fungsi yang argumennya unsur berikutnya.
 */
function endsWithApply(node: Element): boolean {
	const name = nameOf(node)
	const kids = childElements(node)
	if (name === 'mrow') {
		const last = kids.at(-1)
		return !!last && isInvisible(last) && moText(last)?.includes('\u2061') === true
	}
	if (['msub', 'msup', 'msubsup', 'munder', 'mover', 'munderover'].includes(name) && kids[0]) {
		return endsWithApply(kids[0])
	}
	return false
}

export class LatexToOmml {
	private color: string | undefined

	/** LaTeX → bentuk antara OMML; `null` bila ada yang tidak terpetakan. */
	static convert(latex: string, display: boolean, parse: XmlParser): MathIR[] | null {
		const source = latex.trim()
		if (!source) return null
		try {
			const html = katex.renderToString(source, {
				displayMode: display,
				output: 'mathml',
				throwOnError: true,
				strict: 'ignore',
				trust: false,
			})
			const math = parse(html).getElementsByTagName('math')[0]
			if (!math) return null
			const content = new LatexToOmml().children(math)
			return content.length > 0 ? content : null
		} catch {
			// LaTeX yang tidak bisa diurai KaTeX, atau konstruk tanpa padanan.
			return null
		}
	}

	private run(text: string, extra: Omit<MathRunIR, 't' | 'text'> = {}): MathRunIR {
		return { t: 'r', text, ...(this.color ? { color: this.color } : {}), ...extra }
	}

	/** Isi sebuah unsur sebagai deret (mrow implisit). */
	private children(node: Element): MathIR[] {
		return this.sequence(
			childElements(node).filter((child) => !['annotation', 'annotation-xml'].includes(nameOf(child))),
		)
	}

	/** Satu argumen OMML (`m:e`, `m:num`, ...) dari satu unsur MathML. */
	private arg(node: Element | undefined): MathIR[] {
		return node ? this.node(node) : []
	}

	private sequence(nodes: Element[]): MathIR[] {
		const out: MathIR[] = []
		for (let index = 0; index < nodes.length; index += 1) {
			const node = nodes[index]
			if (isInvisible(node)) continue

			const nary = naryOf(node)
			if (nary) {
				// Isi operator: unsur sesudahnya sampai relasi di tingkat kurung nol.
				const body: Element[] = []
				let depth = 0
				let next = index + 1
				for (; next < nodes.length; next += 1) {
					const candidate = nodes[next]
					const text = moText(candidate)
					if (text !== null && !isFence(candidate)) {
						if (depth === 0 && RELATIONS.has(text)) break
						if (OPEN_PARENS.has(text) && text !== '|') depth += 1
						if (CLOSE_PARENS.has(text)) depth = Math.max(0, depth - 1)
					}
					body.push(candidate)
				}
				out.push(this.naryElement(nary, this.sequence(body)))
				index = next - 1
				continue
			}

			const nextNode = nodes[index + 1]
			const applies = nextNode !== undefined && isInvisible(nextNode) && moText(nextNode)?.includes('\u2061')
			let next = index + 1
			while (next < nodes.length && isInvisible(nodes[next])) next += 1
			const first = nodes[next]
			// Nama fungsi (\sin, \log_2, \lim_{x\to0}) beserta argumennya → m:func.
			// Tanpa argumen sesudahnya ia cukup nama tegak biasa.
			if ((endsWithApply(node) || applies) && first) {
				const argument: Element[] = []
				const text = moText(first)
				if (text !== null && OPEN_PARENS.has(text) && text !== '|' && !isFence(first)) {
					// Argumen berkurung: ambil sampai kurung tutup pasangannya.
					let depth = 0
					for (; next < nodes.length; next += 1) {
						const candidate = nodes[next]
						const inner = moText(candidate)
						argument.push(candidate)
						if (inner !== null && OPEN_PARENS.has(inner) && inner !== '|') depth += 1
						if (inner !== null && CLOSE_PARENS.has(inner)) {
							depth -= 1
							if (depth <= 0) break
						}
					}
				} else {
					argument.push(first)
				}
				out.push({
					t: 'el',
					name: 'func',
					children: [el('m:fName', this.node(node)), el('m:e', this.sequence(argument))],
				})
				index = next
				continue
			}

			out.push(...this.node(node))
		}
		return mergeRuns(out)
	}

	private naryElement(
		nary: { chr: string; under: boolean; sub?: Element; sup?: Element },
		body: MathIR[],
	): MathElementIR {
		const props: MathIR[] = [
			val('m:chr', nary.chr),
			val('m:limLoc', nary.under ? 'undOvr' : 'subSup'),
			...(nary.sub ? [] : [on('m:subHide')]),
			...(nary.sup ? [] : [on('m:supHide')]),
		]
		// m:sub dan m:sup wajib ada menurut skema, kosong sekalipun.
		return el('m:nary', [
			el('m:naryPr', props),
			el('m:sub', this.arg(nary.sub)),
			el('m:sup', this.arg(nary.sup)),
			el('m:e', body),
		])
	}

	private node(node: Element): MathIR[] {
		const name = nameOf(node)
		const kids = childElements(node)

		switch (name) {
			case 'math':
			case 'mrow':
				return this.row(node)
			case 'semantics':
				return kids[0] ? this.node(kids[0]) : []
			case 'annotation':
			case 'annotation-xml':
				return []
			case 'mstyle': {
				const color = colorOf(node.getAttribute('mathcolor'))
				if (!color) return this.children(node)
				const outer = this.color
				this.color = color
				try {
					return this.children(node)
				} finally {
					this.color = outer
				}
			}
			case 'mpadded':
				return this.children(node)
			case 'mi': {
				const text = textOf(node)
				if (!text) return []
				const variant = VARIANTS[node.getAttribute('mathvariant') ?? '']
				if (variant) return [this.run(text, variant)]
				return [this.run(text, [...text.trim()].length > 1 ? { sty: 'p' } : {})]
			}
			case 'mn':
				return textOf(node) ? [this.run(textOf(node))] : []
			case 'mo': {
				if (kids.length > 0) return this.children(node)
				const text = textOf(node)
				if (!text || [...text].every((char) => INVISIBLE.has(char))) return []
				if (NARY.has(text.trim()))
					return [this.naryElement({ chr: text.trim(), under: !INTEGRALS.has(text.trim()) }, [])]
				const variant = VARIANTS[node.getAttribute('mathvariant') ?? '']
				return [this.run(text, variant ? { sty: variant.sty } : {})]
			}
			case 'mtext':
			case 'ms': {
				const text = textOf(node)
				return text ? [this.run(name === 'ms' ? `"${text}"` : text, { nor: true })] : []
			}
			case 'mspace': {
				const width = Number.parseFloat(node.getAttribute('width') ?? '')
				if (!Number.isFinite(width) || width <= 0) return []
				const space = width < 0.2 ? '\u2009' : width < 0.4 ? '\u2005' : width < 0.8 ? '\u2002' : '\u2003'
				return [this.run(space)]
			}
			case 'mfrac': {
				const noBar = /^0(\.0+)?(px|em|ex|pt)?$/.test(node.getAttribute('linethickness') ?? '')
				return [
					el('m:f', [
						...(noBar ? [el('m:fPr', [val('m:type', 'noBar')])] : []),
						el('m:num', this.arg(kids[0])),
						el('m:den', this.arg(kids[1])),
					]),
				]
			}
			case 'msqrt':
				return [el('m:rad', [el('m:radPr', [on('m:degHide')]), el('m:deg'), el('m:e', this.children(node))])]
			case 'mroot':
				return [el('m:rad', [el('m:radPr'), el('m:deg', this.arg(kids[1])), el('m:e', this.arg(kids[0]))])]
			case 'msub':
			case 'msup':
			case 'msubsup': {
				const nary = naryOf(node)
				if (nary) return [this.naryElement(nary, [])]
				const base = el('m:e', this.arg(kids[0]))
				if (name === 'msub') return [el('m:sSub', [el('m:sSubPr'), base, el('m:sub', this.arg(kids[1]))])]
				if (name === 'msup') return [el('m:sSup', [el('m:sSupPr'), base, el('m:sup', this.arg(kids[1]))])]
				return [
					el('m:sSubSup', [
						el('m:sSubSupPr'),
						base,
						el('m:sub', this.arg(kids[1])),
						el('m:sup', this.arg(kids[2])),
					]),
				]
			}
			case 'munder':
			case 'mover':
			case 'munderover':
				return this.underOver(node, name, kids)
			case 'mtable':
				return [this.table(node, false)]
			case 'mphantom':
				return [el('m:phant', [el('m:phantPr', [val('m:show', '0')]), el('m:e', this.children(node))])]
			case 'menclose': {
				const notation = node.getAttribute('notation') ?? ''
				const inner = this.children(node)
				if (notation.includes('box') || notation.includes('roundedbox'))
					return [el('m:borderBox', [el('m:e', inner)])]
				if (notation.includes('strike')) {
					const strikes = [
						...(notation.includes('updiagonalstrike') ? [on('m:strikeBLTR')] : []),
						...(notation.includes('downdiagonalstrike') ? [on('m:strikeTLBR')] : []),
						...(notation.includes('horizontalstrike') ? [on('m:strikeH')] : []),
						...(notation.includes('verticalstrike') ? [on('m:strikeV')] : []),
					]
					return [
						el('m:borderBox', [
							el('m:borderBoxPr', [
								on('m:hideTop'),
								on('m:hideBot'),
								on('m:hideLeft'),
								on('m:hideRight'),
								...strikes,
							]),
							el('m:e', inner),
						]),
					]
				}
				return inner
			}
			default:
				// merror (LaTeX salah), mmultiscripts, maction, mglyph, ...
				throw new UnsupportedMath(name)
		}
	}

	/** mrow: kurung `\left...\right` menjadi `m:d`; selebihnya deret biasa. */
	private row(node: Element): MathIR[] {
		const kids = childElements(node).filter(
			(child) => !['annotation', 'annotation-xml'].includes(nameOf(child)),
		)
		const opens = isFence(kids[0])
		const closes = kids.length > 1 && isFence(kids.at(-1))
		if (!opens && !closes) return this.sequence(kids)

		const begin = opens ? (moText(kids[0]) ?? '') : ''
		const end = closes ? (moText(kids.at(-1)) ?? '') : ''
		const inner = kids.slice(opens ? 1 : 0, closes ? -1 : undefined)

		// `\middle|` memecah isi kurung menjadi beberapa m:e.
		const parts: Element[][] = [[]]
		let separator: string | null = null
		for (const child of inner) {
			if (isFence(child)) {
				separator ??= moText(child) ?? '|'
				parts.push([])
			} else parts.at(-1)?.push(child)
		}

		const fenceChar = (value: string) => FENCE_CHARS[value] ?? value
		const content = parts.map((part) => {
			// Matriks di dalam kurung (pmatrix, bmatrix, cases) menjadi m:m.
			if (part.length === 1 && nameOf(unwrap(part[0])) === 'mtable')
				return el('m:e', [this.table(unwrap(part[0]), true)])
			return el('m:e', this.sequence(part))
		})
		return [
			el('m:d', [
				el('m:dPr', [
					val('m:begChr', fenceChar(begin)),
					...(separator !== null ? [val('m:sepChr', fenceChar(separator))] : []),
					val('m:endChr', fenceChar(end)),
				]),
				...content,
			]),
		]
	}

	private underOver(node: Element, name: string, kids: Element[]): MathIR[] {
		const nary = naryOf(node)
		if (nary) return [this.naryElement(nary, [])]

		const base = kids[0]
		const script = name === 'munderover' ? undefined : kids[1]
		const scriptText = script ? moText(unwrap(script)) : null
		const stretchy = script ? unwrap(script).getAttribute('stretchy') === 'true' : false
		const accent = node.getAttribute('accent') === 'true' || node.getAttribute('accentunder') === 'true'

		if (script && scriptText !== null && (accent || stretchy)) {
			// Garis atas/bawah: \overline, \underline.
			if (['‾', '\u00af', '_', '\u0305', '―', '─'].includes(scriptText)) {
				return [
					el('m:bar', [
						el('m:barPr', [val('m:pos', name === 'mover' ? 'top' : 'bot')]),
						el('m:e', this.arg(base)),
					]),
				]
			}
			// Kurung kurawal mendatar: \overbrace, \underbrace.
			if (['⏞', '⏟', '⎴', '⎵', '⏜', '⏝'].includes(scriptText)) {
				const top = name === 'mover'
				return [
					el('m:groupChr', [
						el('m:groupChrPr', [
							val('m:chr', scriptText),
							val('m:pos', top ? 'top' : 'bot'),
							val('m:vertJc', top ? 'bot' : 'top'),
						]),
						el('m:e', this.arg(base)),
					]),
				]
			}
			if (name === 'mover' && accent) {
				const char =
					ACCENTS[scriptText] ?? (/^[\u0300-\u036f\u20d0-\u20ff]$/.test(scriptText) ? scriptText : null)
				if (char) return [el('m:acc', [el('m:accPr', [val('m:chr', char)]), el('m:e', this.arg(base))])]
			}
		}

		if (name === 'munder')
			return [el('m:limLow', [el('m:e', this.arg(base)), el('m:lim', this.arg(kids[1]))])]
		if (name === 'mover') return [el('m:limUpp', [el('m:e', this.arg(base)), el('m:lim', this.arg(kids[1]))])]
		return [
			el('m:limUpp', [
				el('m:e', [el('m:limLow', [el('m:e', this.arg(base)), el('m:lim', this.arg(kids[1]))])]),
				el('m:lim', this.arg(kids[2])),
			]),
		]
	}

	/**
	 * mtable: di dalam kurung (matriks, cases) atau berkolom rata tengah →
	 * `m:m`; larik persamaan (aligned, gathered, `columnspacing` nol) →
	 * `m:eqArr`, dengan `m:aln` di awal tiap kolom kedua dst. sebagai titik
	 * perataan `&`. `\tag{n}` KaTeX (tabel lebar 100% bersel pengapit 50%)
	 * menjadi isi persamaan diikuti nomornya.
	 */
	private table(node: Element, fenced: boolean): MathElementIR {
		const rows = childElements(node).filter((row) => ['mtr', 'mlabeledtr'].includes(nameOf(row)))
		const cellsOf = (row: Element) => childElements(row).filter((cell) => nameOf(cell) === 'mtd')

		if (node.getAttribute('width') === '100%' && rows.length === 1) {
			const cells = cellsOf(rows[0])
			if (cells.length === 4 && cells[0].getAttribute('width') === '50%') {
				return el('m:eqArr', [
					el('m:e', [...this.children(cells[1]), this.run('\u2003\u2003'), ...this.children(cells[3])]),
				])
			}
		}

		const aligns = (node.getAttribute('columnalign') ?? '').split(/\s+/).filter(Boolean)
		const spacing = node.getAttribute('columnspacing') ?? ''
		const columns = Math.max(1, ...rows.map((row) => cellsOf(row).length))
		const equationArray = !fenced && (/^0(\.0+)?em$/.test(spacing) || columns === 1)

		if (equationArray) {
			return el(
				'm:eqArr',
				rows.map((row) =>
					el(
						'm:e',
						cellsOf(row).flatMap((cell, index) => {
							const content = this.children(cell)
							if (index === 0) return content
							const first = content[0]
							if (first?.t === 'r') return [{ ...first, aln: true }, ...content.slice(1)]
							return [this.run('', { aln: true }), ...content]
						}),
					),
				),
			)
		}

		const justify = (index: number) => {
			const align = aligns[index] ?? aligns.at(-1) ?? 'center'
			return align === 'left' ? 'left' : align === 'right' ? 'right' : 'center'
		}
		const uniform = Array.from({ length: columns }, (_, index) => justify(index)).every(
			(align) => align === justify(0),
		)
		const columnProps = uniform
			? [el('m:mc', [el('m:mcPr', [val('m:count', String(columns)), val('m:mcJc', justify(0))])])]
			: Array.from({ length: columns }, (_, index) =>
					el('m:mc', [el('m:mcPr', [val('m:count', '1'), val('m:mcJc', justify(index))])]),
				)

		return el('m:m', [
			el('m:mPr', [el('m:mcs', columnProps)]),
			...rows.map((row) => {
				const cells = cellsOf(row)
				return el(
					'm:mr',
					Array.from({ length: columns }, (_, index) =>
						el('m:e', cells[index] ? this.children(cells[index]) : []),
					),
				)
			}),
		])
	}
}

/** Run bersebelahan dengan rupa yang sama digabung, seperti yang ditulis Word sendiri. */
function mergeRuns(items: MathIR[]): MathIR[] {
	const out: MathIR[] = []
	for (const item of items) {
		const last = out.at(-1)
		if (
			item.t === 'r' &&
			last?.t === 'r' &&
			!item.aln &&
			last.sty === item.sty &&
			last.scr === item.scr &&
			!!last.nor === !!item.nor &&
			last.color === item.color
		) {
			out[out.length - 1] = { ...last, text: last.text + item.text }
		} else out.push(item)
	}
	return out
}

type DocxModule = typeof import('docx')
type XmlComponent = InstanceType<DocxModule['XmlComponent']>

/** Pembangun komponen `docx` dari bentuk antara. */
export function ommlBuilder(docx: DocxModule) {
	const attributes = (attrs: Record<string, string> | undefined) =>
		attrs ? Object.fromEntries(Object.entries(attrs).map(([key, value]) => [key, { key, value }])) : undefined
	const element = (name: string, children: (XmlComponent | string)[] = [], attrs?: Record<string, string>) =>
		new docx.BuilderElement({ name, attributes: attributes(attrs), children: children as XmlComponent[] })

	const runOf = (run: MathRunIR): XmlComponent => {
		const mathProps = [
			...(run.nor ? [element('m:nor')] : []),
			...(!run.nor && run.scr ? [element('m:scr', [], { 'm:val': run.scr })] : []),
			...(!run.nor && run.sty ? [element('m:sty', [], { 'm:val': run.sty })] : []),
			...(run.aln ? [element('m:aln')] : []),
		]
		// Teks biasa (`m:nor`) memakai huruf paragraf; selebihnya huruf matematika.
		const wordProps = [
			...(run.nor ? [] : [element('w:rFonts', [], { 'w:ascii': 'Cambria Math', 'w:hAnsi': 'Cambria Math' })]),
			...(run.color ? [element('w:color', [], { 'w:val': run.color })] : []),
		]
		const preserve = /^\s|\s$/.test(run.text) || run.text === ''
		return element('m:r', [
			...(mathProps.length > 0 ? [element('m:rPr', mathProps)] : []),
			...(wordProps.length > 0 ? [element('w:rPr', wordProps)] : []),
			element('m:t', run.text ? [run.text] : [], preserve ? { 'xml:space': 'preserve' } : undefined),
		])
	}

	const nodesOf = (items: MathIR[]): XmlComponent[] => items.map(componentOf)

	/** Konstruk yang dimiliki pustaka `docx` memakai kelas `Math*`-nya. */
	function componentOf(item: MathIR): XmlComponent {
		if (item.t === 'r') return runOf(item)
		const kids = item.children
		const argOf = (name: string) => {
			const found = kids.find((kid) => kid.t === 'el' && kid.name === name)
			return found?.t === 'el' ? nodesOf(found.children) : []
		}
		switch (item.name) {
			case 'm:f':
				if (kids.some((kid) => kid.t === 'el' && kid.name === 'm:fPr')) break
				return new docx.MathFraction({
					numerator: argOf('m:num') as never,
					denominator: argOf('m:den') as never,
				})
			case 'm:sSup':
				return new docx.MathSuperScript({
					children: argOf('m:e') as never,
					superScript: argOf('m:sup') as never,
				})
			case 'm:sSub':
				return new docx.MathSubScript({ children: argOf('m:e') as never, subScript: argOf('m:sub') as never })
			case 'm:sSubSup':
				return new docx.MathSubSuperScript({
					children: argOf('m:e') as never,
					subScript: argOf('m:sub') as never,
					superScript: argOf('m:sup') as never,
				})
			case 'm:rad': {
				const degree = argOf('m:deg')
				return new docx.MathRadical({
					children: argOf('m:e') as never,
					...(degree.length > 0 ? { degree: degree as never } : {}),
				})
			}
			case 'm:limLow':
				return new docx.MathLimitLower({ children: argOf('m:e') as never, limit: argOf('m:lim') as never })
			case 'm:limUpp':
				return new docx.MathLimitUpper({ children: argOf('m:e') as never, limit: argOf('m:lim') as never })
			case 'func':
				return new docx.MathFunction({ name: argOf('m:fName') as never, children: argOf('m:e') as never })
		}
		return element(item.name, nodesOf(kids), item.attrs)
	}

	return {
		/** `m:oMath` untuk rumus dalam baris. */
		inline: (items: MathIR[]) => new docx.Math({ children: nodesOf(items) as never }),
		/** `m:oMathPara` rata tengah untuk rumus blok. */
		block: (items: MathIR[]) =>
			element('m:oMathPara', [
				element('m:oMathParaPr', [element('m:jc', [], { 'm:val': 'center' })]),
				new docx.Math({ children: nodesOf(items) as never }),
			]),
	}
}
