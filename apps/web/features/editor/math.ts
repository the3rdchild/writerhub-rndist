import { mergeAttributes, Node } from '@tiptap/core'
import type { Node as PMNode, ResolvedPos } from '@tiptap/pm/model'
import type { Editor } from '@tiptap/react'
import katex from 'katex'

/**
 * Rumus matematika sebagai node, bukan teks yang kebetulan terlihat seperti
 * rumus.
 *
 * Yang disimpan adalah **sumber LaTeX**-nya, bukan hasil render. Itu yang
 * membuat rumus tetap bisa disunting, ikut tersimpan ke tab, bertahan setelah
 * dimuat ulang, dan bisa dikembalikan jadi teks biasa. Menyimpan HTML hasil
 * KaTeX berarti rumusnya jadi gambar mati yang tak bisa diperbaiki.
 *
 * Dua node, bukan satu dengan penanda: inline hidup di dalam kalimat, blok
 * berdiri sendiri di barisnya. Bedanya bukan gaya - ProseMirror memperlakukan
 * inline dan blok sebagai hal yang berbeda, dan paginasi perlu mengukur yang
 * blok seperti blok lain.
 */

export const MATH_INLINE = 'mathInline'
export const MATH_BLOCK = 'mathBlock'

declare module '@tiptap/core' {
	interface Commands<ReturnType> {
		math: {
			/** Ganti seleksi dengan rumus; `display` untuk rumus blok. */
			setMath: (latex: string, display?: boolean) => ReturnType
			/** Kembalikan rumus di kursor jadi teks LaTeX biasa. */
			unsetMath: () => ReturnType
		}
	}
}

/**
 * Render satu rumus jadi HTML.
 *
 * `throwOnError: false` disengaja: LaTeX yang belum selesai diketik bukan
 * kesalahan yang layak menggugurkan render seluruh dokumen. KaTeX menggambar
 * bagian yang bermasalah dengan warna galat, dan itu justru umpan balik yang
 * berguna sambil menyunting.
 */
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
	// Node atom: kursor tidak boleh masuk ke dalam hasil render.
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
		// Untuk serialisasi (salin, simpan, ekspor) yang penting atribut
		// LaTeX-nya; hasil render digambar ulang oleh node view.
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

// ── mengenali LaTeX di dalam teks ──────────────────────────────────────────

/**
 * Rumus blok diperiksa lebih dulu: `$$…$$` juga cocok dengan pola inline kalau
 * urutannya dibalik, dan hasilnya rumus terpotong di tengah.
 */
const BLOCK_PATTERN = /\$\$([^$]+?)\$\$/g

/**
 * Rumus inline, dengan aturan spasi yang sama seperti Markdown matematika pada
 * umumnya: tidak boleh ada spasi tepat setelah `$` pembuka maupun tepat sebelum
 * `$` penutup.
 *
 * Aturan itu bukan kerapian - itu yang memisahkan rumus dari harga. Tanpa
 * `(?<!\s)`, kalimat "Harganya $5 dan $10 saja" membuat "5 dan " dibaca sebagai
 * rumus, dan naskah yang menyebut angka rupiah atau dolar akan rusak diam-diam.
 */
const INLINE_PATTERN = /(?<!\$)\$(?!\s)([^$\n]*?)(?<!\s)\$(?!\$)/g

export interface FoundMath {
	latex: string
	display: boolean
	/** Posisi di dalam teks yang diperiksa. */
	from: number
	to: number
}

/** Semua rumus di dalam sepotong teks, terurut dari depan. */
export function findMath(text: string): FoundMath[] {
	const found: FoundMath[] = []

	for (const [pattern, display] of [
		[BLOCK_PATTERN, true],
		[INLINE_PATTERN, false],
	] as const) {
		pattern.lastIndex = 0
		let match = pattern.exec(text)
		while (match !== null) {
			const latex = match[1].trim()
			// Rumus blok sudah menelan wilayahnya; yang inline tidak boleh
			// mengklaim potongan yang sama.
			const overlaps = found.some((item) => match!.index < item.to && match!.index + match![0].length > item.from)
			if (latex && !overlaps) {
				found.push({ latex, display, from: match.index, to: match.index + match[0].length })
			}
			match = pattern.exec(text)
		}
	}

	return found.sort((a, b) => a.from - b.from)
}

/** Apakah teks ini seluruhnya satu rumus, tanpa pembatas `$`. */
export function looksLikeBareLatex(text: string): boolean {
	const trimmed = text.trim()
	if (!trimmed || trimmed.includes('$')) return false
	// Perintah LaTeX, superskrip, subskrip, atau pecahan - penanda yang jarang
	// muncul di kalimat biasa.
	return /\\[a-zA-Z]+|[\^_]\{?[^\s]/.test(trimmed)
}

/** Buang pembatas `$` di ujung, kalau pengguna ikut menyorotnya. */
export function stripDelimiters(text: string): string {
	return text.trim().replace(/^\$\$?/, '').replace(/\$\$?$/, '').trim()
}

// ── konversi ───────────────────────────────────────────────────────────────

/**
 * Ubah teks yang sedang disorot jadi rumus.
 *
 * Pembatas `$` dibuang kalau ikut tersorot: pengguna yang menulis `$x^2$` lalu
 * menyeleksi seluruhnya jelas memaksudkan rumusnya, bukan tanda dolarnya.
 */
export function convertSelectionToMath(editor: Editor, display: boolean): boolean {
	const { from, to, empty } = editor.state.selection
	if (empty) return false

	const latex = stripDelimiters(editor.state.doc.textBetween(from, to, ' ', ' '))
	if (!latex) return false

	return editor.chain().focus().deleteSelection().setMath(latex, display).run()
}

/**
 * Ubah semua `$…$` dan `$$…$$` di seluruh dokumen sekaligus.
 *
 * Suntingan diterapkan dari belakang ke depan supaya posisi yang belum
 * diproses tetap sahih - mengganti dari depan menggeser semua yang di
 * belakangnya dan membuat penggantian berikutnya salah sasaran.
 *
 * Rumus `$$…$$` hanya jadi node blok kalau ia mengisi seluruh paragraf. Kalau
 * ia berada di tengah kalimat, node blok tidak sah di sana - jadi ia
 * diperlakukan sebagai inline daripada gagal diam-diam.
 */
export function convertMathInDocument(editor: Editor): number {
	const { state } = editor
	const inlineType = state.schema.nodes[MATH_INLINE]
	const blockType = state.schema.nodes[MATH_BLOCK]
	if (!inlineType || !blockType) return 0

	const edits: Array<{ from: number; to: number; node: PMNode }> = []

	state.doc.descendants((node, pos) => {
		if (!node.isTextblock) return true

		const whole = node.textContent.trim().match(/^\$\$([\s\S]+)\$\$$/)
		if (whole?.[1].trim()) {
			edits.push({
				from: pos,
				to: pos + node.nodeSize,
				node: blockType.create({ latex: whole[1].trim() }),
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

/** Rumus tepat di posisi kursor, kalau ada. */
export function mathAtSelection(editor: Editor): { latex: string; display: boolean } | null {
	const { $from, node } = editor.state.selection as { $from: ResolvedPos; node?: PMNode }
	const candidate = node ?? $from.nodeAfter ?? $from.nodeBefore

	if (candidate?.type.name === MATH_INLINE) return { latex: candidate.attrs.latex, display: false }
	if (candidate?.type.name === MATH_BLOCK) return { latex: candidate.attrs.latex, display: true }
	return null
}
