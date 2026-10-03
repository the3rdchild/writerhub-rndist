/**
 * Rumus blok yang lebih lebar dari tempatnya - kolom sempit, halaman berkolom
 * dari DOCX - dibuat muat, seperti Word, alih-alih meluber ke kolom sebelah
 * atau keluar kertas:
 *
 * 1. sedikit terlalu lebar → dikecilkan (sampai `MATH_MIN_SCALE`);
 * 2. jauh terlalu lebar → dipenggal seperti teks, di relasi, operator, dan
 *    pemisah `;`/`,` tingkat teratas;
 * 3. tidak bisa dipenggal (matriks) → dikecilkan lagi sampai `MATH_FLOOR_SCALE`;
 *    sisanya terpotong di dalam bloknya sendiri (CSS), tidak menimpa tetangga.
 */

/** Skala terkecil yang masih dipakai sebelum mencoba memenggal. */
export const MATH_MIN_SCALE = 0.75
/** Skala terkecil sama sekali - di bawah ini rumus tidak terbaca. */
export const MATH_FLOOR_SCALE = 0.4

export type MathFit = { mode: 'display'; scale: number } | { mode: 'wrap' }

/**
 * `natural`: lebar rumus tampilan pada skala 1; `available`: lebar bloknya;
 * `wrapped`: lebar versi terpenggal (null = belum/tidak dicoba).
 */
export function fitMath(natural: number, available: number, wrapped: number | null): MathFit {
	if (available <= 0 || natural <= available) return { mode: 'display', scale: 1 }
	const scale = available / natural
	if (scale >= MATH_MIN_SCALE) return { mode: 'display', scale }
	if (wrapped !== null && wrapped <= available) return { mode: 'wrap' }
	return { mode: 'display', scale: Math.max(scale, MATH_FLOOR_SCALE) }
}

/** Perlu mencoba versi terpenggal? Hanya bila pengecilan saja tidak cukup. */
export function needsWrapAttempt(natural: number, available: number): boolean {
	return available > 0 && natural > available && available / natural < MATH_MIN_SCALE
}

/**
 * Versi LaTeX yang bisa dipenggal KaTeX dalam mode sebaris (`\displaystyle`
 * menjaga ukuran pecahan). Pasangan `\left…\right` dilepas menjadi pembatas
 * biasa - KaTeX tidak memenggal di dalam grupnya - dan `;`/`,` tingkat
 * teratas diberi `\allowbreak`, karena KaTeX hanya memenggal sesudah relasi
 * dan operator biner.
 */
export function wrappableLatex(latex: string): string {
	const unpaired = latex.replace(
		/\\(?:left|right)\s*(\\[a-zA-Z]+|\\[{}|]|[^\s\\])/g,
		(_match, delimiter: string) => (delimiter === '.' ? '' : delimiter),
	)
	let depth = 0
	let out = ''
	for (let index = 0; index < unpaired.length; index++) {
		const char = unpaired[index]
		if (char === '\\') {
			out += char + (unpaired[index + 1] ?? '')
			index++
			continue
		}
		if (char === '{') depth++
		else if (char === '}') depth--
		out += char
		if (depth === 0 && (char === ';' || char === ',')) out += '\\allowbreak '
	}
	return `\\displaystyle ${out}`
}

/**
 * Lebar isi KaTeX di dalam blok, pada ukuran yang sedang terpasang. Mode
 * tampilan: `.katex-html` berupa blok, `scrollWidth`-nya lebar isinya. Mode
 * sebaris (terpenggal): `.katex-html` inline - `scrollWidth`-nya 0 - jadi yang
 * diukur potongan `.base` terlebar, bagian yang tidak bisa dipenggal lagi
 * (matriks, akar panjang). Perbesaran editor (transform) dinetralkan.
 */
function contentWidth(block: HTMLElement): number {
	const html = block.querySelector<HTMLElement>('.katex-html')
	if (!html) return block.scrollWidth
	if (getComputedStyle(html).display !== 'inline') return html.scrollWidth
	const zoom = block.offsetWidth > 0 ? block.getBoundingClientRect().width / block.offsetWidth : 1
	let widest = 0
	for (const piece of html.children) widest = Math.max(widest, piece.getBoundingClientRect().width)
	return widest / (zoom || 1)
}

