/**
 * Menerjemahkan Markdown menjadi dokumen ProseMirror - bentuk yang disimpan
 * kolom `content` pada `document_tabs`.
 *
 * `apps/web` punya konverter sendiri (`features/editor/markdown.ts`), tapi
 * keluarannya HTML untuk disuntikkan ke instance tiptap yang hidup. Di sini
 * tidak ada editor maupun DOM: draf dari klien eksternal ditulis server, jadi
 * JSON-nya harus dibentuk langsung. Nama node mengikuti skema editor
 * (StarterKit + tabel + code block), karena naskah inilah yang nanti dibuka
 * editor apa adanya.
 *
 * Cakupannya sengaja sebatas yang benar-benar keluar dari model saat menulis
 * draf: judul, paragraf, daftar, kutipan, tabel, blok kode, garis pemisah,
 * serta tebal/miring/kode/tautan. Rumus LaTeX tidak ditangani - itu urusan
 * jalur tempel di editor, bukan jalur serah-terima ini.
 */

export interface DocMark {
	type: string
	attrs?: Record<string, unknown>
}

export interface DocNode {
	type: string
	attrs?: Record<string, unknown>
	content?: DocNode[]
	text?: string
	marks?: DocMark[]
}

export interface ProseMirrorDoc extends Record<string, unknown> {
	type: 'doc'
	content: DocNode[]
}

/** Nama node blok rancangan di skema editor (`apps/web/features/editor/html-block.ts`). */
const HTML_BLOCK = 'htmlBlock'
/** Bawaan tinggi blok sisipan. Mode halaman mengabaikannya, tapi skemanya menuntut angka. */
const HTML_BLOCK_HEIGHT = 320

const HTML_FENCE = /^```html\s*$/i

const TABLE_DIVIDER = /^\s*\|?[\s:-]*-[\s|:-]*\|?\s*$/
const HORIZONTAL_RULE = /^(?:-{3,}|\*{3,}|_{3,})$/
const HEADING = /^(#{1,6})\s+(.*)$/
const BULLET_ITEM = /^[-*]\s+(.*)$/
const ORDERED_ITEM = /^\d+\.\s+(.*)$/
/** Baris yang mengakhiri sebuah paragraf karena ia memulai blok lain. */
const BLOCK_START = /^(?:#{1,6}\s|[-*]\s|\d+\.\s|>|```)/

interface InlinePattern {
	pattern: RegExp
	mark: (match: RegExpExecArray) => DocMark
	inner: (match: RegExpExecArray) => string
	/** Isi `code` bersifat harfiah - tanda bintang di dalamnya bukan penanda gaya. */
	literal?: boolean
}

