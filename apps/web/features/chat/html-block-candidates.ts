import type { Node as PMNode } from '@tiptap/pm/model'

/**
 * Mencari HTML yang terlanjur mendarat sebagai naskah biasa, supaya bisa
 * diubah jadi blok rancangan tanpa ditulis ulang.
 *
 * Dua bentuk yang benar-benar terjadi:
 *
 * - **Blok kode** berisi HTML. Model menuliskannya sebagai contoh kode, atau
 *   penulis menempelnya begitu. Ini kasus yang bersih: teksnya masih utuh.
 * - **Deretan blok biasa** yang isinya HTML. Terjadi saat HTML masuk lewat
 *   pengurai Markdown - tiap baris jadi paragraf, dan baris yang diawali `-`
 *   jadi butir daftar. Pemulihannya *terbaik yang bisa*: teksnya kembali, tapi
 *   penanda daftar yang sudah termakan tidak bisa dikembalikan. Tetap jauh
 *   lebih baik daripada meminta model menulis ulang seluruh rancangan - itu
 *   yang membuatnya berpikir dua menit untuk pekerjaan yang seharusnya sesaat.
 */

export interface HtmlCandidate {
	from: number
	to: number
	html: string
	/** Dari mana ia dipungut, untuk dilaporkan ke model. */
	source: 'codeBlock' | 'blocks'
}

/** Ambang yang memisahkan "teks yang memuat tanda kurung siku" dari markup. */
const MIN_TAGS = 2

/**
 * Tag pembuka maupun penutup ikut dihitung. Membatasi hitungan pada tag pembuka
 * saja membuat potongan sah yang paling pendek - satu elemen yang dibuka lalu
 * ditutup - gagal mencapai ambangnya, padahal justru itu bentuk markup yang
 * paling tidak ambigu.
 */
const TAG = /<\/?[a-z!][^>]*>/gi

function looksLikeHtml(text: string): boolean {
	const trimmed = text.trim()
	if (!trimmed.startsWith('<')) return false
	if (!trimmed.includes('</')) return false
	return (trimmed.match(TAG) ?? []).length >= MIN_TAGS
}

/**
 * Kandidat di seluruh dokumen, terpanjang lebih dulu.
 *
 * Urutan itu disengaja: rancangan yang pecah menjadi dua puluh paragraf harus
 * kalah dari dirinya sendiri sebagai satu deret utuh, bukan diambil sepotong.
 */
export function htmlCandidates(doc: PMNode): HtmlCandidate[] {
	const found: HtmlCandidate[] = []
	const blocks: Array<{ node: PMNode; from: number; to: number }> = []

	doc.forEach((node, offset) => {
		blocks.push({ node, from: offset, to: offset + node.nodeSize })
	})

	for (const block of blocks) {
		if (block.node.type.name !== 'codeBlock') continue
		const text = block.node.textContent
		if (!looksLikeHtml(text)) continue
		found.push({ from: block.from, to: block.to, html: text.trim(), source: 'codeBlock' })
	}

	// Deret blok biasa: dikumpulkan selama teksnya masih terbaca sebagai markup
	// yang belum tertutup, lalu diuji sebagai satu kesatuan.
	let start = -1
	let parts: string[] = []
	const flush = (end: number) => {
		if (start >= 0 && parts.length > 0) {
			const html = parts.join('\n').trim()
			if (looksLikeHtml(html)) found.push({ from: start, to: end, html, source: 'blocks' })
		}
		start = -1
		parts = []
	}

	for (const block of blocks) {
		const text = block.node.textContent.trim()
		const opens = start >= 0 || text.startsWith('<')
		if (text && opens && block.node.type.name !== 'codeBlock') {
			if (start < 0) start = block.from
			parts.push(block.node.textContent)
			continue
		}
		flush(block.from)
	}
	flush(doc.content.size)

	return found.sort((a, b) => b.to - b.from - (a.to - a.from))
}

/**
 * Ringkasan bentuk dokumen, untuk dilampirkan ke kerangka.
 *
 * Kerangka yang hanya berisi judul membuat dokumen tanpa judul terbaca
 * "kosong", dan model lalu membaca isinya berkali-kali demi menebak apa yang
 * ada di sana - satu permintaan sederhana sempat menghabiskan puluhan langkah
 * hanya untuk itu. Beberapa baris di sini menggantikan seluruh penelusuran itu,
 * termasuk perbedaan yang paling sering salah dibaca: HTML yang SUDAH menjadi
 * blok rancangan versus HTML yang masih tergeletak sebagai teks biasa.
 */
export function blockSummary(doc: PMNode): string {
	const counts = new Map<string, number>()
	doc.forEach((node) => {
		const name = node.type.name === 'htmlBlock' ? `htmlBlock (${node.attrs.fit ?? 'embed'})` : node.type.name
		counts.set(name, (counts.get(name) ?? 0) + 1)
	})
	if (counts.size === 0) return ''

	const lines = [`Blocks: ${[...counts].map(([name, total]) => `${total} ${name}`).join(', ')}`]

	const loose = htmlCandidates(doc).filter((candidate) => candidate.source !== 'codeBlock')
	const fenced = htmlCandidates(doc).filter((candidate) => candidate.source === 'codeBlock')
	if (loose.length > 0 || fenced.length > 0) {
		lines.push(
			`NOTE: this document holds HTML markup that is NOT rendered - it sits as ${
				loose.length > 0 ? 'ordinary text' : 'a code block'
			}. Call convert_to_html_block to render it in place; do not read it and re-send it through insert_html_block.`,
		)
	}

	return lines.join('\n')
}