/**
 * Pasang cara muat terbaik untuk lebar blok saat ini. `render(latex, display)`
 * menghasilkan HTML KaTeX (dari `renderMath`); dipisah supaya berkas ini tidak
 * bergantung pada ekstensinya.
 */
export function applyMathFit(
	block: HTMLElement,
	latex: string,
	render: (latex: string, display: boolean) => string,
): MathFit {
	const available = block.clientWidth
	block.classList.remove('math-block--wrap')
	block.style.removeProperty('--math-scale')
	block.innerHTML = render(latex, true)
	const natural = contentWidth(block)

	let wrapped: number | null = null
	if (needsWrapAttempt(natural, available)) {
		block.classList.add('math-block--wrap')
		block.innerHTML = render(wrappableLatex(latex), false)
		wrapped = contentWidth(block)
	}

	const fit = fitMath(natural, available, wrapped)
	if (fit.mode === 'wrap') return fit
	if (wrapped !== null) {
		block.classList.remove('math-block--wrap')
		block.innerHTML = render(latex, true)
	}
	if (fit.scale < 1) block.style.setProperty('--math-scale', fit.scale.toFixed(3))
	return fit
}

/** Lebar seluruh potongan rumus sebaris bila diletakkan satu baris. */
function totalWidth(span: HTMLElement): number {
	const html = span.querySelector<HTMLElement>('.katex-html')
	if (!html) return span.scrollWidth
	const zoom = span.offsetWidth > 0 ? span.getBoundingClientRect().width / span.offsetWidth : 1
	let total = 0
	for (const piece of html.children) total += piece.getBoundingClientRect().width
	return total / (zoom || 1)
}

/** Gaya display di dalam baris teks: pecahan dan operator besar tetap besar. */
export function displayStyle(latex: string): string {
	return `\\displaystyle ${latex}`
}

export type InlineMathFit = { latex: 'plain' | 'wrappable'; scale: number }

/**
 * Cara muat rumus mengalir bergaya display di lebar paragrafnya, berurutan:
 * muat apa adanya → sedikit kelebaran: kecilkan, tetap satu baris (sama dengan
 * rumus blok) → dipenggal KaTeX di relasi/operator → versi yang lebih mudah
 * dipenggal (`wrappableLatex`) → tidak bisa dipenggal (matriks): kecilkan
 * seluruhnya, atau potongan terlebarnya bila itu di bawah batas bawah.
 *
 * `whole`: lebar seluruh potongan satu baris; `widest`: potongan terlebar;
 * `widestWrappable`: potongan terlebar versi mudah-dipenggal (diukur hanya bila perlu).
 */
export function fitInlineMath(
	available: number,
	whole: number,
	widest: number,
	widestWrappable: () => number,
): InlineMathFit {
	if (available <= 0 || whole <= available) return { latex: 'plain', scale: 1 }
	// 0,98: celah antarpotongan tidak ikut terhitung di `whole`.
	const oneLine = (available / whole) * 0.98
	if (oneLine >= MATH_MIN_SCALE) return { latex: 'plain', scale: oneLine }
	if (widest <= available) return { latex: 'plain', scale: 1 }
	const wrapped = widestWrappable()
	if (wrapped <= available) return { latex: 'wrappable', scale: 1 }
	if (oneLine >= MATH_FLOOR_SCALE) return { latex: 'plain', scale: oneLine }
	return { latex: 'wrappable', scale: Math.max(available / wrapped, MATH_FLOOR_SCALE) }
}

/**
 * Rumus mengalir bergaya display - di dalam paragraf, seperti objek "sebagai
 * karakter" di LibreOffice - dibuat muat di lebar paragrafnya (`fitInlineMath`).
 */
export function applyInlineMathFit(
	span: HTMLElement,
	latex: string,
	available: number,
	render: (latex: string, display: boolean) => string,
): void {
	span.style.removeProperty('--math-scale')
	const plain = render(displayStyle(latex), false)
	span.innerHTML = plain
	let wrappableHtml: string | null = null
	const fit = fitInlineMath(available, totalWidth(span), contentWidth(span), () => {
		wrappableHtml = render(wrappableLatex(latex), false)
		span.innerHTML = wrappableHtml
		return contentWidth(span)
	})
	span.innerHTML = fit.latex === 'wrappable' ? (wrappableHtml ?? render(wrappableLatex(latex), false)) : plain
	if (fit.scale < 1) span.style.setProperty('--math-scale', fit.scale.toFixed(3))
}
