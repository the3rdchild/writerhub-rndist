import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { delimiter, join } from 'node:path'
import { strFromU8, unzipSync } from 'fflate'

/**
 * Fakta dari berkas hasil use case - DOCX dan PDF - bukan dari klaim model.
 *
 * Putaran uji sebelumnya membuktikan klaim tidak bisa dipegang: AI melaporkan
 * "selesai" untuk dokumen tanpa gambar yang dijanjikan outline. Yang dihitung di
 * sini hanya yang benar-benar ada di berkas: tabel, gambar, seksi kolom,
 * halaman, dan urutan blok untuk menilai kerusakan struktur.
 */

export type Block =
	| { kind: 'heading'; level: number; text: string }
	| { kind: 'paragraph'; text: string; images: number }
	| { kind: 'table'; text: string; images: number }

export interface DocxFacts {
	/** Blok tingkat atas, berurutan. */
	blocks: Block[]
	tables: number
	images: number
	media: number
	/** Jumlah kolom tiap seksi yang berkolom (`w:cols w:num`). */
	columnSections: number[]
	words: number
	text: string
}

export interface PdfFacts {
	pages: number
	/** Nomor halaman (mulai 1) yang tanpa teks sama sekali. */
	blankPages: number[]
	text: string
}

export interface CaseFacts {
	docx: DocxFacts
	pdf: PdfFacts | null
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }

function decode(text: string): string {
	return text.replace(/&(amp|lt|gt|quot|apos);|&#(\d+);|&#x([0-9a-f]+);/gi, (_, name, dec, hex) =>
		name ? ENTITIES[name.toLowerCase()] : String.fromCodePoint(dec ? Number(dec) : Number.parseInt(hex, 16)),
	)
}

/** Teks satu potongan XML Word: `w:t`, dengan pindah baris lunak dan tab sebagai spasi. */
function runText(xml: string): string {
	return decode(
		xml
			.replace(/<w:(br|tab|cr)\b[^>]*\/>/g, '<w:t> </w:t>')
			.match(/<w:t(?:\s[^>]*)?>[^<]*<\/w:t>/g)
			?.map((run) => run.replace(/<[^>]+>/g, ''))
			.join('') ?? '',
	)
		.replace(/\s+/g, ' ')
		.trim()
}

/*
 * Blok tingkat atas `w:body`: paragraf dan tabel, berurutan. Paragraf di dalam
 * sel tabel bukan blok tersendiri - tabel bersarang dilompati utuh dengan
 * menghitung kedalaman `w:tbl`.
 */
function topLevelChunks(body: string): { kind: 'p' | 'tbl'; xml: string }[] {
	const chunks: { kind: 'p' | 'tbl'; xml: string }[] = []
	const start = /<w:(p|tbl)(?=[\s>/])/g
	let match = start.exec(body)
	while (match) {
		const from = match.index
		if (match[1] === 'tbl') {
			const edge = /<(\/?)w:tbl(?=[\s>])/g
			edge.lastIndex = from
			let depth = 0
			let end = body.length
			for (let tag = edge.exec(body); tag; tag = edge.exec(body)) {
				depth += tag[1] ? -1 : 1
				if (depth === 0) {
					end = body.indexOf('>', tag.index) + 1
					break
				}
			}
			chunks.push({ kind: 'tbl', xml: body.slice(from, end) })
			start.lastIndex = end
		} else {
			const open = body.indexOf('>', from)
			const selfClosing = body[open - 1] === '/'
			const close = selfClosing ? open + 1 : body.indexOf('</w:p>', open) + '</w:p>'.length
			chunks.push({ kind: 'p', xml: body.slice(from, close) })
			start.lastIndex = close
		}
		match = start.exec(body)
	}
	return chunks
}

export function docxFacts(bytes: Uint8Array): DocxFacts {
	const files = unzipSync(bytes)
	const documentXml = files['word/document.xml']
	if (!documentXml) throw new Error('Bukan DOCX: word/document.xml tidak ada')
	const xml = strFromU8(documentXml)
	const body = xml.slice(xml.indexOf('<w:body>'), xml.lastIndexOf('</w:body>'))

	const blocks: Block[] = topLevelChunks(body).map(({ kind, xml: chunk }) => {
		const text = runText(chunk)
		const images = chunk.split('<w:drawing>').length - 1
		if (kind === 'tbl') return { kind: 'table', text, images }
		const style = /<w:pStyle w:val="(Heading(\d)|Title)"/.exec(chunk)
		if (style) return { kind: 'heading', level: style[2] ? Number(style[2]) : 1, text }
		return { kind: 'paragraph', text, images }
	})
	const text = blocks.map((block) => block.text).join('\n')

	return {
		blocks,
		tables: xml.split('<w:tbl>').length - 1,
		images: xml.split('<w:drawing>').length - 1,
		media: Object.keys(files).filter((name) => name.startsWith('word/media/') && !name.endsWith('/')).length,
		columnSections: [...xml.matchAll(/<w:cols\b[^>]*\bw:num="(\d+)"/g)].map((cols) => Number(cols[1])),
		words: text.split(/\s+/).filter(Boolean).length,
		text,
	}
}