const INLINE_PATTERNS: InlinePattern[] = [
	{ pattern: /`([^`\n]+)`/, mark: () => ({ type: 'code' }), inner: (m) => m[1], literal: true },
	{
		pattern: /\[([^\]\n]+)\]\(([^)\s]+)\)/,
		mark: (m) => ({ type: 'link', attrs: { href: m[2] } }),
		inner: (m) => m[1],
	},
	// Tebal dicari sebelum miring dan isinya boleh memuat bintang, supaya
	// "**tebal dan *miring* sekaligus**" tidak terbaca sebagai miring tunggal.
	{ pattern: /\*\*([^\n]+?)\*\*/, mark: () => ({ type: 'bold' }), inner: (m) => m[1] },
	{ pattern: /__([^\n]+?)__/, mark: () => ({ type: 'bold' }), inner: (m) => m[1] },
	{ pattern: /(?<!\*)\*(?!\*)([^*\n]+?)\*(?!\*)/, mark: () => ({ type: 'italic' }), inner: (m) => m[1] },
	{
		pattern: /(?<![A-Za-z0-9_])_([^_\n]+)_(?![A-Za-z0-9_])/,
		mark: () => ({ type: 'italic' }),
		inner: (m) => m[1],
	},
]

function textNode(text: string, marks: DocMark[]): DocNode {
	return marks.length > 0 ? { type: 'text', text, marks } : { type: 'text', text }
}

/**
 * Penanda paling kiri yang menang, lalu sisanya diproses ulang - dengan begitu
 * `**tebal *miring* **` bersarang tanpa perlu parser bertingkat.
 */
export function inlineNodes(text: string, marks: DocMark[] = []): DocNode[] {
	let earliest: { match: RegExpExecArray; spec: InlinePattern } | null = null
	for (const spec of INLINE_PATTERNS) {
		const match = spec.pattern.exec(text)
		if (match && (!earliest || match.index < earliest.match.index)) earliest = { match, spec }
	}

	if (!earliest) return text ? [textNode(text, marks)] : []

	const { match, spec } = earliest
	const before = text.slice(0, match.index)
	const after = text.slice(match.index + match[0].length)
	const inner = spec.inner(match)
	const nested = [...marks, spec.mark(match)]

	return [
		...inlineNodes(before, marks),
		...(spec.literal ? (inner ? [textNode(inner, nested)] : []) : inlineNodes(inner, nested)),
		...inlineNodes(after, marks),
	]
}

function paragraph(text: string): DocNode {
	const content = inlineNodes(text)
	return content.length > 0 ? { type: 'paragraph', content } : { type: 'paragraph' }
}

function cells(line: string): string[] {
	return line
		.replace(/^\s*\|/, '')
		.replace(/\|\s*$/, '')
		.split('|')
		.map((cell) => cell.trim())
}

function isTableRow(line: string): boolean {
	return line.trim().startsWith('|') && line.includes('|', 1)
}

function tableCell(type: 'tableHeader' | 'tableCell', text: string): DocNode {
	return { type, content: [paragraph(text)] }
}

/** Satu blok Markdown per panggilan; mengembalikan node plus baris berikutnya. */
type BlockReader = (lines: string[], index: number) => { node: DocNode; next: number } | null

const readFencedCode: BlockReader = (lines, index) => {
	const opening = lines[index].trim()
	if (!opening.startsWith('```')) return null

	const language = opening.slice(3).trim()
	const body: string[] = []
	let cursor = index + 1
	while (cursor < lines.length && !lines[cursor].trim().startsWith('```')) {
		body.push(lines[cursor])
		cursor += 1
	}

	const text = body.join('\n')
	return {
		node: {
			type: 'codeBlock',
			attrs: { language: language || null },
			...(text ? { content: [{ type: 'text', text }] } : {}),
		},
		next: cursor + 1, // pagar penutup ikut dilewati
	}
}

const readTable: BlockReader = (lines, index) => {
	if (!isTableRow(lines[index])) return null
	if (index + 1 >= lines.length || !TABLE_DIVIDER.test(lines[index + 1])) return null

	const header = cells(lines[index])
	const rows: DocNode[] = [
		{ type: 'tableRow', content: header.map((cell) => tableCell('tableHeader', cell)) },
	]

	let cursor = index + 2
	while (cursor < lines.length && isTableRow(lines[cursor])) {
		const row = cells(lines[cursor])
		rows.push({
			type: 'tableRow',
			// Baris pendek dilengkapi sel kosong: tabel dengan jumlah kolom
			// tidak seragam ditolak skema ProseMirror.
			content: header.map((_, column) => tableCell('tableCell', row[column] ?? '')),
		})
		cursor += 1
	}

	return { node: { type: 'table', content: rows }, next: cursor }
}

const readHeading: BlockReader = (lines, index) => {
	const match = HEADING.exec(lines[index].trim())
	if (!match) return null

	return {
		node: { type: 'heading', attrs: { level: match[1].length }, content: inlineNodes(match[2]) },
		next: index + 1,
	}
}

const readHorizontalRule: BlockReader = (lines, index) =>
	HORIZONTAL_RULE.test(lines[index].trim()) ? { node: { type: 'horizontalRule' }, next: index + 1 } : null

const readList: BlockReader = (lines, index) => {
	const bullet = BULLET_ITEM.test(lines[index].trim())
	const ordered = ORDERED_ITEM.test(lines[index].trim())
	if (!bullet && !ordered) return null

	const item = bullet ? BULLET_ITEM : ORDERED_ITEM
	const items: DocNode[] = []
	let cursor = index
	while (cursor < lines.length) {
		const match = item.exec(lines[cursor].trim())
		if (!match) break
		items.push({ type: 'listItem', content: [paragraph(match[1])] })
		cursor += 1
	}

	return { node: { type: bullet ? 'bulletList' : 'orderedList', content: items }, next: cursor }
}

