import type { JSONContent } from '@tiptap/core'
import type { PageFurniture } from '@/features/editor/page-furniture/model'
import type { CommentThread } from '@/features/sessions/types'
import { createParseState, type ParseContext, readRelationships, readTheme } from './context'
import { readFurniture } from './header-footer'
import { createNumberer, readNumbering } from './numbering'
import { bodyOf, readBody } from './parse'
import { readStyles } from './properties'
import type { PageSetupPatch } from './sections'
import { attr, children, createXmlParser, type XmlParser } from './xml'
import { type DocxArchive, openDocx, resolvePath } from './zip'

export type { PageSetupPatch } from './sections'

export interface ImportWarning {
	message: string
}

export interface DocxImport {
	content: JSONContent
	pageSetup?: PageSetupPatch
	furniture?: PageFurniture
	comments: CommentThread[]
	warnings: ImportWarning[]
}

const OFFICE_DOCUMENT = 'officeDocument'
const DEFAULT_MAIN_PART = 'word/document.xml'

function relsPathOf(part: string): string {
	const slash = part.lastIndexOf('/')
	return slash === -1 ? `_rels/${part}.rels` : `${part.slice(0, slash)}/_rels/${part.slice(slash + 1)}.rels`
}

function mainPartOf(archive: DocxArchive, parse: XmlParser): string {
	const source = archive.text('_rels/.rels')
	if (!source) return DEFAULT_MAIN_PART

	try {
		for (const [, relationship] of readRelationships(parse(source))) {
			if (relationship.external || !relationship.type.endsWith(`/${OFFICE_DOCUMENT}`)) continue

			const target = resolvePath('', relationship.target)
			if (archive.bytes(target)) return target
		}
	} catch {}
	return DEFAULT_MAIN_PART
}

function partByType(
	archive: DocxArchive,
	parse: XmlParser,
	mainPart: string,
	suffix: string,
): Element | null {
	const source = archive.text(relsPathOf(mainPart))
	if (!source) return null

	try {
		for (const [, relationship] of readRelationships(parse(source))) {
			if (relationship.external || !relationship.type.endsWith(`/${suffix}`)) continue

			const content = archive.text(resolvePath(mainPart, relationship.target))
			if (content) return parse(content)
		}
	} catch {
		return null
	}
	return null
}

const SKIPPED_LABELS: Record<string, string> = {
	drawing: 'gambar',
	pict: 'gambar',
	object: 'objek tertanam',
	'pratinjau-emf': 'pratinjau objek tertanam (format EMF/WMF)',
	AlternateContent: 'kotak teks atau bentuk',
	'tautan-internal': 'tautan internal (bookmark)',
	'jarak-huruf': 'perenggangan huruf',
	'posisi-teks': 'posisi teks vertikal',
	'garis-paragraf': 'garis batas paragraf',
	'penomoran-halaman': 'penomoran halaman khusus (romawi/titik mulai)',
	'teks-tersembunyi': 'teks tersembunyi (hidden text)',
}

/**
 * Sebab yang punya kalimat peringatannya sendiri. Tanpa daftar ini ia ikut
 * terbawa ke "Bagian yang tidak dikenali dilewati" - dilaporkan dua kali,
 * yang kedua dengan nama tag mentah.
 */
const BESPOKE_SKIPS = new Set(['revisi', 'daftar-isi-tanpa-penutup'])

function warningsFor(
	skipped: Map<string, number>,
	archive: DocxArchive,
	furniture: PageFurniture | null,
): ImportWarning[] {
	const warnings: ImportWarning[] = []

	const counted = new Map<string, number>()
	const unknown: string[] = []
	for (const [name, count] of skipped) {
		if (BESPOKE_SKIPS.has(name)) continue
		const label = SKIPPED_LABELS[name]
		if (label) counted.set(label, (counted.get(label) ?? 0) + count)
		else unknown.push(name)
	}

	for (const [label, count] of counted) {
		warnings.push({ message: `${count} ${label} belum ikut terbawa dan akan menyusul.` })
	}

	// Revisi terlacak: isinya diterima (perilaku benar), tapi pengguna perlu
	// tahu bahwa impor ini setara "Accept All Changes".
	const revisions = skipped.get('revisi') ?? 0
	if (revisions > 0) {
		warnings.push({
			message: `${revisions} revisi terlacak diterima otomatis (insertion disimpan, deletion dibuang).`,
		})
	}

	// Daftar isi tanpa penutup: pengaman menghentikan penelanan, tapi yang
	// terlanjur tertelan tidak kembali - itu kehilangan isi, bukan kosmetik.
	if ((skipped.get('daftar-isi-tanpa-penutup') ?? 0) > 0) {
		warnings.push({
			message:
				'Ada daftar isi yang tidak punya penutup di berkasnya; isi tepat di bawahnya ikut tertelan dan tidak terbawa.',
		})
	}

	if (unknown.length > 0) {
		warnings.push({ message: `Bagian yang tidak dikenali dilewati: ${unknown.sort().join(', ')}.` })
	}

	const hasHeaderFooter = archive.paths().some((path) => /^word\/(header|footer)\d*\.xml$/.test(path))
	if (hasHeaderFooter && !furniture) {
		warnings.push({
			message:
				'Header, footer, dan nomor halaman tidak punya padanan di editor ini, jadi tidak ikut terbawa.',
		})
	}

	return warnings
}

