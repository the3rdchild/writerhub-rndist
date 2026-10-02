import type { JSONContent } from '@tiptap/core'

/**
 * Impor PDF sebagai teks ("PDF atau teks - teks saja").
 *
 * Dulu berkas PDF hanya menghasilkan tab kosong: jalurnya membuat tab lalu
 * menitipkan berkas ke state yang segera dibuang `load` (uji editor 2 Okt,
 * SHL-4). Kini teksnya dibaca di peramban dengan pdf.js (lewat `unpdf`, tanpa
 * worker, dimuat hanya saat PDF diimpor) dan baris-barisnya disusun kembali
 * menjadi paragraf.
 */

/** Potongan teks dari pdf.js - bentuk `StructuredTextItem` milik unpdf. */
export interface PdfTextItem {
	str: string
	x: number
	y: number
	width: number
	fontSize: number
	hasEOL: boolean
}

export interface PdfLine {
	text: string
	/** Tepi kiri baris. */
	x: number
	/** Tepi kanan baris. */
	right: number
	/** Garis dasar baris (koordinat PDF: makin ke bawah makin kecil). */
	y: number
	fontSize: number
	page: number
}

/** Nomor halaman yang berdiri sendiri - tidak ikut menjadi isi. */
const PAGE_NUMBER = /^\s*(?:\d{1,4}|[ivxlcdm]{1,7})\s*$/i
const SENTENCE_END = /[.!?:;"”)\]]$/
const LIST_MARKER = /^(?:\d{1,3}[.)]|[a-z][.)]|[•·▪◦–-])\s+\S/
const NUMBERED_HEADING = /^(?:\d+(?:\.\d+)+\.?|BAB\s+[IVXLC\d]+)\s+\S/i

/** Baris yang berdiri sebagai judul: huruf kapital semua, "BAB …", atau "3.1 Judul" yang pendek. */
function headingLike(line: PdfLine, widest: number): boolean {
	const letters = line.text.replace(/[^A-Za-zÀ-ÿ]/g, '')
	if (letters.length >= 3 && letters === letters.toUpperCase() && line.text.length <= 90) return true
	return NUMBERED_HEADING.test(line.text) && line.right - line.x < widest * 0.8
}

function median(values: number[]): number {
	if (values.length === 0) return 0
	const sorted = [...values].sort((a, b) => a - b)
	return sorted[Math.floor(sorted.length / 2)]
}

/** Gabungkan potongan pdf.js menjadi baris, per halaman. */
export function itemsToLines(pages: PdfTextItem[][]): PdfLine[] {
	const lines: PdfLine[] = []
	pages.forEach((items, page) => {
		let current: PdfLine | null = null
		const flush = () => {
			if (current && current.text.trim().length > 0) {
				current.text = current.text.replace(/\s+/g, ' ').trim()
				lines.push(current)
			}
			current = null
		}
		for (const item of items) {
			if (!current) {
				current = {
					text: '',
					x: item.x,
					right: item.x + item.width,
					y: item.y,
					fontSize: item.fontSize,
					page,
				}
			}
			const line: PdfLine = current
			line.text += item.str
			if (item.str.trim().length > 0) {
				line.x = Math.min(line.x, item.x)
				line.right = Math.max(line.right, item.x + item.width)
				line.fontSize = Math.max(line.fontSize, item.fontSize)
			}
			if (item.hasEOL) flush()
		}
		flush()
	})
	return lines
}

/**
 * Susun baris menjadi paragraf. Paragraf baru dimulai bila celah vertikal jauh
 * lebih besar dari jarak baris biasa, ukuran huruf berganti (judul), baris
 * menjorok ke dalam setelah kalimat selesai, atau baris sebelumnya pendek dan
 * berakhir dengan tanda titik. Pemenggalan kata ("data-\nbase") disambung.
 */
export function linesToParagraphs(input: PdfLine[]): string[] {
	const lines = input.filter((line) => !PAGE_NUMBER.test(line.text))
	if (lines.length === 0) return []

	const bodySize = median(lines.map((line) => line.fontSize))
	const gaps: number[] = []
	for (let index = 1; index < lines.length; index += 1) {
		const previous = lines[index - 1]
		const line = lines[index]
		const gap = previous.y - line.y
		if (line.page === previous.page && gap > 0 && Math.abs(line.fontSize - bodySize) < 0.5) gaps.push(gap)
	}
	const lineGap = median(gaps) || bodySize * 1.2

	const leftByPage = new Map<number, number>()
	const widestByPage = new Map<number, number>()
	for (const line of lines) {
		leftByPage.set(line.page, Math.min(leftByPage.get(line.page) ?? line.x, line.x))
		widestByPage.set(line.page, Math.max(widestByPage.get(line.page) ?? 0, line.right - line.x))
	}

	const paragraphs: string[] = []
	let current = lines[0].text
	for (let index = 1; index < lines.length; index += 1) {
		const previous = lines[index - 1]
		const line = lines[index]
		const ended = SENTENCE_END.test(previous.text)
		const left = leftByPage.get(line.page) ?? line.x
		const widest = widestByPage.get(previous.page) ?? 0
		const samePage = line.page === previous.page
		const gap = previous.y - line.y

		const breaks =
			headingLike(line, widestByPage.get(line.page) ?? widest) ||
			headingLike(previous, widest) ||
			Math.abs(line.fontSize - previous.fontSize) > 0.5 ||
			(samePage && (gap > lineGap * 1.5 || gap < 0)) ||
			(ended && line.x - left > bodySize * 0.8) ||
			(ended && LIST_MARKER.test(line.text)) ||
			(ended && previous.right - previous.x < widest * 0.75) ||
			(!samePage && ended)

		if (breaks) {
			paragraphs.push(current)
			current = line.text
		} else if (/[A-Za-z]-$/.test(current) && /^[a-z]/.test(line.text)) {
			current = current.slice(0, -1) + line.text
		} else {
			current = `${current} ${line.text}`
		}
	}
	paragraphs.push(current)
	return paragraphs
}

export function paragraphsToDocContent(paragraphs: string[]): JSONContent {
	return {
		type: 'doc',
		content:
			paragraphs.length > 0
				? paragraphs.map((text) => ({ type: 'paragraph', content: [{ type: 'text', text }] }))
				: [{ type: 'paragraph' }],
	}
}

export function isPdf(file: File): boolean {
	return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
}

export interface PdfImport {
	content: JSONContent
	pages: number
	paragraphs: number
}

export async function importPdfText(file: File): Promise<PdfImport> {
	const { extractTextItems } = await import('unpdf')
	const { totalPages, items } = await extractTextItems(new Uint8Array(await file.arrayBuffer()))
	const paragraphs = linesToParagraphs(itemsToLines(items))
	return { content: paragraphsToDocContent(paragraphs), pages: totalPages, paragraphs: paragraphs.length }
}