const readBlockquote: BlockReader = (lines, index) => {
	if (!lines[index].trim().startsWith('>')) return null

	const quoted: string[] = []
	let cursor = index
	while (cursor < lines.length && lines[cursor].trim().startsWith('>')) {
		quoted.push(lines[cursor].trim().replace(/^>\s?/, ''))
		cursor += 1
	}

	return { node: { type: 'blockquote', content: [paragraph(quoted.join(' '))] }, next: cursor }
}

const readParagraph: BlockReader = (lines, index) => {
	const collected: string[] = [lines[index].trim()]
	let cursor = index + 1

	while (cursor < lines.length) {
		const line = lines[cursor].trim()
		if (!line || isTableRow(lines[cursor]) || BLOCK_START.test(line) || HORIZONTAL_RULE.test(line)) break
		collected.push(line)
		cursor += 1
	}

	return { node: paragraph(collected.join(' ')), next: cursor }
}

const BLOCK_READERS: BlockReader[] = [
	readFencedCode,
	readTable,
	readHorizontalRule,
	readHeading,
	readList,
	readBlockquote,
	readParagraph,
]

/**
 * HTML rancangan satu halaman, kalau jawabannya memang berupa itu.
 *
 * Deteksinya sengaja sempit: seluruh jawaban harus **hanya** satu pagar
 * ```html, paling banyak didahului satu baris judul. Prosa sebelum atau
 * sesudahnya membatalkannya, dan itu justru maksudnya - artikel yang memuat
 * contoh HTML adalah dokumen, dan potongan itu memang harus tetap jadi blok
 * kode. Menebak lebih agresif berarti sesekali menelan naskah pengguna ke dalam
 * bingkai terkurung, dan itu kesalahan yang jauh lebih mahal daripada
 * kebalikannya.
 *
 * Judul di depan dibiarkan lewat karena model sering tetap menuliskannya meski
 * diminta hanya satu pagar - dan judul itu berguna: `headingTitle` memungutnya
 * sebagai judul dokumen, jadi ia tidak hilang, hanya pindah tempat.
 */
/** Jawaban yang seluruhnya satu pagar ```html, atau null. */
function fencedHtml(lines: readonly string[]): string | null {
	if (lines.length === 0 || !HTML_FENCE.test(lines[0].trim())) return null

	const body: string[] = []
	let cursor = 1
	while (cursor < lines.length && !lines[cursor].trim().startsWith('```')) {
		body.push(lines[cursor])
		cursor += 1
	}
	// Pagar yang tidak pernah ditutup berarti jawabannya terpotong; menyimpannya
	// sebagai rancangan berarti menyimpan HTML yang separuh.
	if (cursor >= lines.length) return null

	for (let after = cursor + 1; after < lines.length; after += 1) {
		if (lines[after].trim()) return null
	}

	return body.join('\n').trim() || null
}

/**
 * Jawaban yang berupa HTML telanjang, tanpa pagar sama sekali.
 *
 * Model yang diminta membalas dengan satu pagar kerap melewatkan pagarnya dan
 * langsung menuliskan `<!DOCTYPE html>`. Menolaknya berarti naskah itu jatuh ke
 * pengurai Markdown dan mendarat sebagai paragraf demi paragraf berisi tag -
 * hasil yang tidak berguna bagi siapa pun.
 *
 * Syaratnya tetap ketat: seluruh jawaban harus dibuka tanda `<` dan memuat tag
 * penutup. Prosa - dalam bahasa apa pun - praktis tidak pernah dimulai begitu.
 */
function bareHtml(text: string): string | null {
	const trimmed = text.trim()
	if (!trimmed.startsWith('<') || !trimmed.includes('</')) return null
	return trimmed
}

