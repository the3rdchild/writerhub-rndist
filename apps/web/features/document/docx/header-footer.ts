import type { JSONContent } from '@tiptap/core'
import type {
	FurnitureSlot,
	FurnitureVariant,
	PageFurniture,
	PageFurnitureLine,
} from '@/features/editor/page-furniture/model'
import { type ParseContext, readRelationships } from './context'
import { paragraphBlocks } from './parse'
import { attr, child, children, descend, tagName, val, type XmlParser } from './xml'
import { type DocxArchive, resolvePath } from './zip'

/**
 * Pembaca header/footer DOCX.
 *
 * Meniru warisan antar-section Word secara longgar: referensi pertama yang
 * ditemukan untuk tiap (slot, varian) dipakai untuk seluruh dokumen — pola
 * yang dipakai templat satu-jenis perabot (mis. IEEE). Section yang tidak
 * punya referensi memang mewarisi section sebelumnya, jadi referensi pertama
 * adalah dasar yang benar.
 *
 * Dengan `context`, paragraf lengkap juga dibaca sebagai isi kaya (T6):
 * field PAGE/NUMPAGES ditanam sebagai token {page}/{pages} dulu, lalu
 * paragrafnya memakai pembaca yang sama dengan badan naskah.
 */

/** Isi kaya per slot+varian — paragraf JSON untuk fragmen ydoc. */
export type FurnitureContent = Partial<
	Record<FurnitureSlot, Partial<Record<FurnitureVariant, JSONContent[]>>>
>

const VARIANTS: Record<string, 'default' | 'first' | 'even'> = {
	default: 'default',
	first: 'first',
	even: 'even',
}

function relsPathOf(part: string): string {
	const slash = part.lastIndexOf('/')
	return slash === -1 ? `_rels/${part}.rels` : `${part.slice(0, slash)}/_rels/${part.slice(slash + 1)}.rels`
}

function alignOf(paragraph: Element): PageFurnitureLine['align'] {
	const jc = val(child(child(paragraph, 'pPr'), 'jc'))
	if (jc === 'center') return 'center'
	if (jc === 'right' || jc === 'end') return 'right'
	return 'left'
}

const CONTAINERS = new Set(['hyperlink', 'sdt', 'sdtContent', 'smartTag', 'ins'])

/** Ambil teks paragraf pertama yang tidak kosong; field PAGE jadi token {page}. */
function lineOf(root: Element): PageFurnitureLine | null {
	for (const paragraph of children(root, 'p')) {
		const pieces: string[] = []
		let page = false

		const walk = (element: Element): void => {
			for (const node of children(element)) {
				const name = tagName(node)
				if (name === 'r') {
					for (const run of children(node)) {
						const runName = tagName(run)
						if (runName === 't') pieces.push(run.textContent ?? '')
						else if (runName === 'instrText' && (run.textContent ?? '').includes('PAGE')) page = true
					}
				} else if (CONTAINERS.has(name)) {
					walk(node)
				}
			}
		}
		walk(paragraph)

		if (page) pieces.push('{page}')
		const text = pieces.join('').replace(/\s+/g, ' ').trim()
		if (text) return { text, align: alignOf(paragraph) }
	}
	return null
}

/** Semua elemen bertag `name` di seluruh subtree. */
function descendAllOf(root: Element, name: string): Element[] {
	const found: Element[] = []
	const walk = (element: Element): void => {
		for (const node of children(element)) {
			if (tagName(node) === name) found.push(node)
			walk(node)
		}
	}
	walk(root)
	return found
}

/**
 * Ganti rangkaian run field PAGE/NUMPAGES dengan satu run berisi token
 * {page}/{pages}. Tanpa ini pembaca paragraf melihat angka singgahannya
 * ("3") — nomor yang basi — dan field-nya hilang.
 */
