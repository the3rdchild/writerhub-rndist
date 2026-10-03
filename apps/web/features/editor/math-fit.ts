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