/**
 * Halaman kosong dari keluaran `pdftotext`.
 *
 * `pdftotext` menutup SETIAP halaman dengan `\f`, jadi potongan sesudah `\f`
 * terakhir selalu kosong dan bukan halaman. Alat uji lama menghitungnya, dan
 * hampir setiap PDF tercatat punya satu halaman kosong yang tidak ada.
 */
export function blankPages(pdftotext: string, pages: number): number[] {
	return pdftotext
		.split('\f')
		.slice(0, pages)
		.flatMap((page, index) => (page.trim() ? [] : [index + 1]))
}

/**
 * Folder biner poppler (`pdfinfo`, `pdftotext`): `POPPLER_BIN`, lalu PATH.
 * Tidak ada berarti galat, bukan uji yang dilewati diam-diam.
 */
export function popplerDir(): string {
	const candidates = [process.env.POPPLER_BIN, ...(process.env.PATH ?? '').split(delimiter)].filter(
		(dir): dir is string => Boolean(dir),
	)
	const found = candidates.find(
		(dir) => existsSync(join(dir, 'pdfinfo')) && existsSync(join(dir, 'pdftotext')),
	)
	if (!found) {
		throw new Error(
			'pdfinfo/pdftotext (poppler) tidak ditemukan. Pasang poppler-utils, atau arahkan POPPLER_BIN ke foldernya - di NixOS: nix build nixpkgs#poppler-utils --no-link --print-out-paths, lalu tambahkan /bin.',
		)
	}
	return found
}

export function pdfFacts(path: string, poppler = popplerDir()): PdfFacts {
	const info = execFileSync(join(poppler, 'pdfinfo'), [path], { encoding: 'utf8' })
	const pages = Number(/^Pages:\s+(\d+)/m.exec(info)?.[1] ?? 0)
	const text = execFileSync(join(poppler, 'pdftotext'), ['-layout', path, '-'], {
		encoding: 'utf8',
		maxBuffer: 64 * 1024 * 1024,
	})
	return { pages, blankPages: blankPages(text, pages), text }
}

export interface StructureDamage {
	/** Heading yang memuat paragraf isi - "Kata PengantarPuji syukur…" (T3). */
	headingsWithBody: string[]
	/** Judul tingkat 1-2 yang muncul lebih dari sekali (N5). */
	duplicateHeadings: string[]
	/** Heading tanpa isi sebelum heading setingkat atau lebih tinggi berikutnya (N5). */
	emptySections: string[]
}

const norm = (text: string) =>
	text
		.toLowerCase()
		.replace(/[\s.:]+$/, '')
		.replace(/\s+/g, ' ')
		.trim()

/*
 * Heading yang berisi paragraf: sangat panjang, atau cukup panjang dan memuat
 * batas kalimat di tengahnya. Judul skripsi yang panjang pun jarang melewati
 * 200 karakter, dan tidak pernah terdiri dari beberapa kalimat.
 */
const GENERATED = /^daftar\s+(isi|tabel|gambar|lampiran)\b/i

function holdsBody(text: string): boolean {
	return text.length > 200 || (text.length > 80 && /[.!?]["”’)]?\s+\S/.test(text))
}

export function structureDamage(blocks: readonly Block[]): StructureDamage {
	const headings = blocks.flatMap((block, index) => (block.kind === 'heading' ? [{ ...block, index }] : []))

	const counts = new Map<string, { text: string; count: number }>()
	for (const heading of headings) {
		const key = norm(heading.text)
		if (!key || heading.level > 2) continue
		const seen = counts.get(key)
		counts.set(key, { text: seen?.text ?? heading.text, count: (seen?.count ?? 0) + 1 })
	}

	/*
	 * Heading yang isinya menempel di dalamnya sudah terhitung di atas, dan
	 * daftar isi/tabel/gambar yang kosong adalah soal keterangan gambar, bukan
	 * kerangka - keduanya tidak dihitung lagi sebagai bagian kosong.
	 */
	const emptySections = headings.flatMap((heading, at) => {
		if (!heading.text || holdsBody(heading.text) || GENERATED.test(heading.text)) return []
		const next = headings[at + 1]
		if (next && next.level > heading.level) return []
		const between = blocks.slice(heading.index + 1, next?.index ?? blocks.length)
		const filled = between.some(
			(block) => block.kind === 'table' || block.text || ('images' in block && block.images > 0),
		)
		return filled ? [] : [heading.text]
	})

	return {
		headingsWithBody: headings.filter((heading) => holdsBody(heading.text)).map((heading) => heading.text),
		duplicateHeadings: [...counts.values()]
			.filter((entry) => entry.count > 1)
			.map((entry) => `${entry.text} (${entry.count}×)`),
		emptySections,
	}
}
