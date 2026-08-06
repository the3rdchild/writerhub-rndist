/**
 * Markdown seperlunya, diubah jadi HTML.
 *
 * Model menjawab dalam Markdown karena itu bahasa alaminya, sementara editor
 * menerima HTML dan mem-parsing-nya lewat skema Tiptap. Tanpa terjemahan ini,
 * tabel pipe masuk ke dokumen sebagai paragraf berisi garis tegak - persis
 * yang terlihat saat AI diminta "buatkan tabel".
 *
 * Cakupannya sengaja sempit: hanya bentuk yang benar-benar dipakai model saat
 * menyusun isi dokumen. Menulis parser Markdown penuh berarti memelihara
 * pustaka kecil, sedangkan yang dibutuhkan hanya segelintir blok - dan apa pun
 * yang tidak dikenali tetap keluar sebagai paragraf, bukan hilang.
 */

import { latexToMarkdown, looksLikeLatexDocument } from './latex-document'

function escapeHtml(value: string): string {
	return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function escapeAttribute(value: string): string {
	return escapeHtml(value).replace(/"/g, '&quot;')
}

/**
 * Penanda sementara untuk rumus, dipakai selama teks diproses.
 *
 * LaTeX penuh karakter yang berarti lain di Markdown - `_`, `^`, `*`, `\\` -
 * jadi kalau ia ikut melewati pemroses penanda inline, `\\alpha*2` berubah jadi
 * miring dan rumusnya rusak. Rumus dicabut lebih dulu, sisanya diproses seperti
 * biasa, lalu rumusnya dikembalikan utuh.
 *
 * Karakter kendali dipakai sebagai pembungkus karena ia tidak mungkin muncul
 * di naskah yang ditulis manusia.
 */
const MATH_PLACEHOLDER = '\u0000math'

/** Penanda inline. Dijalankan setelah escaping supaya tag hasilnya tidak ikut lolos. */
function inline(text: string): string {
	// Rumus diamankan lebih dulu; lihat MATH_PLACEHOLDER.
	const formulas: string[] = []
	const guarded = text.replace(/\$\$?([^$\n]+?)\$\$?/g, (whole, latex: string) => {
		const trimmed = latex.trim()
		// Aturan spasi yang sama seperti pengenalan rumus di dokumen: tanpa itu,
		// "$5 dan $10" ikut tertangkap sebagai rumus.
		if (!trimmed || /^\s|\s$/.test(latex)) return whole
		const display = whole.startsWith('$$')
		const tag = display ? 'div' : 'span'
		formulas.push(`<${tag} data-latex="${escapeAttribute(trimmed)}"></${tag}>`)
		return `${MATH_PLACEHOLDER}${formulas.length - 1}\u0000`
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

/** Baris tabel pipe jadi daftar sel, tanpa pipa pembuka/penutup. */
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

/**
 * Apakah teks ini mengandung Markdown yang layak diterjemahkan.
 *
 * Teks biasa dibiarkan lewat apa adanya: membungkusnya jadi HTML hanya
 * menambah risiko tanpa menambah apa pun.
 */
export function looksLikeMarkdown(text: string): boolean {
	return (
		/^\s*(#{1,6}\s|[-*]\s|\d+\.\s|>\s|\|.*\|)/m.test(text) ||
		/```/.test(text) ||
		// Rumus juga layak diterjemahkan walau sisanya kalimat biasa.
		/\$\$?[^\s$][^$\n]*[^\s$]\$\$?|\$[^\s$]\$/.test(text)
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

		// ── blok kode ────────────────────────────────────────────────────────
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

		// ── tabel ────────────────────────────────────────────────────────────
		// Baris pemisah wajib ada; tanpa itu deretan pipa cuma teks biasa.
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
					// Sel yang kurang diisi kosong supaya jumlah kolomnya tetap rata.
					const cells = Array.from({ length: header.length }, (_, column) => row[column] ?? '')
					return `<tr>${cells.map((cell) => `<td>${inline(cell)}</td>`).join('')}</tr>`
				})
				.join('')

			out.push(`<table><tbody><tr>${head}</tr>${body}</tbody></table>`)
			continue
		}

		// ── rumus blok ───────────────────────────────────────────────────────
		// Sebaris penuh `$$…$$` jadi node blok. Kalau dibiarkan lewat cabang
		// paragraf, hasilnya <div> di dalam <p> - bersarang yang tidak sah dan
		// akan dibongkar browser.
		const blockMath = trimmed.match(/^\$\$([\s\S]+)\$\$$/)
		if (blockMath?.[1].trim()) {
			out.push(`<div data-latex="${escapeAttribute(blockMath[1].trim())}"></div>`)
			index += 1
			continue
		}

		// ── heading ──────────────────────────────────────────────────────────
		const heading = trimmed.match(/^(#{1,6})\s+(.*)$/)
		if (heading) {
			const level = heading[1].length
			out.push(`<h${level}>${inline(heading[2])}</h${level}>`)
			index += 1
			continue
		}

		// ── daftar ───────────────────────────────────────────────────────────
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

		// ── kutipan ──────────────────────────────────────────────────────────
		if (trimmed.startsWith('>')) {
			const quoted: string[] = []
			while (index < lines.length && lines[index].trim().startsWith('>')) {
				quoted.push(lines[index].trim().replace(/^>\s?/, ''))
				index += 1
			}
			out.push(`<blockquote><p>${inline(quoted.join(' '))}</p></blockquote>`)
			continue
		}

		// ── paragraf ─────────────────────────────────────────────────────────
		//
		// Baris pertama selalu ditelan, apa pun bentuknya. Cabang ini juga
		// menampung sisa yang tidak dikenali blok mana pun - misalnya deretan
		// pipa tanpa baris pemisah, yang bukan tabel. Kalau syarat berhenti ikut
		// diberlakukan pada baris pertama, `index` tidak pernah maju dan
		// perulangan luarnya menggantung selamanya.
		const paragraph: string[] = [trimmed]
		index += 1

		// Baris berikutnya digabung ke paragraf yang sama, seperti Markdown.
		while (index < lines.length) {
			const current = lines[index].trim()
			if (!current || isTableRow(lines[index]) || /^(#{1,6}\s|[-*]\s|\d+\.\s|>|```)/.test(current)) {
				break
			}
			paragraph.push(current)
			index += 1
		}

		out.push(`<p>${inline(paragraph.join(' '))}</p>`)
	}

	return out.join('')
}

/**
 * Bentuk yang siap diserahkan ke `insertContent`.
 *
 * Teks polos dikembalikan apa adanya - Tiptap memperlakukannya sebagai teks,
 * dan itu memang yang diinginkan untuk kalimat pengganti biasa.
 */
export function toEditorContent(text: string): string {
	// Dokumen LaTeX utuh diterjemahkan dulu jadi Markdown. Tanpa ini isinya
	// masuk apa adanya - `&` dan `\\` sebagai teks, dan seluruh barisnya
	// menyatu jadi satu paragraf yang lebih tinggi dari satu halaman.
	const source = looksLikeLatexDocument(text) ? latexToMarkdown(text) : text
	return looksLikeMarkdown(source) ? markdownToHtml(source) : source
}