/**
 * Meratakan dokumen HTML utuh menjadi potongan yang muat di dalam blok.
 *
 * Bingkai blok menyediakan `<!doctype>`, `<html>`, `<head>` dan `<body>`-nya
 * sendiri (`html-sandbox.ts`), jadi dokumen utuh yang disisipkan apa adanya
 * menghasilkan `<body>` bersarang di dalam `<body>` - bentuk yang ditolerir
 * peramban dengan cara yang tidak bisa diramalkan.
 *
 * `<style>` di dalam `<head>` ikut dipindahkan, kalau tidak seluruh rancangan
 * kehilangan gayanya. Atribut pada `<body>` sendiri - yang kerap membawa latar
 * dan tinggi penuh - diselamatkan sebagai pembungkus `<div>`.
 */
function bodyMarkup(html: string): string {
	const body = /<body([^>]*)>([\s\S]*?)<\/body>/i.exec(html)
	if (!body) return html

	const head = /<head[^>]*>([\s\S]*?)<\/head>/i.exec(html)
	const styles = head ? (head[1].match(/<style[\s\S]*?<\/style>/gi) ?? []).join('\n') : ''
	const attributes = body[1].trim()
	const inner = attributes ? `<div ${attributes}>${body[2]}</div>` : body[2]

	return `${styles}\n${inner}`.trim()
}

export function singleHtmlBlock(markdown: string): string | null {
	const lines = markdown.replace(/\r\n/g, '\n').split('\n')

	let index = 0
	let headings = 0
	while (index < lines.length) {
		const line = lines[index].trim()
		if (!line) {
			index += 1
			continue
		}
		if (HEADING.test(line) && headings === 0) {
			headings += 1
			index += 1
			continue
		}
		break
	}

	const rest = lines.slice(index)
	const html = fencedHtml(rest) ?? bareHtml(rest.join('\n'))
	return html ? bodyMarkup(html) : null
}

function htmlBlockNode(html: string): DocNode {
	return {
		type: HTML_BLOCK,
		attrs: {
			html,
			fit: 'page',
			height: HTML_BLOCK_HEIGHT,
			// Potretan adalah turunan yang dibuat editor saat blok ini terlihat;
			// server tidak punya DOM untuk membuatnya, dan tidak perlu.
			snapshot: '',
			snapshotWidth: 0,
			snapshotHeight: 0,
		},
	}
}

export interface MarkdownDocOptions {
	/**
	 * Izin menjadikan jawaban satu-pagar-html sebagai blok rancangan alih-alih
	 * blok kode. Mati secara bawaan: mengubah pagar HTML menjadi rancangan tanpa
	 * diminta akan menelan contoh kode di dalam artikel teknis.
	 */
	allowHtmlBlock?: boolean
}

export function markdownToDoc(markdown: string, options: MarkdownDocOptions = {}): ProseMirrorDoc {
	if (options.allowHtmlBlock) {
		const html = singleHtmlBlock(markdown)
		if (html) return { type: 'doc', content: [htmlBlockNode(html)] }
	}

	const lines = markdown.replace(/\r\n/g, '\n').split('\n')
	const content: DocNode[] = []
	let index = 0

	while (index < lines.length) {
		if (!lines[index].trim()) {
			index += 1
			continue
		}

		for (const read of BLOCK_READERS) {
			const result = read(lines, index)
			if (!result) continue
			content.push(result.node)
			index = result.next
			break
		}
	}

	// Dokumen tanpa satu pun node ditolak editor; paragraf kosong adalah bentuk
	// "dokumen kosong" yang sama dengan yang dipakai DocumentsService.
	return { type: 'doc', content: content.length > 0 ? content : [{ type: 'paragraph' }] }
}

/**
 * Judul dari heading pertama, kalau ada. Dipakai saat pemanggil tidak mengirim
 * `title`: draf hampir selalu dibuka dengan "# Judulnya", dan itu judul yang
 * jauh lebih baik daripada potongan prompt.
 */
export function headingTitle(markdown: string): string | null {
	for (const line of markdown.replace(/\r\n/g, '\n').split('\n')) {
		const match = HEADING.exec(line.trim())
		if (!match) continue

		const text = inlineNodes(match[2])
			.map((node) => node.text ?? '')
			.join('')
			.trim()
		if (text) return text
	}
	return null
}