/** `word/footnotes.xml` — id Word → konten inline catatan kaki. */
function readFootnotes(root: Element | null): Map<number, JSONContent[]> {
	const footnotes = new Map<number, JSONContent[]>()
	if (!root) return footnotes

	for (const footnote of children(root, 'footnote')) {
		const id = Number.parseInt(attr(footnote, 'id') ?? '', 10)
		const type = attr(footnote, 'type')
		// id 0/-1 dan type separator/continuationSeparator adalah pemisah bawaan.
		if (!Number.isFinite(id) || id <= 0 || type) continue

		const inline: JSONContent[] = []
		const paragraphs = children(footnote, 'p')
		paragraphs.forEach((paragraph, index) => {
			for (const node of children(paragraph, 'r')) {
				for (const text of children(node, 't')) {
					const value = text.textContent ?? ''
					if (value) inline.push({ type: 'text', text: value })
				}
			}
			// Paragraf berikutnya dipisah satu spasi — node catatan hanya berisi inline.
			if (inline.length > 0 && index < paragraphs.length - 1) {
				inline.push({ type: 'text', text: ' ' })
			}
		})
		footnotes.set(id, inline)
	}
	return footnotes
}

/** Metadata komentar Word: id → penulis, tanggal, dan isi teksnya. */
function readCommentMeta(root: Element | null): Map<string, { author: string; date?: string; text: string }> {
	const meta = new Map<string, { author: string; date?: string; text: string }>()
	if (!root) return meta

	for (const comment of children(root, 'comment')) {
		const id = attr(comment, 'id')
		if (!id) continue

		let text = ''
		for (const paragraph of children(comment, 'p')) {
			for (const node of children(paragraph, 'r')) {
				for (const value of children(node, 't')) text += value.textContent ?? ''
			}
		}

		meta.set(id, {
			author: attr(comment, 'author') ?? 'Anonim',
			...(attr(comment, 'date') ? { date: attr(comment, 'date') } : {}),
			text: text.trim(),
		})
	}
	return meta
}

function commentThreadId(id: string): string {
	return `w-${id}`
}

function slugOf(author: string): string {
	return (
		author
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-+|-+$/g, '')
			.slice(0, 24) || 'anonim'
	)
}

export async function readDocx(data: Uint8Array): Promise<DocxImport> {
	const archive = openDocx(data)
	const parse = await createXmlParser()

	const mainPart = mainPartOf(archive, parse)
	const source = archive.text(mainPart)
	if (!source) throw new Error('DOCX ini tidak berisi bagian dokumen utama')

	const body = bodyOf(parse(source))
	if (!body) throw new Error('Bagian utama DOCX ini tidak punya badan dokumen')

	const relationshipsSource = archive.text(relsPathOf(mainPart))
	const numberingRoot = partByType(archive, parse, mainPart, 'numbering')
	const context: ParseContext = {
		styles: readStyles(partByType(archive, parse, mainPart, 'styles')),
		theme: readTheme(partByType(archive, parse, mainPart, 'theme')),
		numberer: createNumberer(readNumbering(numberingRoot)),
		relationships: relationshipsSource ? readRelationships(parse(relationshipsSource)) : new Map(),
		archive,
		mainPart,
		footnotes: readFootnotes(partByType(archive, parse, mainPart, 'footnotes')),
		commentMeta: readCommentMeta(partByType(archive, parse, mainPart, 'comments')),
		state: createParseState(),
	}

	const { blocks, pageSetup } = readBody(body, context)
	const furniture = readFurniture(archive, parse, mainPart)

	// Komentar Word masuk dengan nama penulis aslinya — identitas di comments.xml.
	const comments: CommentThread[] = []
	for (const [id, quote] of context.state.commentQuotes) {
		const meta = context.commentMeta.get(id)
		if (!meta) continue

		const at = meta.date ? Date.parse(meta.date) : Date.now()
		comments.push({
			id: commentThreadId(id),
			quote: quote.trim().slice(0, 300),
			author: meta.author,
			authorId: `word-${slugOf(meta.author)}`,
			replies: [
				{
					author: meta.author,
					authorId: `word-${slugOf(meta.author)}`,
					text: meta.text,
					at: Number.isFinite(at) ? at : Date.now(),
				},
			],
			resolved: false,
			createdAt: Number.isFinite(at) ? at : Date.now(),
		})
	}

	return {
		content: { type: 'doc', content: blocks.length > 0 ? blocks : [{ type: 'paragraph' }] },
		pageSetup,
		...(furniture ? { furniture } : {}),
		comments,
		warnings: warningsFor(context.state.skipped, archive, furniture),
	}
}