function plantFieldTokens(root: Element): void {
	const document = root.ownerDocument
	if (!document) return
	/* Elemen buatan harus membawa namespace W — createElement polos menghasilkan
	 * node tanpa namespace yang tak terbaca pembaca paragraf. */
	const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'

	for (const paragraph of [...descendAllOf(root, 'p')]) {
		const runs = children(paragraph).filter((node) => tagName(node) === 'r')
		let open = -1
		let token: string | null = null

		const flush = (end: number): void => {
			if (open < 0 || token === null) return
			const replacement = document.createElementNS(W_NS, 'w:r')
			const text = document.createElementNS(W_NS, 'w:t')
			text.textContent = token
			replacement.appendChild(text)
			paragraph.replaceChild(replacement, runs[open])
			for (let index = open + 1; index <= end; index += 1) paragraph.removeChild(runs[index])
			open = -1
			token = null
		}

		for (const [index, run] of runs.entries()) {
			const fldChar = child(run, 'fldChar')
			const instr = child(run, 'instrText')
			if (fldChar && attr(fldChar, 'fldCharType') === 'begin') {
				open = index
				token = null
				continue
			}
			if (instr) {
				const code = (instr.textContent ?? '').trim().toUpperCase()
				if (code === 'PAGE' || code === 'NUMPAGES') token = code === 'PAGE' ? '{page}' : '{pages}'
				continue
			}
			if (fldChar && attr(fldChar, 'fldCharType') === 'end') {
				flush(index)
			}
		}
	}
}

/** Paragraf lengkap sebuah bagian header/footer sebagai blok JSON. */
function blocksOf(root: Element, context: ParseContext): JSONContent[] {
	plantFieldTokens(root)
	const blocks: JSONContent[] = []
	for (const paragraph of children(root, 'p')) {
		blocks.push(...paragraphBlocks(paragraph, context))
	}
	return blocks
}

function collectReferences(
	sectPr: Element,
	archive: DocxArchive,
	parse: XmlParser,
	mainPart: string,
	relationships: ReturnType<typeof readRelationships>,
	found: PageFurniture,
	content: FurnitureContent,
	context?: ParseContext,
): void {
	for (const reference of children(sectPr)) {
		const name = tagName(reference)
		if (name !== 'headerReference' && name !== 'footerReference') continue

		const slot = name === 'headerReference' ? 'header' : 'footer'
		const variant = VARIANTS[attr(reference, 'type') ?? 'default'] ?? 'default'
		if (found[slot]?.[variant]) continue

		const id = attr(reference, 'id')
		if (!id) continue
		const relationship = relationships.get(id)
		if (!relationship || relationship.external) continue

		const source = archive.text(resolvePath(mainPart, relationship.target))
		if (!source) continue

		const root = parse(source)
		const line = lineOf(root)
		if (line) {
			const slotLines = found[slot] ?? {}
			slotLines[variant] = line
			found[slot] = slotLines
		}
		if (context) {
			const blocks = blocksOf(root, context)
			if (blocks.length > 0) {
				const slotContent = content[slot] ?? {}
				slotContent[variant] = blocks
				content[slot] = slotContent
			}
		}
	}
}

/**
 * Baca seluruh referensi header/footer dari semua sectPr dokumen utama.
 * `found` berisi baris lama; `content` (dengan `context`) berisi paragraf kaya.
 * Mengembalikan null bila tidak ada satu pun yang bisa dibaca.
 */
export function readFurniture(
	archive: DocxArchive,
	parse: XmlParser,
	mainPart: string,
	context?: ParseContext,
): { furniture: PageFurniture | null; content: FurnitureContent | null } {
	const source = archive.text(mainPart)
	if (!source) return { furniture: null, content: null }
	const body = descend(parse(source), 'body')
	if (!body) return { furniture: null, content: null }

	const relsSource = archive.text(relsPathOf(mainPart))
	const relationships = relsSource ? readRelationships(parse(relsSource)) : new Map()

	const found: PageFurniture = {}
	const content: FurnitureContent = {}
	const collect = (sectPr: Element) =>
		collectReferences(sectPr, archive, parse, mainPart, relationships, found, content, context)

	const visit = (parent: Element): void => {
		for (const node of children(parent)) {
			const name = tagName(node)
			if (name === 'p') {
				const sectPr = descend(node, 'pPr', 'sectPr')
				if (sectPr) collect(sectPr)
			} else if (name === 'sectPr') {
				collect(node)
			} else if (name === 'sdt') {
				const inner = child(node, 'sdtContent')
				if (inner) visit(inner)
			}
		}
	}
	visit(body)

	const hasAny =
		Object.values(found.header ?? {}).some(Boolean) || Object.values(found.footer ?? {}).some(Boolean)
	const hasContent = (['header', 'footer'] as FurnitureSlot[]).some(
		(slot) => Object.keys(content[slot] ?? {}).length > 0,
	)
	return {
		furniture: hasAny ? found : null,
		content: hasContent ? content : null,
	}
}
